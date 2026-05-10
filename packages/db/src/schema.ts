/**
 * Default schema barrel — re-exports the Postgres schema as the single
 * source of truth. The legacy SQLite schema was removed in the v2
 * consolidation (see MIGRATION.md).
 */

export * from "./pg/schema";
