import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type MigratableClient = { kind: "pglite"; client: PGlite };

function loadMigrations() {
  const load = (f: string) => readFileSync(resolve(__dirname, "migrations", f), "utf8");
  return [
    { name: "0000_init", sql: load("0000_init.sql") },
    { name: "0001_active_question_parent_field", sql: load("0001_active_question_parent_field.sql") },
    { name: "0002_gdpr_packets", sql: load("0002_gdpr_packets.sql") },
    { name: "0003_emotional_mood_motivation", sql: load("0003_emotional_mood_motivation.sql") },
    { name: "0004_legacy_consolidation", sql: load("0004_legacy_consolidation.sql") },
    { name: "0005_generation_preflights", sql: load("0005_generation_preflights.sql") },
    { name: "0006_created_at_compat", sql: load("0006_created_at_compat.sql") },
  ];
}

// Only runs for pglite (dev/test). Postgres (Supabase) manages its own schema via migrations.
export async function run_migrations(target: MigratableClient): Promise<void> {
  const migrations = loadMigrations();
  for (const migration of migrations) {
    await target.client.exec(migration.sql);
  }
}
