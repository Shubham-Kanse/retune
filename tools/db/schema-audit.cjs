#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const postgres = require(path.join(__dirname, "../../apps/web/node_modules/postgres"));

const ROOT = path.resolve(__dirname, "..", "..");
const SCHEMA_TS = path.join(ROOT, "packages/db/src/pg/schema.ts");
const WEB_ENV = path.join(ROOT, "apps/web/.env");

function readDbUrl() {
  const env = fs.readFileSync(WEB_ENV, "utf8");
  const match = env.match(/^RETUNE_DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("RETUNE_DATABASE_URL missing in apps/web/.env");
  return match[1].trim();
}

function parseTablesAndColumns(schemaSource) {
  const decl = /export const\s+\w+\s*=\s*pgTable\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\}\s*,?/g;
  const colPat = /\b\w+\s*:\s*\w+\("([^"]+)"/g;
  const expected = {};

  let d;
  while ((d = decl.exec(schemaSource)) !== null) {
    const table = d[1];
    const body = d[2];
    const cols = [];
    let c;
    while ((c = colPat.exec(body)) !== null) cols.push(c[1]);
    expected[table] = Array.from(new Set(cols));
  }
  return expected;
}

async function main() {
  const schemaSource = fs.readFileSync(SCHEMA_TS, "utf8");
  const expected = parseTablesAndColumns(schemaSource);

  const sql = postgres(readDbUrl(), { ssl: "require" });
  const rows = await sql.unsafe(`
    select table_name, column_name
    from information_schema.columns
    where table_schema='public'
    order by table_name, ordinal_position
  `);

  const actual = new Map();
  for (const row of rows) {
    if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
    actual.get(row.table_name).add(row.column_name);
  }

  const failures = [];
  for (const [table, cols] of Object.entries(expected)) {
    const got = actual.get(table);
    if (!got) {
      failures.push({ table, missingTable: true, missingColumns: cols });
      continue;
    }
    const missing = cols.filter((c) => !got.has(c));
    if (missing.length) failures.push({ table, missingColumns: missing });
  }

  const summary = {
    expectedTables: Object.keys(expected).length,
    dbTables: [...actual.keys()].length,
    failingTables: failures.length,
  };

  console.log(JSON.stringify({ summary, failures }, null, 2));
  await sql.end({ timeout: 5 });

  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error("[schema-audit] failed:", err.message);
  process.exit(1);
});
