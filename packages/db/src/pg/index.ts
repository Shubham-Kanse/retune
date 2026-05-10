/**
 * Postgres namespace — exported via `@retune/db/pg`.
 *
 * Subpath export registered in package.json. Deliberately kept isolated
 * from the default entrypoint so the existing SQLite product continues
 * to load without pulling drizzle-orm/pg-core.
 */

export * from "./schema";
export {
  type PgDb,
  create_pglite,
  pglite_drizzle,
  postgres_drizzle,
} from "./client";
export { run_migrations } from "./migrator";
export { MIGRATIONS, MIGRATION_0000_INIT } from "./migrations";
