/**
 * Lazy persistence factory.
 *
 * The API supports three durability modes, selected via env:
 *
 *   unset / "0"  — in-memory only (the commit #2 behavior)
 *   "pglite"     — in-process WASM Postgres; state survives across
 *                  generations within the same process lifetime
 *   "postgres"   — real Postgres via RETUNE_DATABASE_URL
 *
 * All three resolve to a (TickPersistence & GenerationReplayLoader) or
 * `null`. Callers only check for null and treat the rest uniformly.
 *
 * This factory is memoized per-process; the underlying client stays
 * alive for the process lifetime. Tests that want isolation should
 * construct a harness directly rather than going through here.
 */

import {
  type GenerationReplayLoader,
  PostgresPersistence,
  type TickPersistence,
} from "@retune/agent";
import type { PgDb } from "@retune/db/pg";
import {
  create_pglite,
  pglite_drizzle,
  postgres_drizzle,
  run_migrations,
  users,
} from "@retune/db/pg";

export type PersistMode = "off" | "pglite" | "postgres";

export interface Durability {
  persistence: TickPersistence & GenerationReplayLoader;
  /** Seed user id used by the in-memory API when no real auth exists. */
  default_user_id: string;
  db: PgDb;
  close(): Promise<void>;
}

let cached: Durability | null = null;

export function detect_mode(env = process.env): PersistMode {
  const raw = (env.RETUNE_PERSIST ?? "0").toLowerCase();
  if (raw === "0" || raw === "" || raw === "off") return "off";
  if (raw === "pglite") return "pglite";
  if (raw === "postgres") {
    if (!env.RETUNE_DATABASE_URL) {
      throw new Error(
        'RETUNE_PERSIST=postgres requires RETUNE_DATABASE_URL (e.g. "postgres://user:pw@localhost/retune")',
      );
    }
    return "postgres";
  }
  throw new Error(`RETUNE_PERSIST must be one of: off, pglite, postgres; got "${raw}"`);
}

export async function acquire_durability(env = process.env): Promise<Durability | null> {
  const mode = detect_mode(env);
  if (mode === "off") return null;
  if (cached) return cached;

  if (mode === "pglite") {
    const client = await create_pglite(env.RETUNE_PGLITE_DATADIR);
    await run_migrations({ kind: "pglite", client });
    const db = pglite_drizzle(client);
    const default_user_id = await ensure_dev_user(db);
    cached = {
      persistence: new PostgresPersistence(db),
      default_user_id,
      db,
      close: async () => {
        await client.close();
        cached = null;
      },
    };
    return cached;
  }

  const url = env.RETUNE_DATABASE_URL as string;
  const { db, sql } = postgres_drizzle(url);
  // Real Postgres: migrations run via `pnpm --filter @retune/db migrate`
  // out of band; we don't re-apply them at boot to avoid race conditions
  // across multiple API replicas.
  const default_user_id = await ensure_dev_user(db);
  cached = {
    persistence: new PostgresPersistence(db),
    default_user_id,
    db,
    close: async () => {
      await sql.end();
      cached = null;
    },
  };
  return cached;
}

async function ensure_dev_user(db: PgDb): Promise<string> {
  // Deterministic dev user so each persist-enabled run hits the same FK target.
  const email = "dev@retune.local";
  const existing = await db.select().from(users).limit(1);
  const hit = existing.find((u: { email: string; id: string }) => u.email === email);
  if (hit) return hit.id;
  const rows = await db
    .insert(users)
    .values({
      email,
      personaType: "experienced",
      market: "US",
      locale: "en-US",
    })
    .onConflictDoNothing()
    .returning();
  return rows[0]?.id ?? "";
}
