import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sql } from "drizzle-orm";
import { acquire_durability } from "../src/runtime/persistence-factory";

test("schema contract: generations has required columns", async () => {
  process.env.RETUNE_PERSIST = "pglite";
  process.env.RETUNE_PGLITE_DATADIR = await mkdtemp(join(tmpdir(), "retune-api-schema-"));
  const durability = await acquire_durability();
  if (!durability) throw new Error("durability must be configured");

  const rows = await durability.db.execute(
    sql`select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'generations'`,
  );
  const rawRows = (
    Array.isArray(rows)
      ? rows
      : typeof rows === "object" && rows !== null && "rows" in rows
        ? (rows as { rows: Array<Record<string, unknown>> }).rows
        : []
  ) as Array<Record<string, unknown>>;
  const columns = new Set(
    rawRows.map((r) => String(r.column_name ?? r.COLUMN_NAME ?? "")).filter(Boolean),
  );

  const required = [
    "id",
    "user_id",
    "jd_id",
    "created_at",
    "completed_at",
    "current_blackboard",
    "termination",
    "ticks_executed",
    "total_cost_usd",
    "total_latency_ms",
  ];

  for (const c of required) {
    assert.equal(columns.has(c), true, `missing required generations column: ${c}`);
  }

  const compatRows = await durability.db.execute(
    sql`select table_name, column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name in ('voice_centroids', 'honesty_calibrations')
          and column_name = 'created_at'`,
  );
  const compatRaw = (
    Array.isArray(compatRows)
      ? compatRows
      : typeof compatRows === "object" && compatRows !== null && "rows" in compatRows
        ? (compatRows as { rows: Array<Record<string, unknown>> }).rows
        : []
  ) as Array<Record<string, unknown>>;
  const compatSet = new Set(
    compatRaw
      .map((r) => `${String(r.table_name ?? "").toLowerCase()}.${String(r.column_name ?? "").toLowerCase()}`)
      .filter(Boolean),
  );
  assert.equal(compatSet.has("voice_centroids.created_at"), true);
  assert.equal(compatSet.has("honesty_calibrations.created_at"), true);

  await durability.close();
  process.env.RETUNE_PERSIST = undefined;
});
