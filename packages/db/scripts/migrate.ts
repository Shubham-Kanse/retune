/**
 * Run bundled Postgres migrations against $RETUNE_DATABASE_URL.
 *
 * Idempotent — every CREATE uses IF NOT EXISTS, so safe to re-run.
 * Used for local dev (against the docker compose Postgres) and for
 * production deploys (point at your managed Postgres URL).
 *
 * Usage:
 *   pnpm db:migrate
 *   RETUNE_DATABASE_URL=postgres://… pnpm db:migrate
 */

import postgres from "postgres";
import { run_migrations } from "../src/pg";

async function main(): Promise<void> {
  const url =
    process.env.RETUNE_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://retune:retune@localhost:5432/retune";

  console.log(`[migrate] target: ${redact(url)}`);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await run_migrations({ kind: "postgres", sql });
    console.log("[migrate] ✓ migrations applied");
  } catch (err) {
    console.error("[migrate] ✗ failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

function redact(url: string): string {
  return url.replace(/(:\/\/[^:]+:)[^@]*(@)/, "$1***$2");
}

main();
