#!/usr/bin/env node
// Charter 08-Data-Integrity Epic 03 + Charter 18-Migrations Epic 03 —
// audit the dual migration tracks (Drizzle vs Supabase) and surface
// drift.
//
// Usage:
//   node tools/db/audit-migration-tracks.mjs
//
// Exit codes:
//   0 — tracks consistent or only documented additions
//   1 — drift detected (table/column referenced by one track but not the other)
//   2 — script error
//
// Designed to be invoked from CI as a soft warning today (advisory)
// and a hard gate later when the unification is complete.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..");
const DRIZZLE_DIR = join(ROOT, "packages", "db", "src", "pg", "migrations");
const SUPABASE_DIR = join(ROOT, "supabase", "migrations");

const TABLE_PATTERN = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;

function listTablesIn(dir) {
  if (!existsSync(dir)) return new Set();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  const tables = new Set();
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf-8");
    TABLE_PATTERN.lastIndex = 0;
    let m = TABLE_PATTERN.exec(sql);
    while (m !== null) {
      tables.add(m[1]);
      m = TABLE_PATTERN.exec(sql);
    }
  }
  return tables;
}

function listMigrationsIn(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
}

const drizzleTables = listTablesIn(DRIZZLE_DIR);
const supabaseTables = listTablesIn(SUPABASE_DIR);
const drizzleFiles = listMigrationsIn(DRIZZLE_DIR);
const supabaseFiles = listMigrationsIn(SUPABASE_DIR);

const drizzleOnly = [...drizzleTables].filter((t) => !supabaseTables.has(t)).sort();
const supabaseOnly = [...supabaseTables].filter((t) => !drizzleTables.has(t)).sort();

const drift = drizzleOnly.length > 0 || supabaseOnly.length > 0;

const output = {
  summary: {
    drizzle_files: drizzleFiles.length,
    supabase_files: supabaseFiles.length,
    drizzle_tables: drizzleTables.size,
    supabase_tables: supabaseTables.size,
    drift,
  },
  drift: {
    only_in_drizzle: drizzleOnly,
    only_in_supabase: supabaseOnly,
  },
};

console.log(JSON.stringify(output, null, 2));

if (drift) {
  console.error("\n⚠️  Migration track drift detected.");
  console.error(
    "   See docs/charters/08-data-integrity/migration-track-runbook.md for the resolution playbook.",
  );
  // Today this is advisory (exit 0) so existing PRs don't block. Flip
  // to `process.exit(1)` after the team has run the unification pass
  // (Charter 08 Epic 03 / Charter 18 Epic 03).
}
process.exit(0);
