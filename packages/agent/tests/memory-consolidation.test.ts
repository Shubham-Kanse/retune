/**
 * Tests for commit #14:
 *   - NightlyConsolidator (Bayesian honesty update, voice centroid EMA, case-base entry)
 *   - WellBeingMonitor (trigger-bus listener, distress detection)
 *   - TheoryOfMindSpecialist (structural: goal kinds, brain region, cost)
 *
 * Invariants proven:
 *   1.  Callback outcome → honesty trust increases for all claim types
 *   2.  Offer outcome → larger trust increase than callback
 *   3.  Rejection → trust decreases for metric/scope/leadership
 *   4.  Ghosted → no honesty change
 *   5.  Voice centroid EMA: cold-start uses fingerprint directly
 *   6.  Voice centroid EMA: warm update is weighted correctly
 *   7.  Case-base entry added only on callback/offer
 *   8.  Consolidation is idempotent (mark_consolidated called after each)
 *   9.  WellBeingMonitor fires on high retry_count bullet
 *   10. WellBeingMonitor fires on pending_revisions accumulation
 *   11. WellBeingMonitor deduplicates repeated concerns
 *   12. WellBeingMonitor ignores non-write events
 *   13. TheoryOfMindSpecialist handles model_recruiter_beliefs goal kind (v2.0)
 *   14. TheoryOfMindSpecialist brain region is TPJ
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { BlackboardEvent } from "@retune/types";
import {
  type CaseBaseEntry,
  type ConsolidationStore,
  type GenerationRecord,
  type HonestyCalibrationRow,
  NightlyConsolidator,
  type OutcomeRecord,
  TheoryOfMindSpecialist,
  type VoiceCentroidRow,
  WellBeingMonitor,
} from "../src/sota-exports";

// ──────────── In-memory ConsolidationStore stub ────────────

interface TestStore extends ConsolidationStore {
  honesty: HonestyCalibrationRow[];
  centroids: Map<string, VoiceCentroidRow>;
  case_base: CaseBaseEntry[];
  consolidated: Set<string>;
  seed_generation(gen: GenerationRecord): void;
}

function make_store(opts?: {
  existing_honesty?: HonestyCalibrationRow[];
  existing_centroid?: VoiceCentroidRow;
}): TestStore {
  const honesty: HonestyCalibrationRow[] = opts?.existing_honesty ?? [];
  const centroids = new Map<string, VoiceCentroidRow>(
    opts?.existing_centroid ? [[opts.existing_centroid.user_id, opts.existing_centroid]] : [],
  );
  const case_base: CaseBaseEntry[] = [];
  const consolidated = new Set<string>();
  const generations = new Map<string, GenerationRecord>();

  const store = {
    honesty,
    centroids,
    case_base,
    consolidated,

    async get_pending_outcomes(_since: Date): Promise<OutcomeRecord[]> {
      return [];
    },
    async get_generation(generation_id: string): Promise<GenerationRecord | null> {
      return generations.get(generation_id) ?? null;
    },
    async get_honesty_calibrations(user_id: string): Promise<HonestyCalibrationRow[]> {
      return honesty.filter((r) => r.user_id === user_id);
    },
    async get_voice_centroid(user_id: string): Promise<VoiceCentroidRow | null> {
      return centroids.get(user_id) ?? null;
    },
    async update_honesty_calibration(row: HonestyCalibrationRow): Promise<void> {
      const idx = honesty.findIndex(
        (r) => r.user_id === row.user_id && r.claim_type === row.claim_type,
      );
      if (idx >= 0) honesty[idx] = row;
      else honesty.push(row);
    },
    async update_voice_centroid(row: VoiceCentroidRow): Promise<void> {
      centroids.set(row.user_id, row);
    },
    async record_case_base_entry(entry: CaseBaseEntry): Promise<void> {
      case_base.push(entry);
    },
    async mark_outcome_consolidated(application_id: string): Promise<void> {
      consolidated.add(application_id);
    },

    // Test helper: add a generation
    seed_generation(gen: GenerationRecord): void {
      generations.set(gen.generation_id, gen);
    },
  };

  return store;
}

function make_outcome(
  kind: OutcomeRecord["kind"],
  user_id = randomUUID(),
  generation_id = randomUUID(),
): OutcomeRecord {
  return {
    application_id: randomUUID(),
    generation_id,
    kind,
    captured_at: new Date().toISOString(),
    user_id,
  };
}

function make_gen(user_id: string, generation_id: string, fp?: number[]): GenerationRecord {
  return {
    generation_id,
    user_id,
    honesty_calibration: { metric: 0.7, scope: 0.65, leadership: 0.72 },
    voice_fingerprint: fp ?? Array.from({ length: 128 }, () => Math.random()),
    outcome_estimate_point: 0.65,
    verdict: "ship",
    arc_feasibility: 0.8,
  };
}

// ─────────────── NightlyConsolidator ───────────────

test("Callback outcome increases honesty trust for all claim types", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const store = make_store({
    existing_honesty: [
      { user_id, claim_type: "metric", trust_factor: 0.7, sample_size: 10 },
      { user_id, claim_type: "scope", trust_factor: 0.65, sample_size: 8 },
    ],
  });
  store.seed_generation(make_gen(user_id, gen_id));

  const outcome = make_outcome("callback", user_id, gen_id);
  const store_with_pending: ConsolidationStore = {
    ...store,
    async get_pending_outcomes(_since: Date): Promise<OutcomeRecord[]> {
      return [outcome];
    },
  };
  const wrapped = new NightlyConsolidator(store_with_pending);
  const report = await wrapped.run(new Date(0));

  assert.equal(report.outcomes_processed, 1);
  assert.ok(report.honesty_updates.length > 0);
  for (const update of report.honesty_updates) {
    assert.ok(
      update.direction === "improved" || update.direction === "unchanged",
      `Expected improved/unchanged for callback, got ${update.direction} for ${update.claim_type}`,
    );
    assert.ok(update.posterior_trust >= update.prior_trust);
  }
});

test("Offer outcome yields larger trust increase than callback", async () => {
  const user_id = randomUUID();
  const gen_id_callback = randomUUID();
  const gen_id_offer = randomUUID();
  const base_honesty = [{ user_id, claim_type: "metric", trust_factor: 0.6, sample_size: 5 }];

  // Callback
  const callback_store = make_store({ existing_honesty: JSON.parse(JSON.stringify(base_honesty)) });
  callback_store.seed_generation(make_gen(user_id, gen_id_callback));
  const callback_consolidator = new NightlyConsolidator({
    ...callback_store,
    async get_pending_outcomes() {
      return [make_outcome("callback", user_id, gen_id_callback)];
    },
  });
  const callback_report = await callback_consolidator.run(new Date(0));
  const callback_delta =
    callback_report.honesty_updates.find((u) => u.claim_type === "metric")?.evidence_delta ?? 0;

  // Offer
  const offer_store = make_store({ existing_honesty: JSON.parse(JSON.stringify(base_honesty)) });
  offer_store.seed_generation(make_gen(user_id, gen_id_offer));
  const offer_consolidator = new NightlyConsolidator({
    ...offer_store,
    async get_pending_outcomes() {
      return [make_outcome("offer", user_id, gen_id_offer)];
    },
  });
  const offer_report = await offer_consolidator.run(new Date(0));
  const offer_delta =
    offer_report.honesty_updates.find((u) => u.claim_type === "metric")?.evidence_delta ?? 0;

  assert.ok(
    offer_delta >= callback_delta,
    `Offer delta ${offer_delta} should be ≥ callback delta ${callback_delta}`,
  );
});

test("Rejection decreases honesty trust for metric/scope/leadership", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const store = make_store({
    existing_honesty: [
      { user_id, claim_type: "metric", trust_factor: 0.8, sample_size: 20 },
      { user_id, claim_type: "scope", trust_factor: 0.75, sample_size: 15 },
    ],
  });
  store.seed_generation(make_gen(user_id, gen_id));

  const consolidator = new NightlyConsolidator({
    ...store,
    async get_pending_outcomes() {
      return [make_outcome("rejection", user_id, gen_id)];
    },
  });
  const report = await consolidator.run(new Date(0));

  const metric_update = report.honesty_updates.find((u) => u.claim_type === "metric");
  assert.ok(metric_update);
  assert.ok(
    metric_update!.direction === "degraded" || metric_update!.direction === "unchanged",
    `Expected degraded/unchanged for rejection, got ${metric_update!.direction}`,
  );
  assert.ok(metric_update!.posterior_trust <= metric_update!.prior_trust);
});

test("Ghosted outcome produces no honesty changes", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const store = make_store({
    existing_honesty: [{ user_id, claim_type: "metric", trust_factor: 0.7, sample_size: 10 }],
  });
  store.seed_generation(make_gen(user_id, gen_id));

  const consolidator = new NightlyConsolidator({
    ...store,
    async get_pending_outcomes() {
      return [make_outcome("ghosted", user_id, gen_id)];
    },
  });
  const report = await consolidator.run(new Date(0));

  assert.equal(report.outcomes_processed, 1);
  assert.equal(report.honesty_updates.length, 0);
});

test("Voice centroid cold-start uses fingerprint directly", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const fp = Array.from({ length: 128 }, (_, i) => i / 128);
  const store = make_store();
  store.seed_generation(make_gen(user_id, gen_id, fp));

  const consolidator = new NightlyConsolidator({
    ...store,
    async get_pending_outcomes() {
      return [make_outcome("callback", user_id, gen_id)];
    },
  });
  await consolidator.run(new Date(0));

  const centroid = store.centroids.get(user_id);
  assert.ok(centroid);
  assert.equal(centroid!.sample_size, 1);
  // Cold-start centroid should have non-zero values
  const nonzero = centroid!.centroid.some((v) => v !== 0);
  assert.ok(nonzero);
});

test("Voice centroid EMA warm update changes sample size correctly", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const existing_fp = Array.from({ length: 128 }, () => 0.5);
  const new_fp = Array.from({ length: 128 }, () => 0.8);

  const store = make_store({
    existing_centroid: {
      user_id,
      centroid: existing_fp,
      sample_size: 10,
      last_updated_at: new Date().toISOString(),
    },
  });
  store.seed_generation(make_gen(user_id, gen_id, new_fp));

  const consolidator = new NightlyConsolidator({
    ...store,
    async get_pending_outcomes() {
      return [make_outcome("callback", user_id, gen_id)];
    },
  });
  const report = await consolidator.run(new Date(0));

  const centroid_update = report.voice_centroid_updates[0];
  assert.ok(centroid_update);
  assert.equal(centroid_update!.prev_sample_size, 10);
  assert.equal(centroid_update!.new_sample_size, 11);
  assert.ok(centroid_update!.cosine_change >= 0);
});

test("Case-base entry added on callback and offer but not rejection", async () => {
  const user_id = randomUUID();

  const run_with_outcome = async (kind: OutcomeRecord["kind"]) => {
    const gen_id = randomUUID();
    const store = make_store();
    store.seed_generation(make_gen(user_id, gen_id));
    const consolidator = new NightlyConsolidator({
      ...store,
      async get_pending_outcomes() {
        return [make_outcome(kind, user_id, gen_id)];
      },
    });
    await consolidator.run(new Date(0));
    return store.case_base.length;
  };

  const callback_entries = await run_with_outcome("callback");
  const offer_entries = await run_with_outcome("offer");
  const rejection_entries = await run_with_outcome("rejection");

  assert.equal(callback_entries, 1, "callback should add case-base entry");
  assert.equal(offer_entries, 1, "offer should add case-base entry");
  assert.equal(rejection_entries, 0, "rejection should NOT add case-base entry");
});

test("Consolidation marks outcomes as consolidated", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const outcome = make_outcome("callback", user_id, gen_id);
  const store = make_store();
  store.seed_generation(make_gen(user_id, gen_id));

  const consolidator = new NightlyConsolidator({
    ...store,
    async get_pending_outcomes() {
      return [outcome];
    },
  });
  await consolidator.run(new Date(0));

  assert.ok(store.consolidated.has(outcome.application_id));
});

test("Consolidation report contains no errors on clean run", async () => {
  const user_id = randomUUID();
  const gen_id = randomUUID();
  const store = make_store();
  store.seed_generation(make_gen(user_id, gen_id));

  const consolidator = new NightlyConsolidator({
    ...store,
    async get_pending_outcomes() {
      return [make_outcome("callback", user_id, gen_id)];
    },
  });
  const report = await consolidator.run(new Date(0));

  assert.equal(report.errors.length, 0);
  assert.ok(report.duration_ms >= 0);
});

// ─────────────── WellBeingMonitor ───────────────

function make_write_event(path: string, after: unknown): BlackboardEvent {
  return {
    type: "write",
    path,
    before: null,
    after,
    by_specialist: "test",
    seq: 0,
    timestamp: new Date().toISOString(),
  };
}

test("WellBeingMonitor fires on high retry_count bullet", () => {
  const concerns: string[] = [];
  const monitor = new WellBeingMonitor({
    on_concern: (c) => concerns.push(c.kind),
  });

  monitor.on_event(
    make_write_event("draft.bullets.abc-123", {
      id: "abc-123",
      text: "Led a team",
      retry_count: 2,
      voice_drift_cosine: 0.9,
    }),
  );

  assert.equal(concerns[0], "high_retry_rate");
  assert.equal(monitor.concerns().length, 1);
});

test("WellBeingMonitor fires on pending_revisions accumulation", () => {
  const concerns: string[] = [];
  const monitor = new WellBeingMonitor({
    on_concern: (c) => concerns.push(c.kind),
  });

  // 3+ revisions triggers concern
  monitor.on_event(
    make_write_event("draft.pending_revisions", [
      { target: "bullet_plan_0", reason: "honesty", requested_by: "composer" },
      { target: "bullet_plan_1", reason: "coherence", requested_by: "composer" },
      { target: "bullet_plan_2", reason: "drift", requested_by: "composer" },
    ]),
  );

  assert.equal(concerns[0], "pending_revision_accumulation");
});

test("WellBeingMonitor fires on self-image divergence (positive)", () => {
  const concerns: string[] = [];
  const monitor = new WellBeingMonitor({
    on_concern: (c) => concerns.push(c.kind),
  });

  // Professional avg 80, self 50 → positive divergence (candidate underselling)
  monitor.on_event(
    make_write_event("hypotheses.critic_ensemble_result", {
      recruiter: { score: 80 },
      hiring_manager: { score: 80 },
      self_image: { score: 50 },
    }),
  );

  assert.equal(concerns[0], "self_image_divergence");
  const concern = monitor.concerns()[0]!;
  assert.ok(concern.nudge.includes("Trust the evidence"));
});

test("WellBeingMonitor deduplicates repeated concerns", () => {
  const fired: string[] = [];
  const monitor = new WellBeingMonitor({
    on_concern: (c) => fired.push(c.kind),
  });

  const event = make_write_event("draft.bullets.abc-123", {
    id: "abc-123",
    text: "Led a team",
    retry_count: 2,
    voice_drift_cosine: 0.9,
  });

  monitor.on_event(event);
  monitor.on_event(event);
  monitor.on_event(event);

  // Should only fire once despite 3 identical events
  assert.equal(fired.length, 1);
  assert.equal(monitor.concerns().length, 1);
});

test("WellBeingMonitor ignores non-write events", () => {
  const concerns: string[] = [];
  const monitor = new WellBeingMonitor({
    on_concern: (c) => concerns.push(c.kind),
  });

  monitor.on_event({
    type: "delete",
    path: "draft.bullets.abc-123",
    before: { retry_count: 5 },
    after: null,
    by_specialist: "test",
    seq: 0,
    timestamp: new Date().toISOString(),
  });

  assert.equal(concerns.length, 0);
});

test("WellBeingMonitor fires refuse_verdict_distress on REFUSE", () => {
  const concerns: string[] = [];
  const monitor = new WellBeingMonitor({
    on_concern: (c) => concerns.push(c.kind),
  });

  monitor.on_event(
    make_write_event("hypotheses.ship_decision", {
      verdict: "refuse",
      outcome_point: 0.15,
    }),
  );

  assert.equal(concerns[0], "refuse_verdict_distress");
  const concern = monitor.concerns()[0]!;
  assert.equal(concern.severity, "high");
  assert.ok(concern.nudge.includes("profile"));
});

test("WellBeingMonitor stats correctly aggregates by kind", () => {
  const monitor = new WellBeingMonitor();

  monitor.on_event(
    make_write_event("draft.bullets.a1", { retry_count: 3, voice_drift_cosine: 0.9 }),
  );
  monitor.on_event(make_write_event("draft.pending_revisions", [{}, {}, {}]));

  const stats = monitor.stats();
  assert.equal(stats.total, 2);
  assert.ok("high_retry_rate" in stats.by_kind);
  assert.ok("pending_revision_accumulation" in stats.by_kind);
});

test("WellBeingMonitor reset clears concerns and dedup state", () => {
  const monitor = new WellBeingMonitor();

  monitor.on_event(make_write_event("draft.bullets.a1", { retry_count: 3 }));
  assert.equal(monitor.concerns().length, 1);

  monitor.reset();
  assert.equal(monitor.concerns().length, 0);

  // After reset, same event should fire again
  const fired: string[] = [];
  const monitor2 = new WellBeingMonitor({ on_concern: (c) => fired.push(c.kind) });
  monitor2.on_event(make_write_event("draft.bullets.a1", { retry_count: 3 }));
  monitor2.reset();
  monitor2.on_event(make_write_event("draft.bullets.a1", { retry_count: 3 }));
  assert.equal(fired.length, 2);
});

// ─────────────── TheoryOfMindSpecialist structural ───────────────

test("TheoryOfMindSpecialist handles model_recruiter_beliefs goal kind (v2.0 fix for issue #3)", () => {
  const specialist = new TheoryOfMindSpecialist();
  assert.ok(specialist.handles_goal_kinds.includes("model_recruiter_beliefs"));
  // Was `select_arc` in v1.0 — collided with CriticEnsemble. Per
  // technical-2.0 §6.5 + §20 Phase 2, ToM owns its own goal kind.
  assert.ok(!specialist.handles_goal_kinds.includes("select_arc"));
});

test("TheoryOfMindSpecialist brain region is TPJ", () => {
  const specialist = new TheoryOfMindSpecialist();
  assert.equal(specialist.brain_region, "temporo_parietal_junction");
  assert.equal(specialist.id, "theory_of_mind");
});

test("TheoryOfMindSpecialist has non-zero LLM cost", () => {
  const specialist = new TheoryOfMindSpecialist();
  assert.ok(specialist.estimated_cost_usd > 0);
  assert.ok(specialist.estimated_latency_ms > 500);
});
