/**
 * @retune/worker entrypoint.
 *
 * Boots a Temporal worker against the shared task queue. Wires
 * persistence lazily so the worker can run against pglite locally
 * or real Postgres in production via env toggle.
 */

import { PostgresPersistence, build_worker } from "@retune/agent";
import {
  type PgDb,
  create_pglite,
  pglite_drizzle,
  postgres_drizzle,
  run_migrations,
  users,
} from "@retune/db/pg";

type PersistMode = "pglite" | "postgres";

function mode(): PersistMode {
  const raw = (process.env.RETUNE_PERSIST ?? "pglite").toLowerCase();
  if (raw !== "pglite" && raw !== "postgres") {
    throw new Error(`RETUNE_PERSIST must be pglite|postgres for the worker, got "${raw}"`);
  }
  if (raw === "postgres" && !process.env.RETUNE_DATABASE_URL) {
    throw new Error("RETUNE_PERSIST=postgres requires RETUNE_DATABASE_URL");
  }
  return raw;
}

async function acquire_deps(): Promise<{
  db: PgDb;
  persistence: PostgresPersistence;
  close: () => Promise<void>;
}> {
  if (mode() === "pglite") {
    const client = await create_pglite(process.env.RETUNE_PGLITE_DATADIR);
    await run_migrations({ kind: "pglite", client });
    const db = pglite_drizzle(client);
    // Dev user for FK target when workflows fire in.
    await db
      .insert(users)
      .values({
        email: "dev@retune.local",
        personaType: "experienced",
        market: "US",
        locale: "en-US",
      })
      .onConflictDoNothing();
    return {
      db,
      persistence: new PostgresPersistence(db),
      close: async () => {
        await client.close();
      },
    };
  }
  const { db, sql } = postgres_drizzle(process.env.RETUNE_DATABASE_URL as string);
  return {
    db,
    persistence: new PostgresPersistence(db),
    close: async () => {
      await sql.end();
    },
  };
}

async function main(): Promise<void> {
  // If RETUNE_TEMPORAL is not explicitly enabled, skip the worker entirely.
  // This prevents the infinite retry loop from flooding dev console output
  // when Temporal is not part of the local dev stack.
  if (!process.env.RETUNE_TEMPORAL && !process.env.RETUNE_TEMPORAL_ADDRESS) {
    console.log(
      "[worker] RETUNE_TEMPORAL not set — worker disabled. Set RETUNE_TEMPORAL=1 to enable.",
    );
    // Keep the process alive so turbo doesn't restart it, but do nothing.
    await new Promise(() => {});
    return;
  }

  const { db, persistence, close: close_db } = await acquire_deps();

  let worker;
  const address = process.env.RETUNE_TEMPORAL_ADDRESS ?? "localhost:7233";
  let attempts = 0;

  // Retry loop for Temporal connection — exponential backoff, capped at 60s
  while (true) {
    try {
      worker = await build_worker({
        deps: { db, persistence },
        address: process.env.RETUNE_TEMPORAL_ADDRESS,
        namespace: process.env.RETUNE_TEMPORAL_NAMESPACE,
      });
      break;
    } catch (err) {
      attempts++;
      const delay = Math.min(5000 * attempts, 60_000);
      console.warn(
        `[worker] waiting for temporal at ${address} (attempt ${attempts}, retry in ${delay / 1000}s)...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Graceful shutdown.
  const on_signal = async (signal: string) => {
    console.log(`[worker] received ${signal}, shutting down`);
    worker.shutdown();
    await close_db();
  };
  process.on("SIGINT", () => on_signal("SIGINT"));
  process.on("SIGTERM", () => on_signal("SIGTERM"));

  console.log(
    `[worker] starting on task queue "${worker.options.taskQueue}" @ ${
      process.env.RETUNE_TEMPORAL_ADDRESS ?? "localhost:7233"
    }`,
  );
  await worker.run();
  await close_db();
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
