/**
 * Tests for the four commit-#8 specialists:
 *   - VoiceFingerprintExtractor (stylometry; deterministic, no ML)
 *   - HonestyCalibrator (Bayesian; cold-start + outcome-aware)
 *   - CredibilityScanner (regex-mines hidden disqualifiers)
 *   - FairnessMonitor (trigger-bus listener)
 *
 * Each specialist gets a unit test against in-memory state. Voice +
 * honesty also have a pglite-backed persistence test that exercises
 * the upsert path.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { honesty_calibrations, voice_centroids } from "@retune/db/pg";
import type { Blackboard } from "@retune/types";
import { eq } from "drizzle-orm";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  CredibilityScanner,
  FairnessMonitor,
  GoalStack,
  type HonestyCalibrationStore,
  HonestyCalibrator,
  Orchestrator,
  SpecialistRegistry,
  TriggerBus,
  VOICE_FINGERPRINT_DIM,
  VoiceFingerprintExtractor,
  type VoiceFingerprintSink,
} from "../src/sota-exports";
import { build_pglite_harness } from "./helpers/pglite-harness";

// ──────────── helpers ────────────

function empty_blackboard(generation_id: string, user_id: string, jd_id: string): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id,
    user_id,
    jd_id,
    ontology_version: "0.0.1",
    goals: [],
    hypotheses: {
      role_schema: null,
      company_schema: null,
      discourse_map: null,
      hidden_disqualifiers: null,
      desperation_index: null,
      cultural_vector: null,
      candidate_credibility_prior: null,
      voice_fingerprint: null,
      honesty_calibration: null,
      narrative_arcs_candidates: [],
      chosen_narrative_arc: null,
    },
    evidence_graph: { span_ids: [], requirement_matches: [] },
    draft: { sections: {}, bullets: {}, claims: {}, pending_revisions: [] },
    conflicts: [],
    outcome_estimate: null,
    blocking_factors: [],
    cost_budget: {
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    },
    audit_trail: [],
    created_at: now,
    updated_at: now,
  };
}

function make_orchestrator(opts: {
  blackboard: BlackboardStore;
  goal_stack: GoalStack;
  registry: SpecialistRegistry;
}): Orchestrator {
  return new Orchestrator({
    blackboard: opts.blackboard,
    goal_stack: opts.goal_stack,
    registry: opts.registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    }),
  });
}

const SAMPLE_PROFILE = `Senior Software Engineer with 8 years of experience.
Led the team that designed the high-throughput streaming-ingest pipeline serving 50M req/day.
Deep expertise in distributed systems and rigorous engineering.
Mentored 6 engineers and built the on-call rotation from scratch.`;

// ─────────────── VoiceFingerprintExtractor ───────────────

test("VoiceFingerprintExtractor produces a deterministic 128-dim unit vector", async () => {
  const extractor = new VoiceFingerprintExtractor();
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "extract_voice_fingerprint",
    priority: 60,
    emitted_by: "test",
    payload: { profile_texts: [SAMPLE_PROFILE] },
  });
  const registry = new SpecialistRegistry();
  registry.register_all([extractor]);

  await make_orchestrator({ blackboard, goal_stack, registry }).run();

  const v1 = blackboard.snapshot().hypotheses.voice_fingerprint;
  assert.ok(v1, "voice_fingerprint must be populated");
  if (!v1) return;
  assert.equal(v1.length, VOICE_FINGERPRINT_DIM);
  // L2-normalized: ‖v‖ ≈ 1.
  const l2 = Math.sqrt(v1.reduce((acc, x) => acc + x * x, 0));
  assert.ok(Math.abs(l2 - 1) < 1e-6, `expected unit length, got ‖v‖=${l2}`);
  // Determinism: same input → same vector.
  const generation_id2 = randomUUID();
  const bus2 = new TriggerBus();
  const blackboard2 = new BlackboardStore(empty_blackboard(generation_id2, user_id, jd_id), bus2);
  const goal_stack2 = new GoalStack();
  goal_stack2.add({
    kind: "extract_voice_fingerprint",
    priority: 60,
    emitted_by: "test",
    payload: { profile_texts: [SAMPLE_PROFILE] },
  });
  const registry2 = new SpecialistRegistry();
  registry2.register_all([new VoiceFingerprintExtractor()]);
  await make_orchestrator({
    blackboard: blackboard2,
    goal_stack: goal_stack2,
    registry: registry2,
  }).run();
  const v2 = blackboard2.snapshot().hypotheses.voice_fingerprint;
  assert.ok(v2);
  if (!v2) return;
  for (let i = 0; i < VOICE_FINGERPRINT_DIM; i++) {
    assert.ok(Math.abs((v1[i] ?? 0) - (v2[i] ?? 0)) < 1e-12);
  }
});

test("VoiceFingerprintExtractor refuses on empty profile_texts", async () => {
  const extractor = new VoiceFingerprintExtractor();
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "extract_voice_fingerprint",
    priority: 60,
    emitted_by: "test",
    payload: { profile_texts: [] },
  });
  const registry = new SpecialistRegistry();
  registry.register_all([extractor]);
  await make_orchestrator({ blackboard, goal_stack, registry }).run();
  assert.equal(blackboard.snapshot().hypotheses.voice_fingerprint, null);
  const last = blackboard.snapshot().audit_trail.at(-1);
  assert.equal(last?.micro_stage, "missing_input");
});

test("VoiceFingerprintExtractor persists into voice_centroids (pglite)", async () => {
  const h = await build_pglite_harness();
  try {
    const sink: VoiceFingerprintSink = {
      record: async (inp) => h.persistence.record_voice_fingerprint(inp),
    };
    const extractor = new VoiceFingerprintExtractor(sink);
    const generation_id = randomUUID();
    const jd_id = randomUUID();
    const bus = new TriggerBus();
    const blackboard = new BlackboardStore(empty_blackboard(generation_id, h.user_id, jd_id), bus);
    const goal_stack = new GoalStack();
    goal_stack.add({
      kind: "extract_voice_fingerprint",
      priority: 60,
      emitted_by: "test",
      payload: {
        profile_texts: [SAMPLE_PROFILE, "Another profile doc with different stylometry."],
      },
    });
    const registry = new SpecialistRegistry();
    registry.register_all([extractor]);
    await make_orchestrator({ blackboard, goal_stack, registry }).run();

    const rows = await h.db
      .select()
      .from(voice_centroids)
      .where(eq(voice_centroids.user_id, h.user_id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.sample_size, 2);
    const persisted = rows[0]?.vector as number[];
    assert.equal(persisted.length, VOICE_FINGERPRINT_DIM);
    // Idempotent upsert: rerun via a fresh orchestrator and verify only
    // one row remains afterwards.
    {
      const bus2 = new TriggerBus();
      const blackboard_b = new BlackboardStore(
        empty_blackboard(randomUUID(), h.user_id, jd_id),
        bus2,
      );
      const goal_stack_b = new GoalStack();
      goal_stack_b.add({
        kind: "extract_voice_fingerprint",
        priority: 60,
        emitted_by: "test",
        payload: { profile_texts: [SAMPLE_PROFILE] },
      });
      const registry_b = new SpecialistRegistry();
      registry_b.register_all([new VoiceFingerprintExtractor(sink)]);
      await make_orchestrator({
        blackboard: blackboard_b,
        goal_stack: goal_stack_b,
        registry: registry_b,
      }).run();
    }
    const rows2 = await h.db
      .select()
      .from(voice_centroids)
      .where(eq(voice_centroids.user_id, h.user_id));
    assert.equal(rows2.length, 1, "upsert must not create a second row");
    assert.equal(rows2[0]?.sample_size, 1);
  } finally {
    await h.close();
  }
});

// ─────────────── HonestyCalibrator ───────────────

test("HonestyCalibrator emits uniform priors on cold-start (no store)", async () => {
  const calibrator = new HonestyCalibrator(null);
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "calibrate_honesty",
    priority: 55,
    emitted_by: "test",
    payload: {},
  });
  const registry = new SpecialistRegistry();
  registry.register_all([calibrator]);
  await make_orchestrator({ blackboard, goal_stack, registry }).run();
  const cal = blackboard.snapshot().hypotheses.honesty_calibration;
  assert.ok(cal);
  if (!cal) return;
  for (const v of Object.values(cal)) assert.equal(v, 1);
  const last = blackboard.snapshot().audit_trail.at(-1);
  assert.equal(last?.micro_stage, "uniform_prior_no_store");
});

test("HonestyCalibrator computes Bayes posterior with verified/unverified counts", async () => {
  const counts: Record<string, { verified: number; unverified: number }> = {
    metric: { verified: 8, unverified: 2 },
    scope: { verified: 0, unverified: 5 },
  };
  const recorded: Array<{ claim_type: string; trust_factor: number }> = [];
  const store: HonestyCalibrationStore = {
    load: async () => counts,
    record: async (inp) => {
      recorded.push({ claim_type: inp.claim_type, trust_factor: inp.trust_factor });
    },
  };
  const calibrator = new HonestyCalibrator(store);
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "calibrate_honesty",
    priority: 55,
    emitted_by: "test",
    payload: { claim_types: ["metric", "scope", "achievement"] },
  });
  const registry = new SpecialistRegistry();
  registry.register_all([calibrator]);
  await make_orchestrator({ blackboard, goal_stack, registry }).run();
  const cal = blackboard.snapshot().hypotheses.honesty_calibration;
  assert.ok(cal);
  if (!cal) return;
  // metric: (1 + 8) / (2 + 8 + 2) = 9/12 = 0.75
  assert.ok(Math.abs((cal.metric ?? 0) - 0.75) < 1e-9);
  // scope: (1 + 0) / (2 + 0 + 5) = 1/7 ≈ 0.142857
  assert.ok(Math.abs((cal.scope ?? 0) - 1 / 7) < 1e-9);
  // achievement: no counts → 0.5 (uniform Beta(1,1) prior)
  assert.ok(Math.abs((cal.achievement ?? 0) - 0.5) < 1e-9);
  // The store recorded all three.
  assert.equal(recorded.length, 3);
});

test("HonestyCalibrator persists calibrations into honesty_calibrations (pglite)", async () => {
  const h = await build_pglite_harness();
  try {
    // Pre-seed one row so we can verify update-on-conflict behavior.
    await h.persistence.record_honesty_calibration({
      user_id: h.user_id,
      claim_type: "metric",
      trust_factor: 0.5,
      sample_size: 2,
    });
    const store: HonestyCalibrationStore = {
      load: async (uid) => {
        const cals = await h.persistence.load_honesty_calibrations(uid);
        const out: Record<string, { verified: number; unverified: number }> = {};
        for (const [kind, c] of Object.entries(cals)) {
          const v = Math.round(c.trust_factor * c.sample_size);
          out[kind] = { verified: v, unverified: c.sample_size - v };
        }
        return out;
      },
      record: async (inp) => h.persistence.record_honesty_calibration(inp),
    };
    const calibrator = new HonestyCalibrator(store);
    const generation_id = randomUUID();
    const jd_id = randomUUID();
    const bus = new TriggerBus();
    const blackboard = new BlackboardStore(empty_blackboard(generation_id, h.user_id, jd_id), bus);
    const goal_stack = new GoalStack();
    goal_stack.add({
      kind: "calibrate_honesty",
      priority: 55,
      emitted_by: "test",
      payload: { claim_types: ["metric", "scope"] },
    });
    const registry = new SpecialistRegistry();
    registry.register_all([calibrator]);
    await make_orchestrator({ blackboard, goal_stack, registry }).run();

    const rows = await h.db
      .select()
      .from(honesty_calibrations)
      .where(eq(honesty_calibrations.user_id, h.user_id));
    assert.equal(rows.length, 2);
    const by_kind = Object.fromEntries(rows.map((r) => [r.claim_type, r]));
    // metric was preseed (verified=1, unverified=1) → posterior (1+1)/(2+1+1) = 0.5.
    assert.ok(Math.abs((by_kind.metric?.trust_factor ?? 0) - 0.5) < 1e-9);
    // scope cold-start → 0.5.
    assert.ok(Math.abs((by_kind.scope?.trust_factor ?? 0) - 0.5) < 1e-9);
  } finally {
    await h.close();
  }
});

// ─────────────── CredibilityScanner ───────────────

test("CredibilityScanner mines disqualifiers from legal/boilerplate sentences", async () => {
  const scanner = new CredibilityScanner();
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  // Pre-populate discourse_map.
  await blackboard.commit({
    by_specialist: "test_seed",
    writes: [
      {
        path: "hypotheses.discourse_map",
        value: [
          {
            sentence_index: 0,
            text: "Must have an active US security clearance.",
            function: "legal",
            importance: 0,
          },
          {
            sentence_index: 1,
            text: "Must be authorized to work in the US without sponsorship.",
            function: "legal",
            importance: 0,
          },
          {
            sentence_index: 2,
            text: "About the role:",
            function: "boilerplate",
            importance: 0,
          },
          {
            sentence_index: 3,
            text: "We build distributed systems.",
            function: "actual_test",
            importance: 0.85,
          },
        ],
      },
    ],
    audit_entry: {
      seq: 0,
      timestamp: new Date().toISOString(),
      specialist: "test_seed",
      micro_stage: "seed",
      inputs_hash: "x",
      output_hash: "y",
      justification: "seed",
      latency_ms: 0,
      cost_usd: 0,
      writes: ["hypotheses.discourse_map"],
    },
  });

  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "scan_credibility",
    priority: 50,
    emitted_by: "test",
    payload: {},
  });
  const registry = new SpecialistRegistry();
  registry.register_all([scanner]);
  await make_orchestrator({ blackboard, goal_stack, registry }).run();
  const dq = blackboard.snapshot().hypotheses.hidden_disqualifiers;
  assert.ok(dq);
  if (!dq) return;
  assert.equal(dq.length, 2);
  // Severity-ordered: clearance (rank 100) before work-auth (rank 90).
  assert.match(dq[0] ?? "", /clearance/i);
  assert.match(dq[1] ?? "", /sponsorship|authorized to work/i);
});

test("CredibilityScanner falls back to jd_text when no discourse_map", async () => {
  const scanner = new CredibilityScanner();
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "scan_credibility",
    priority: 50,
    emitted_by: "test",
    payload: {
      jd_text: "We require US citizenship and a non-compete agreement.",
    },
  });
  const registry = new SpecialistRegistry();
  registry.register_all([scanner]);
  await make_orchestrator({ blackboard, goal_stack, registry }).run();
  const dq = blackboard.snapshot().hypotheses.hidden_disqualifiers;
  assert.ok(dq);
  if (!dq) return;
  assert.equal(dq.length, 2);
});

test("CredibilityScanner returns [] (not null) when nothing matches", async () => {
  const scanner = new CredibilityScanner();
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "scan_credibility",
    priority: 50,
    emitted_by: "test",
    payload: { jd_text: "We build systems and ship code." },
  });
  const registry = new SpecialistRegistry();
  registry.register_all([scanner]);
  await make_orchestrator({ blackboard, goal_stack, registry }).run();
  assert.deepEqual(blackboard.snapshot().hypotheses.hidden_disqualifiers, []);
});

// ─────────────── FairnessMonitor ───────────────

test("FairnessMonitor fires on gendered/age-coded language in discourse_map", async () => {
  const concerns: Array<{ category: string; text: string; severity: string }> = [];
  const monitor = new FairnessMonitor((c) => {
    concerns.push({
      category: c.conflict.payload.category as string,
      text: c.matched_text,
      severity: c.conflict.severity,
    });
  });

  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  bus.subscribe(monitor);
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);

  await blackboard.commit({
    by_specialist: "test",
    writes: [
      {
        path: "hypotheses.discourse_map",
        value: [
          {
            sentence_index: 0,
            text: "We're looking for a rockstar engineer who is energetic and aggressive.",
            function: "actual_test",
            importance: 0.9,
          },
        ],
      },
    ],
    audit_entry: {
      seq: 0,
      timestamp: new Date().toISOString(),
      specialist: "test",
      micro_stage: "seed",
      inputs_hash: "x",
      output_hash: "y",
      justification: "seed",
      latency_ms: 0,
      cost_usd: 0,
      writes: ["hypotheses.discourse_map"],
    },
  });

  // Three matches: rockstar (gendered/medium), energetic (age_coded/high),
  // aggressive (gendered/low).
  const categories = new Set(concerns.map((c) => c.category));
  assert.ok(categories.has("gendered"));
  assert.ok(categories.has("age_coded"));
  // Buffer also captured them.
  assert.ok(monitor.detections().length >= 3);
});

test("FairnessMonitor ignores benign text", async () => {
  const concerns: unknown[] = [];
  const monitor = new FairnessMonitor((c) => {
    concerns.push(c);
  });
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  bus.subscribe(monitor);
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  await blackboard.commit({
    by_specialist: "test",
    writes: [
      {
        path: "hypotheses.discourse_map",
        value: [
          {
            sentence_index: 0,
            text: "We are looking for an experienced engineer with strong communication skills.",
            function: "actual_test",
            importance: 0.85,
          },
        ],
      },
    ],
    audit_entry: {
      seq: 0,
      timestamp: new Date().toISOString(),
      specialist: "test",
      micro_stage: "seed",
      inputs_hash: "x",
      output_hash: "y",
      justification: "seed",
      latency_ms: 0,
      cost_usd: 0,
      writes: ["hypotheses.discourse_map"],
    },
  });
  assert.equal(concerns.length, 0);
});

test("FairnessMonitor's path_glob filters out unrelated writes", async () => {
  const concerns: unknown[] = [];
  // Tight glob: only watch draft.bullets.* — not discourse_map.
  const monitor = new FairnessMonitor((c) => {
    concerns.push(c);
  }, "draft.bullets.*");
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  bus.subscribe(monitor);
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  await blackboard.commit({
    by_specialist: "test",
    writes: [
      {
        path: "hypotheses.discourse_map",
        value: [
          {
            sentence_index: 0,
            text: "rockstar ninja guru",
            function: "boilerplate",
            importance: 0,
          },
        ],
      },
    ],
    audit_entry: {
      seq: 0,
      timestamp: new Date().toISOString(),
      specialist: "test",
      micro_stage: "seed",
      inputs_hash: "x",
      output_hash: "y",
      justification: "seed",
      latency_ms: 0,
      cost_usd: 0,
      writes: ["hypotheses.discourse_map"],
    },
  });
  assert.equal(concerns.length, 0, "glob should suppress non-matching paths");
});
