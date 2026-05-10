/**
 * JdSpanExtractor unit + persistence tests.
 *
 * Two flavors:
 *   1. Unit — mock MLClient + in-memory sink. Verifies the specialist's
 *      contract (writes evidence_graph.span_ids, satisfies the goal,
 *      drops bogus offsets, refuses missing input).
 *   2. Persistence — real MLClient against a stub HttpTransport that
 *      returns a fixed payload, plus pglite-backed persistence. Verifies
 *      that real evidence_spans rows are written and the returned ids
 *      match what's on the blackboard.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { evidence_spans } from "@retune/db/pg";
import type {
  Blackboard,
  EmbedRequest,
  EmbedResponse,
  ExtractSpansRequest,
  ExtractSpansResponse,
  MLHealthResponse,
} from "@retune/types";
import { eq } from "drizzle-orm";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  type ExtractedSpansSink,
  GoalStack,
  JdSpanExtractor,
  MLClient,
  type MLTransport,
  Orchestrator,
  SpecialistRegistry,
  TriggerBus,
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

class FakeTransport implements MLTransport {
  readonly kind = "http" as const;
  constructor(private readonly response: ExtractSpansResponse) {}
  async health(_signal?: AbortSignal): Promise<MLHealthResponse> {
    return {
      status: "ok",
      service: "retune-ml",
      version: "test",
      uptime_seconds: 0,
      models_loaded: [],
    };
  }
  async embed(_req: EmbedRequest): Promise<EmbedResponse> {
    return { embeddings: [], model_version: "test", latency_ms: 0 };
  }
  async extract_spans(_req: ExtractSpansRequest): Promise<ExtractSpansResponse> {
    return this.response;
  }
}

const FIXED_RESPONSE: ExtractSpansResponse = {
  spans: [
    {
      kind: "skill",
      text: "Python",
      char_start: 7,
      char_end: 13,
      confidence: { point: 0.9, lower: 0.85, upper: 0.95, coverage: 0.95 },
      payload: { matcher: "test" },
    },
    {
      kind: "company",
      text: "Stripe",
      char_start: 25,
      char_end: 31,
      confidence: { point: 0.92, lower: 0.87, upper: 0.97, coverage: 0.95 },
      payload: { matcher: "test" },
    },
    // Bogus span: char_end out of bounds. Specialist must drop it.
    {
      kind: "skill",
      text: "ghost",
      char_start: 999,
      char_end: 1005,
      confidence: { point: 0.5, lower: 0.4, upper: 0.6, coverage: 0.95 },
      payload: {},
    },
  ],
  model_version: "test-v1",
  latency_ms: 0,
};

const TEXT = "I love Python and joined Stripe."; // length 32

// ──────────── unit ────────────

test("JdSpanExtractor writes evidence_graph.span_ids and drops out-of-bounds spans", async () => {
  const transport = new FakeTransport(FIXED_RESPONSE);
  const ml = new MLClient({ transport });

  const recorded: Array<{ kind: string; text: string }> = [];
  const sink: ExtractedSpansSink = {
    async record(input) {
      for (const s of input.spans) recorded.push({ kind: s.kind, text: s.text });
      return input.spans.map(() => randomUUID());
    },
  };

  const extractor = new JdSpanExtractor(ml, sink);
  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);

  const goal_stack = new GoalStack();
  const goal = goal_stack.add({
    kind: "extract_spans",
    priority: 75,
    emitted_by: "test",
    payload: { text: TEXT, source_doc_kind: "rendered_document", span_kinds: [] },
  });

  const registry = new SpecialistRegistry();
  registry.register_all([extractor]);

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
  assert.equal(result.ticks_executed, 1, "specialist runs once for one extract_spans goal");

  const span_ids = blackboard.snapshot().evidence_graph.span_ids;
  assert.equal(span_ids.length, 2, "exactly 2 valid spans persisted (ghost dropped)");
  assert.deepEqual(
    recorded.map((r) => r.text),
    ["Python", "Stripe"],
    "sink received only valid spans in input order",
  );
  assert.deepEqual(
    recorded.map((r) => r.kind),
    ["skill", "company"],
  );

  const audit = blackboard.snapshot().audit_trail;
  const last = audit[audit.length - 1];
  assert.equal(last?.specialist, "jd_span_extractor");
  assert.match(last?.justification ?? "", /1 dropped/);

  // Goal must be satisfied so a second tick wouldn't re-run the specialist.
  const post_goal = goal_stack.snapshot().find((g) => g.id === goal.id);
  assert.equal(post_goal?.status, "satisfied");
});

test("JdSpanExtractor refuses gracefully when goal payload has no text", async () => {
  const transport = new FakeTransport(FIXED_RESPONSE);
  const ml = new MLClient({ transport });
  const sink: ExtractedSpansSink = {
    async record(input) {
      return input.spans.map(() => randomUUID());
    },
  };
  const extractor = new JdSpanExtractor(ml, sink);

  const generation_id = randomUUID();
  const user_id = randomUUID();
  const jd_id = randomUUID();
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(empty_blackboard(generation_id, user_id, jd_id), bus);
  const goal_stack = new GoalStack();
  goal_stack.add({
    kind: "extract_spans",
    priority: 75,
    emitted_by: "test",
    payload: { text: "", source_doc_kind: "profile", span_kinds: [] },
  });
  const registry = new SpecialistRegistry();
  registry.register_all([extractor]);

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
  assert.equal(result.ticks_executed, 1);
  assert.deepEqual(blackboard.snapshot().evidence_graph.span_ids, []);
  const audit = blackboard.snapshot().audit_trail;
  const last = audit[audit.length - 1];
  assert.equal(last?.micro_stage, "missing_input");
});

// ──────────── persistence ────────────

test("JdSpanExtractor persists evidence_spans rows to pglite", async () => {
  const h = await build_pglite_harness();
  try {
    const transport = new FakeTransport(FIXED_RESPONSE);
    const ml = new MLClient({ transport });
    const sink: ExtractedSpansSink = {
      record: async (inp) => h.persistence.record_extracted_spans(inp),
    };
    const extractor = new JdSpanExtractor(ml, sink);

    const generation_id = randomUUID();
    const jd_id = randomUUID();
    const { jds } = await import("@retune/db/pg");
    await h.db.insert(jds).values({
      id: jd_id,
      source: "test",
      content_hash: "abc",
      raw_text: "seed",
    });

    const bus = new TriggerBus();
    const blackboard = new BlackboardStore(empty_blackboard(generation_id, h.user_id, jd_id), bus);
    const goal_stack = new GoalStack();
    goal_stack.add({
      kind: "extract_spans",
      priority: 75,
      emitted_by: "test",
      payload: { text: TEXT, source_doc_kind: "rendered_document", span_kinds: [] },
    });
    const registry = new SpecialistRegistry();
    registry.register_all([extractor]);

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
      persistence: h.persistence,
    });

    await orchestrator.run({
      generation_context: {
        user_id: h.user_id,
        jd_id,
        ontology_version: "0.0.1",
      },
    });

    const rows = await h.db
      .select()
      .from(evidence_spans)
      .where(eq(evidence_spans.user_id, h.user_id));
    assert.equal(rows.length, 2, "two rows persisted");
    const kinds = new Set(rows.map((r) => r.span_type));
    assert.deepEqual(kinds, new Set(["skill", "company"]));
    for (const r of rows) {
      assert.equal(r.provenance, "extracted");
      assert.ok(r.confidence > 0.8);
      assert.equal(r.source_document_id, jd_id);
    }

    // Blackboard span_ids match the inserted row ids.
    const span_ids_on_bb = blackboard.snapshot().evidence_graph.span_ids;
    const persisted_ids = new Set(rows.map((r) => r.id));
    assert.deepEqual(new Set(span_ids_on_bb), persisted_ids);
  } finally {
    await h.close();
  }
});
