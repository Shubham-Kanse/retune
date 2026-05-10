/**
 * Discourse pipeline tests — DiscourseClassifier + BoilerplateStripper +
 * CulturalCalibrator running together in a fresh orchestrator.
 *
 * Uses a `FakeTransport` that returns deterministic fixtures so the
 * test runs without spawning the Python ML server. The cross-language
 * E2E test already proves the wire format end-to-end.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  Blackboard,
  ClassifyDiscourseRequest,
  ClassifyDiscourseResponse,
  EmbedRequest,
  EmbedResponse,
  ExtractSpansRequest,
  ExtractSpansResponse,
  MLHealthResponse,
} from "@retune/types";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BoilerplateStripper,
  BudgetController,
  CULTURAL_VECTOR_DIM,
  CulturalCalibrator,
  DiscourseClassifier,
  GoalStack,
  MLClient,
  type MLTransport,
  Orchestrator,
  STRIPPED_IMPORTANCE,
  SpecialistRegistry,
  TriggerBus,
} from "../src/sota-exports";

// ─────────── helpers ───────────

const EMBEDDING_DIM = 768;

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

/**
 * Deterministic synthetic embedding — same hash → same vector. Used so
 * the cultural calibrator produces stable results across test runs.
 */
function synthetic_embed(text: string): number[] {
  // Tiny FNV-1a hash → seed → unit vector.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out = new Array<number>(EMBEDDING_DIM);
  let acc = h >>> 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    // Linear congruential rng on top of the hash.
    acc = (acc * 1664525 + 1013904223) >>> 0;
    out[i] = (acc / 0xffffffff) * 2 - 1;
  }
  // L2-normalize so dot products land in [-1, 1].
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  return out.map((x) => x / n);
}

class DiscourseFakeTransport implements MLTransport {
  readonly kind = "http" as const;

  async health(): Promise<MLHealthResponse> {
    return {
      status: "ok",
      service: "retune-ml",
      version: "test",
      uptime_seconds: 0,
      models_loaded: [],
    };
  }

  async embed(req: EmbedRequest): Promise<EmbedResponse> {
    return {
      embeddings: req.texts.map(synthetic_embed),
      model_version: "fake-bge",
      latency_ms: 0,
    };
  }

  async extract_spans(_req: ExtractSpansRequest): Promise<ExtractSpansResponse> {
    return { spans: [], model_version: "fake", latency_ms: 0 };
  }

  async classify_discourse(req: ClassifyDiscourseRequest): Promise<ClassifyDiscourseResponse> {
    // Hand-crafted response mirroring the Python stub on a canonical JD.
    // The text is split into 5 sentences with one of each interesting
    // function so all downstream branches are exercised.
    const lines = req.jd_text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const sentences = lines.map((text, i) => {
      const fn = label_for(text);
      return {
        sentence_index: i,
        text,
        function: fn,
        function_logits: {
          filter: 0,
          actual_test: 0,
          aspiration: 0,
          culture: 0,
          legal: 0,
          boilerplate: 0,
          [fn]: 1,
        } as Record<ClassifyDiscourseResponse["sentences"][number]["function"], number>,
        importance:
          fn === "filter" ? 0.95 : fn === "actual_test" ? 0.85 : fn === "culture" ? 0.5 : 0.1,
      };
    });
    return {
      sentences,
      model_version: "fake-deberta",
      latency_ms: 0,
    };
  }
}

function label_for(text: string): ClassifyDiscourseResponse["sentences"][number]["function"] {
  const s = text.toLowerCase();
  if (s.includes("equal opportunity")) return "legal";
  if (s.startsWith("about ")) return "boilerplate";
  if (s.includes("must have") || s.includes("required")) return "filter";
  if (s.includes("nice to have") || s.includes("bonus")) return "aspiration";
  if (s.includes("async") || s.includes("we value") || s.includes("culture")) return "culture";
  return "actual_test";
}

const JD = `About the role
We're hiring a Senior Software Engineer to build distributed systems
Must have an active US security clearance
Bonus points for Kafka experience
We work async-first across 8 time zones
Equal opportunity employer`;

// ─────────── tests ───────────

test("DiscourseClassifier writes discourse_map and emits strip child goal", async () => {
  const ml = new MLClient({ transport: new DiscourseFakeTransport() });
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "classify_discourse",
    priority: 70,
    emitted_by: "test",
    payload: { jd_text: JD },
  });

  const registry = new SpecialistRegistry();
  registry.register_all([new DiscourseClassifier(ml), new BoilerplateStripper()]);

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    }),
  });

  const result = await orchestrator.run();
  // Tick 1: classifier writes discourse_map, pushes strip goal
  // Tick 2: stripper zeroes out boilerplate + legal
  assert.ok(result.ticks_executed >= 2, `expected ≥ 2 ticks, got ${result.ticks_executed}`);

  const map = blackboard.snapshot().hypotheses.discourse_map;
  assert.ok(map, "discourse_map must be populated");
  if (!map) return;

  // All sentences are present, in order.
  for (let i = 0; i < map.length; i++) {
    assert.equal(map[i]?.sentence_index, i);
  }

  // Every sentence has one of the six known functions.
  const known = new Set(["filter", "actual_test", "aspiration", "culture", "legal", "boilerplate"]);
  for (const s of map) assert.ok(known.has(s.function));

  // Stripper ran: boilerplate + legal sentences have importance == 0.
  const suppressed = map.filter((s) => s.function === "boilerplate" || s.function === "legal");
  assert.ok(suppressed.length >= 1, "test JD should have at least one boilerplate/legal sentence");
  for (const s of suppressed) assert.equal(s.importance, STRIPPED_IMPORTANCE);

  // Substantive sentences kept their importance.
  const kept = map.filter((s) => s.function === "actual_test" || s.function === "filter");
  for (const s of kept) assert.ok(s.importance > 0.5);
});

test("DiscourseClassifier refuses when jd_text is too short", async () => {
  const ml = new MLClient({ transport: new DiscourseFakeTransport() });
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "classify_discourse",
    priority: 70,
    emitted_by: "test",
    payload: { jd_text: "too short" },
  });

  const registry = new SpecialistRegistry();
  registry.register_all([new DiscourseClassifier(ml)]);

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    }),
  });

  await orchestrator.run();
  assert.equal(blackboard.snapshot().hypotheses.discourse_map, null);
  const audit = blackboard.snapshot().audit_trail;
  const last = audit[audit.length - 1];
  assert.equal(last?.specialist, "discourse_classifier");
  assert.equal(last?.micro_stage, "missing_input");
});

test("BoilerplateStripper is a no-op when discourse_map is null", async () => {
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "strip_discourse_boilerplate",
    priority: 70,
    emitted_by: "test",
    payload: {},
  });

  const registry = new SpecialistRegistry();
  registry.register_all([new BoilerplateStripper()]);

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    }),
  });

  await orchestrator.run();
  assert.equal(blackboard.snapshot().hypotheses.discourse_map, null);
  const audit = blackboard.snapshot().audit_trail;
  assert.equal(audit[audit.length - 1]?.micro_stage, "skipped_no_discourse_map");
});

test("CulturalCalibrator writes an 8-dim cultural fingerprint", async () => {
  const ml = new MLClient({ transport: new DiscourseFakeTransport() });
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);

  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "calibrate_cultural_vector",
    priority: 65,
    emitted_by: "test",
    payload: { jd_text: JD },
  });

  const registry = new SpecialistRegistry();
  registry.register_all([new CulturalCalibrator(ml)]);

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    }),
  });

  await orchestrator.run();
  const cv = blackboard.snapshot().hypotheses.cultural_vector;
  assert.ok(cv, "cultural_vector must be populated");
  if (!cv) return;
  assert.equal(cv.length, CULTURAL_VECTOR_DIM);
  for (const x of cv) {
    assert.ok(x >= -1 && x <= 1, `axis value out of [-1,1]: ${x}`);
    assert.ok(Number.isFinite(x), "axis value must be finite");
  }
});

test("CulturalCalibrator prefers culture-tagged sentences when discourse_map is populated", async () => {
  const ml = new MLClient({ transport: new DiscourseFakeTransport() });
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);

  // Pre-populate a discourse_map with one culture sentence + several others.
  await blackboard.commit({
    by_specialist: "test_seed",
    writes: [
      {
        path: "hypotheses.discourse_map",
        value: [
          {
            sentence_index: 0,
            text: "About the team",
            function: "boilerplate",
            importance: 0,
          },
          {
            sentence_index: 1,
            text: "We work async-first across 8 time zones",
            function: "culture",
            importance: 0.5,
          },
          {
            sentence_index: 2,
            text: "Build distributed systems",
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
    kind: "calibrate_cultural_vector",
    priority: 65,
    emitted_by: "test",
    payload: { jd_text: JD },
  });

  const registry = new SpecialistRegistry();
  registry.register_all([new CulturalCalibrator(ml)]);

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget: new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    }),
  });

  await orchestrator.run();
  const cv = blackboard.snapshot().hypotheses.cultural_vector;
  assert.ok(cv, "cultural_vector must be populated");
  if (!cv) return;
  assert.equal(cv.length, CULTURAL_VECTOR_DIM);

  // Audit reflects that we used culture sentences.
  const last_audit = blackboard
    .snapshot()
    .audit_trail.find((a) => a.specialist === "cultural_calibrator");
  assert.ok(last_audit);
  assert.equal(last_audit?.micro_stage, "embed_and_project");
});
