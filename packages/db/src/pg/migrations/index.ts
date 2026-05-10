/**
 * Bundled migration SQL.
 *
 * Read at import-time so consumers (including pglite-backed tests) don't
 * need to know the on-disk layout. Commit #4 switches this to drizzle-kit
 * generated migration files + a manifest file.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function load(file: string): string {
  return readFileSync(resolve(__dirname, file), "utf8");
}

export const MIGRATION_0000_INIT: string = load("0000_init.sql");
export const MIGRATION_0001_ACTIVE_QUESTION_PARENT_FIELD: string = load(
  "0001_active_question_parent_field.sql",
);
export const MIGRATION_0002_GDPR_PACKETS: string = load("0002_gdpr_packets.sql");
export const MIGRATION_0003_EMOTIONAL_MOOD_MOTIVATION: string = load(
  "0003_emotional_mood_motivation.sql",
);
export const MIGRATION_0004_LEGACY_CONSOLIDATION: string = load(
  "0004_legacy_consolidation.sql",
);
export const MIGRATION_0005_GENERATION_PREFLIGHTS: string = load(
  "0005_generation_preflights.sql",
);

export const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [
  { name: "0000_init", sql: MIGRATION_0000_INIT },
  {
    name: "0001_active_question_parent_field",
    sql: MIGRATION_0001_ACTIVE_QUESTION_PARENT_FIELD,
  },
  { name: "0002_gdpr_packets", sql: MIGRATION_0002_GDPR_PACKETS },
  {
    name: "0003_emotional_mood_motivation",
    sql: MIGRATION_0003_EMOTIONAL_MOOD_MOTIVATION,
  },
  {
    name: "0004_legacy_consolidation",
    sql: MIGRATION_0004_LEGACY_CONSOLIDATION,
  },
  {
    name: "0005_generation_preflights",
    sql: MIGRATION_0005_GENERATION_PREFLIGHTS,
  },
];
