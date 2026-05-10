/**
 * Tests for commit #11:
 *   - CriticEnsemble (goal kinds, brain region, structure)
 *   - ConflictStagingQueue (stage, drain, back-pressure, stats)
 *
 * LLM calls are not exercised here — those are integration tests.
 * These tests prove the deterministic staging/draining infrastructure
 * and the ensemble's structural invariants.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ConflictStagingQueue, CriticEnsemble } from "../src/sota-exports";

// ─────────────── CriticEnsemble structural ───────────────

test("CriticEnsemble handles select_arc goal kind", () => {
  const ensemble = new CriticEnsemble();
  assert.ok(ensemble.handles_goal_kinds.includes("select_arc"));
});

test("CriticEnsemble brain region is TPJ", () => {
  const ensemble = new CriticEnsemble();
  assert.equal(ensemble.brain_region, "temporo_parietal_junction");
});

test("CriticEnsemble has non-zero cost (LLM-driven)", () => {
  const ensemble = new CriticEnsemble();
  assert.ok(ensemble.estimated_cost_usd > 0);
  assert.ok(ensemble.estimated_latency_ms > 1000);
});

test("CriticEnsemble id is stable", () => {
  const a = new CriticEnsemble();
  const b = new CriticEnsemble();
  assert.equal(a.id, b.id);
  assert.equal(a.id, "critic_ensemble");
});

// ─────────────── ConflictStagingQueue ───────────────

test("ConflictStagingQueue stages and drains items", () => {
  const queue = new ConflictStagingQueue();

  const id = queue.stage({
    monitor: "voice_drift",
    severity: "medium",
    payload: { cosine: 0.45, bullet_id: "abc" },
    emitted_by: "voice_drift_monitor",
  });

  assert.ok(id);
  assert.equal(queue.pending(), 1);

  const items = queue.drain();
  assert.equal(items.length, 1);
  assert.equal(items[0]!.monitor, "voice_drift");
  assert.equal(items[0]!.severity, "medium");
  assert.equal(items[0]!.emitted_by, "voice_drift_monitor");
  assert.equal(queue.pending(), 0);
});

test("ConflictStagingQueue drain is atomic — second drain returns empty", () => {
  const queue = new ConflictStagingQueue();

  queue.stage({ monitor: "fabrication", severity: "high", payload: {}, emitted_by: "test" });
  queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "test" });

  const first = queue.drain();
  assert.equal(first.length, 2);

  const second = queue.drain();
  assert.equal(second.length, 0);
});

test("ConflictStagingQueue enforces back-pressure at max_size", () => {
  const queue = new ConflictStagingQueue({ max_size: 3 });

  queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "a" });
  queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "b" });
  queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "c" });

  // Fourth item should be dropped
  const id = queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "d" });
  assert.equal(id, null);
  assert.equal(queue.pending(), 3);

  const stats = queue.stats();
  assert.equal(stats.total_staged, 3);
  assert.equal(stats.total_dropped, 1);
});

test("ConflictStagingQueue stats track lifetime counts", () => {
  const queue = new ConflictStagingQueue();

  queue.stage({ monitor: "voice_drift", severity: "medium", payload: {}, emitted_by: "a" });
  queue.stage({ monitor: "fairness_concern", severity: "high", payload: {}, emitted_by: "b" });
  queue.drain();
  queue.stage({ monitor: "repetition", severity: "low", payload: {}, emitted_by: "c" });

  const stats = queue.stats();
  assert.equal(stats.total_staged, 3);
  assert.equal(stats.total_drained, 2);
  assert.equal(stats.total_dropped, 0);
  assert.equal(stats.pending, 1);
});

test("ConflictStagingQueue staged items have UUIDs and timestamps", () => {
  const queue = new ConflictStagingQueue();

  queue.stage({
    monitor: "fabrication",
    severity: "critical",
    payload: { claim: "fake" },
    emitted_by: "honesty_gate",
  });

  const items = queue.drain();
  assert.ok(items[0]!.id.length > 0);
  assert.ok(items[0]!.staged_at.includes("T")); // ISO datetime
  assert.deepEqual(items[0]!.payload, { claim: "fake" });
});

test("ConflictStagingQueue reset clears everything", () => {
  const queue = new ConflictStagingQueue();

  queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "test" });
  queue.stage({ monitor: "coherence", severity: "low", payload: {}, emitted_by: "test" });
  queue.reset();

  assert.equal(queue.pending(), 0);
  const stats = queue.stats();
  assert.equal(stats.total_staged, 0);
  assert.equal(stats.total_drained, 0);
});

test("ConflictStagingQueue empty drain returns empty array not null", () => {
  const queue = new ConflictStagingQueue();
  const items = queue.drain();
  assert.ok(Array.isArray(items));
  assert.equal(items.length, 0);
});
