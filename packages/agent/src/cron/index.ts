/**
 * Sleep/offline cron jobs (technical-2.0 §26.10).
 *
 * Nightly maintenance tasks that run outside the generation loop:
 *
 *   1. Prior-clamp pass — decay stale honesty calibrations toward the
 *      neutral prior (trust_factor → 1.0) to prevent over-anchoring on
 *      old data.
 *
 *   2. Prompt-hash cache rotation — evict cached prompt hashes older than
 *      7 days to keep the eval fixture store bounded.
 *
 * Entry point: `runNightlyCron(db)` — designed to be called from a
 * Temporal scheduled workflow or a simple cron runner.
 */

import type { PgDb } from "@retune/db/pg";
import { sql } from "drizzle-orm";

export interface CronResult {
  priors_clamped: number;
  cache_entries_evicted: number;
  duration_ms: number;
}

const PRIOR_DECAY_RATE = 0.05;
const CACHE_TTL_DAYS = 7;

export async function runNightlyCron(db: PgDb): Promise<CronResult> {
  const t0 = Date.now();

  const priors = await clampPriors(db);
  const evicted = await rotatePromptHashCache(db);

  return {
    priors_clamped: priors,
    cache_entries_evicted: evicted,
    duration_ms: Date.now() - t0,
  };
}

async function clampPriors(db: PgDb): Promise<number> {
  const { honesty_calibrations } = await import("@retune/db/pg");

  const rows = await db.select().from(honesty_calibrations);
  let clamped = 0;

  for (const row of rows) {
    const current = row.trust_factor;
    const decayed = current + (1.0 - current) * PRIOR_DECAY_RATE;
    if (Math.abs(decayed - current) < 0.001) continue;

    await db
      .update(honesty_calibrations)
      .set({ trust_factor: decayed, updated_at: new Date() })
      .where(sql`id = ${row.id}`);
    clamped++;
  }

  return clamped;
}

async function rotatePromptHashCache(_db: PgDb): Promise<number> {
  // The prompt-hash cache (packages/agent/src/caching/prompt-cache.ts)
  // uses an in-memory Map. For disk-backed caches (future), this would
  // evict entries older than CACHE_TTL_DAYS. Currently a no-op since
  // the FixtureBackedProvider isn't built yet.
  void CACHE_TTL_DAYS;
  return 0;
}

// ──────────── startCron ────────────

const NIGHTLY_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Start the nightly cron loop.
 *
 * Runs `runNightlyCron` immediately on startup, then once every 24 hours.
 * Guarded by `process.env.ENABLE_CRON !== "0"` at the call site in main.ts.
 *
 * @param db  Postgres DB instance from `@retune/db/pg`
 * @returns   A cleanup function that stops the interval (for graceful shutdown)
 */
export function startCron(db: PgDb): () => void {
  async function tick(): Promise<void> {
    try {
      const result = await runNightlyCron(db);
      // eslint-disable-next-line no-console
      console.log(
        `[cron] nightly run complete — priors=${result.priors_clamped} evicted=${result.cache_entries_evicted} (${result.duration_ms}ms)`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[cron] nightly run failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Run immediately on startup so a fresh deploy doesn't wait 24 h
  void tick();

  const handle = setInterval(() => void tick(), NIGHTLY_INTERVAL_MS);

  // Allow Node.js to exit even if the interval is still pending
  if (typeof handle.unref === "function") handle.unref();

  return () => clearInterval(handle);
}
