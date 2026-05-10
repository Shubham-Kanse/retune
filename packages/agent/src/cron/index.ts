/**
 * Sleep/offline cron jobs (technical-2.0 §26.10).
 *
 * Four nightly maintenance tasks that run outside the generation loop:
 *
 *   1. MoodFingerprint recomputation — aggregate recent emotional states
 *      into a stable mood baseline per user.
 *
 *   2. Prior-clamp pass — decay stale honesty calibrations toward the
 *      neutral prior (trust_factor → 1.0) to prevent over-anchoring on
 *      old data.
 *
 *   3. Memory pruning — remove voice centroids and emotional states older
 *      than the retention window (default 90 days) for users who haven't
 *      generated recently.
 *
 *   4. Prompt-hash cache rotation — evict cached prompt hashes older than
 *      7 days to keep the eval fixture store bounded.
 *
 * Entry point: `runNightlyCron(db)` — designed to be called from a
 * Temporal scheduled workflow or a simple cron runner.
 */

import type { PgDb } from "@retune/db/pg";
import { sql } from "drizzle-orm";

export interface CronResult {
  mood_fingerprints_updated: number;
  priors_clamped: number;
  records_pruned: number;
  cache_entries_evicted: number;
  duration_ms: number;
}

const PRIOR_DECAY_RATE = 0.05;
const RETENTION_DAYS = 90;
const CACHE_TTL_DAYS = 7;

export async function runNightlyCron(db: PgDb): Promise<CronResult> {
  const t0 = Date.now();

  const mood = await recomputeMoodFingerprints(db);
  const priors = await clampPriors(db);
  const pruned = await pruneStaleRecords(db);
  const evicted = await rotatePromptHashCache(db);

  return {
    mood_fingerprints_updated: mood,
    priors_clamped: priors,
    records_pruned: pruned,
    cache_entries_evicted: evicted,
    duration_ms: Date.now() - t0,
  };
}

async function recomputeMoodFingerprints(db: PgDb): Promise<number> {
  const { emotional_states, mood_fingerprints, users } = await import("@retune/db/pg");
  const { eq, gte } = await import("drizzle-orm");

  const week_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const active_users = await db
    .select({ user_id: users.id })
    .from(users)
    .where(gte(users.updatedAt, week_ago));

  let updated = 0;

  for (const { user_id } of active_users) {
    const states = await db
      .select({
        valence: emotional_states.valence,
        arousal: emotional_states.arousal,
        dominance: emotional_states.dominance,
      })
      .from(emotional_states)
      .where(eq(emotional_states.user_id, user_id))
      .orderBy(sql`created_at DESC`)
      .limit(50);

    if (states.length === 0) continue;

    const n = states.length;
    const v_avg = states.reduce((s, x) => s + x.valence, 0) / n;
    const a_avg = states.reduce((s, x) => s + x.arousal, 0) / n;
    const d_avg = states.reduce((s, x) => s + x.dominance, 0) / n;

    const v_var = states.reduce((s, x) => s + (x.valence - v_avg) ** 2, 0) / n;
    const a_var = states.reduce((s, x) => s + (x.arousal - a_avg) ** 2, 0) / n;
    const d_var = states.reduce((s, x) => s + (x.dominance - d_avg) ** 2, 0) / n;
    const stability = Math.max(0, Math.min(1, 1 - (v_var + a_var + d_var) / 3));

    await db
      .insert(mood_fingerprints)
      .values({
        user_id,
        valence_avg: v_avg,
        arousal_avg: a_avg,
        dominance_avg: d_avg,
        stability,
        sample_count: n,
        sample_window_hours: 168,
      })
      .onConflictDoUpdate({
        target: mood_fingerprints.id,
        set: {
          valence_avg: v_avg,
          arousal_avg: a_avg,
          dominance_avg: d_avg,
          stability,
          sample_count: n,
        },
      });
    updated++;
  }

  return updated;
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

async function pruneStaleRecords(db: PgDb): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let pruned = 0;

  const { emotional_states } = await import("@retune/db/pg");
  const { lt } = await import("drizzle-orm");

  const deleted = await (
    db.delete(emotional_states).where(lt(emotional_states.created_at, cutoff)) as unknown as {
      returning(): Promise<Array<{ id: string }>>;
    }
  ).returning();
  pruned += deleted.length;

  return pruned;
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
        `[cron] nightly run complete — mood=${result.mood_fingerprints_updated} priors=${result.priors_clamped} pruned=${result.records_pruned} evicted=${result.cache_entries_evicted} (${result.duration_ms}ms)`,
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
