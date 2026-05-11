#!/usr/bin/env node

const issues = [];
const warns = [];

const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!rawAppUrl) {
  warns.push("NEXT_PUBLIC_APP_URL is not set (will fall back to https://retuned.cv).");
} else {
  try {
    // eslint-disable-next-line no-new
    new URL(rawAppUrl);
  } catch {
    issues.push(`NEXT_PUBLIC_APP_URL is invalid: "${rawAppUrl}"`);
  }
}

const requiredForProd = ["RETUNE_DATABASE_URL"];
if ((process.env.NODE_ENV ?? "development") === "production") {
  for (const key of requiredForProd) {
    if (!process.env[key]) issues.push(`${key} is required in production.`);
  }
}

if (warns.length > 0) {
  console.warn("[selfcheck:web] warnings:");
  for (const w of warns) console.warn(`  - ${w}`);
}

if (issues.length > 0) {
  console.error("[selfcheck:web] failed:");
  for (const i of issues) console.error(`  - ${i}`);
  process.exit(1);
}

console.log("[selfcheck:web] ok");

