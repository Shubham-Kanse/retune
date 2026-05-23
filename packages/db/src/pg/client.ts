/**
 * Drizzle client factories for Postgres.
 *
 * Two adapters, one schema. Tests use pglite (in-process WASM Postgres,
 * no Docker needed); production uses postgres-js over a real connection.
 *
 * Both return a strongly-typed drizzle client over `pg_schema`. The
 * `PgDb` union type below is what persistence code accepts — any real
 * Postgres adapter that drizzle supports can be added without touching
 * downstream code.
 */

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { type PgliteDatabase, drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { type PostgresJsDatabase, drizzle as drizzlePostgresJs } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { pg_schema } from "./schema";

export type PgDb = PgliteDatabase<typeof pg_schema> | PostgresJsDatabase<typeof pg_schema>;

/**
 * Build a pglite client with the contrib extensions the Retune schema
 * depends on (`pgcrypto` for `gen_random_uuid()`; `pg_trgm` is loaded
 * in anticipation of the ontology-resolver fuzzy lookup in commit #4).
 *
 * The `data_dir` arg is optional — pass `undefined` for a pure in-memory
 * instance (the default for unit tests); pass `"idb://retune"` in the
 * browser, or a filesystem path in Node for a persistent dev sandbox.
 */
export async function create_pglite(data_dir?: string): Promise<PGlite> {
  const client = await PGlite.create({
    dataDir: data_dir,
    extensions: { pgcrypto, pg_trgm },
  });
  return client;
}

/**
 * Wrap a pglite instance as a drizzle client.
 * Caller keeps ownership of the underlying client (for `close()` etc).
 */
export function pglite_drizzle(client: PGlite): PgliteDatabase<typeof pg_schema> {
  return drizzlePglite(client, { schema: pg_schema });
}

/**
 * Build a postgres-js drizzle client from a connection string.
 * Returns both so the caller can `sql.end()` on shutdown.
 *
 * Architect note (Charter 11 Epic 01): `prepare: false` is REQUIRED when
 * the connection points at the Supabase transaction pooler (port 6543).
 * The pooler does not maintain per-client prepared-statement state, so
 * any cached preparation triggers `prepared statement … already exists`
 * errors under concurrent load. Setting `prepare: false` forces every
 * query to be sent as simple SQL, which the pooler handles correctly.
 * Direct (session-mode, port 5432) connections work either way, so this
 * flag is safe to leave on for both paths.
 */
export function postgres_drizzle(connection_url: string): {
  db: PostgresJsDatabase<typeof pg_schema>;
  sql: ReturnType<typeof postgres>;
} {
  const sql = postgres(connection_url, {
    // Conservative defaults; tune per environment.
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // Required for Supabase transaction pooler (port 6543); harmless
    // for direct connections. See Charter 11 Epic 01 architect addendum.
    prepare: false,
  });
  const db = drizzlePostgresJs(sql, { schema: pg_schema });
  return { db, sql };
}
