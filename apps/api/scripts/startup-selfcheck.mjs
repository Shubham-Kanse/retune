#!/usr/bin/env node

const issues = [];
const warns = [];

const persist = (process.env.RETUNE_PERSIST ?? "off").toLowerCase();
if (!["off", "0", "false", "pglite", "postgres"].includes(persist)) {
  issues.push(`RETUNE_PERSIST must be off|pglite|postgres (got "${persist}")`);
}

if (persist === "postgres" && !process.env.RETUNE_DATABASE_URL) {
  issues.push("RETUNE_DATABASE_URL is required when RETUNE_PERSIST=postgres.");
}

const temporalEnabled =
  process.env.RETUNE_TEMPORAL === "1" || Boolean(process.env.RETUNE_TEMPORAL_ADDRESS);
if (temporalEnabled && !["pglite", "postgres"].includes(persist)) {
  issues.push("Temporal mode requires RETUNE_PERSIST=pglite or RETUNE_PERSIST=postgres.");
}

const portRaw = process.env.PORT ?? "8787";
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  issues.push(`PORT must be a valid TCP port, got "${portRaw}"`);
}

if (!process.env.RETUNE_API_CORS) {
  warns.push("RETUNE_API_CORS not set (defaulting to '*').");
}

if (warns.length > 0) {
  console.warn("[selfcheck:api] warnings:");
  for (const w of warns) console.warn(`  - ${w}`);
}

if (issues.length > 0) {
  console.error("[selfcheck:api] failed:");
  for (const i of issues) console.error(`  - ${i}`);
  process.exit(1);
}

console.log("[selfcheck:api] ok");

