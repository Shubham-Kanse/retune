#!/usr/bin/env node

const issues = [];
const warns = [];

const persist = (process.env.RETUNE_PERSIST ?? "pglite").toLowerCase();
if (!["pglite", "postgres"].includes(persist)) {
  issues.push(`RETUNE_PERSIST must be pglite|postgres for worker (got "${persist}")`);
}

if (persist === "postgres" && !process.env.RETUNE_DATABASE_URL) {
  issues.push("RETUNE_DATABASE_URL is required when RETUNE_PERSIST=postgres.");
}

const temporalEnabled =
  process.env.RETUNE_TEMPORAL === "1" || Boolean(process.env.RETUNE_TEMPORAL_ADDRESS);
if (!temporalEnabled) {
  warns.push("Temporal disabled: set RETUNE_TEMPORAL=1 (or RETUNE_TEMPORAL_ADDRESS) to run worker.");
}

const temporalAddress = process.env.RETUNE_TEMPORAL_ADDRESS ?? "localhost:7233";
if (temporalEnabled && !temporalAddress.includes(":")) {
  issues.push(`RETUNE_TEMPORAL_ADDRESS must be host:port (got "${temporalAddress}")`);
}

if (warns.length > 0) {
  console.warn("[selfcheck:worker] warnings:");
  for (const w of warns) console.warn(`  - ${w}`);
}

if (issues.length > 0) {
  console.error("[selfcheck:worker] failed:");
  for (const i of issues) console.error(`  - ${i}`);
  process.exit(1);
}

console.log("[selfcheck:worker] ok");

