/**
 * drizzle-kit config for the Postgres schema.
 *
 * Commit #0 shipped the SQLite config (`drizzle.config.ts`) for the
 * existing product; this one lives alongside for the cognitive-cycle
 * tables only. Two separate configs means drizzle-kit won't confuse
 * SQLite migrations with pg migrations.
 *
 * Usage:
 *   pnpm --filter @retune/db db:pg:generate   # emit new SQL
 *   pnpm --filter @retune/db db:pg:push       # apply to $RETUNE_DATABASE_URL
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/pg/schema.ts",
  out: "./src/pg/migrations",
  dbCredentials: {
    url: process.env.RETUNE_DATABASE_URL ?? "postgres://localhost:5432/retune",
  },
  migrations: {
    prefix: "index",
    table: "__drizzle_migrations",
    schema: "public",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
