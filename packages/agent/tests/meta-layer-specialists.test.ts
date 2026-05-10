/**
 * Meta-layer specialists tests (technical-2.0 §24).
 *
 * Tests EmotionalStateModeler, MoodFingerprintSpecialist,
 * MotivationModulator, and Narrator.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard, Goal } from "@retune/types";
import {
  EmotionalStateModeler,
  MoodFingerprintSpecialist,
  MotivationModulator,
  Narrator,
} from "../src/specialists";
import type { SpecialistContext } from "../src/workbench/types";

function make_goal(kind: string, payload?: Record<string, unknown>): Goal {
  return {
    id: randomUUID(),
    kind: kind as Goal["kind"],
    priority: 50,
    emitted_by: "test",
    status: "pending",
    satisfied_by: [],
    parent_goal_id: null,
    payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function make_ctx(overrides?: Partial<Blackboard>): SpecialistContext {
  const now = new Date().toISOString();
  const bb: Blackboard = {
    generation_id: randomUUID(),
    user_id: randomUUID(),
    jd_id: randomUUID(),
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
    cost_budget: { spent_usd: 0, ceiling_usd: 1, hard_kill_usd: 2, per_specialist_spent: {} },
    audit_trail: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  return {
    blackboard: bb,
    tick: 0,
    trace_id: `test-${randomUUID()}`,
    signal: new AbortController().signal,
  };
}

// ──────── EmotionalStateModeler ────────

test("EmotionalStateModeler: infers neutral state with no signals", async () => {
  const specialist = new EmotionalStateModeler();
  const goal = make_goal("infer_emotional_state");
  const result = await specialist.run(make_ctx(), goal);

  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0]!.path, "hypotheses.emotional_state");
  const state = result.writes[0]!.value as { primary_emotion: string; confidence: number };
  assert.equal(state.primary_emotion, "neutral");
  assert.ok(state.confidence <= 0.3);
});

test("EmotionalStateModeler: high desperation → anxious/overwhelmed", async () => {
  const specialist = new EmotionalStateModeler();
  const goal = make_goal("infer_emotional_state");
  const ctx = make_ctx({
    hypotheses: {
      role_schema: null,
      company_schema: null,
      discourse_map: null,
      hidden_disqualifiers: null,
      desperation_index: { point: 0.9, lower: 0.8, upper: 0.95, coverage: 0.95 },
      cultural_vector: null,
      candidate_credibility_prior: null,
      voice_fingerprint: null,
      honesty_calibration: null,
      narrative_arcs_candidates: [],
      chosen_narrative_arc: null,
    },
  } as Partial<Blackboard>);
  const result = await specialist.run(ctx, goal);

  const state = result.writes[0]!.value as {
    primary_emotion: string;
    valence: number;
    arousal: number;
  };
  assert.ok(state.valence < 0, "valence should be negative with high desperation");
  assert.ok(state.arousal > 0, "arousal should be elevated");
  assert.ok(["anxious", "overwhelmed", "frustrated"].includes(state.primary_emotion));
});

// ──────── MoodFingerprintSpecialist ────────

test("MoodFingerprintSpecialist: empty history → zero fingerprint", async () => {
  const specialist = new MoodFingerprintSpecialist();
  const goal = make_goal("compute_mood_fingerprint");
  const result = await specialist.run(make_ctx(), goal);

  const fp = result.writes[0]!.value as { sample_count: number; stability: number };
  assert.equal(fp.sample_count, 0);
  assert.equal(fp.stability, 1);
});

test("MoodFingerprintSpecialist: aggregates history", async () => {
  const history = [
    { valence: 0.5, arousal: 0.3, dominance: 0.4 },
    { valence: 0.6, arousal: 0.2, dominance: 0.5 },
    { valence: 0.4, arousal: 0.4, dominance: 0.3 },
  ];
  const specialist = new MoodFingerprintSpecialist(history);
  const goal = make_goal("compute_mood_fingerprint");
  const result = await specialist.run(make_ctx(), goal);

  const fp = result.writes[0]!.value as {
    valence_avg: number;
    sample_count: number;
    stability: number;
  };
  assert.equal(fp.sample_count, 3);
  assert.ok(fp.valence_avg > 0.4 && fp.valence_avg < 0.6);
  assert.ok(fp.stability > 0.9, "low variance → high stability");
});

// ──────── MotivationModulator ────────

test("MotivationModulator: produces drive levels from claims", async () => {
  const specialist = new MotivationModulator();
  const goal = make_goal("update_motivation_modulator");
  const ctx = make_ctx({
    draft: {
      sections: {},
      bullets: {},
      claims: {
        c1: {
          id: randomUUID(),
          text: "Led team of 5",
          evidence_span_ids: [randomUUID()],
          confidence: { point: 0.8, lower: 0.7, upper: 0.9, coverage: 0.95 },
          claim_kind: "leadership",
        },
        c2: {
          id: randomUUID(),
          text: "Increased revenue 20%",
          evidence_span_ids: [randomUUID()],
          confidence: { point: 0.7, lower: 0.6, upper: 0.8, coverage: 0.95 },
          claim_kind: "metric",
        },
      },
      pending_revisions: [],
    },
  } as Partial<Blackboard>);

  const result = await specialist.run(ctx, goal);
  const levels = result.writes[0]!.value as { levels: Record<string, number> };
  assert.ok("leadership" in levels.levels);
  assert.ok("metric" in levels.levels);
  assert.ok(levels.levels.leadership! >= 0 && levels.levels.leadership! <= 1);
});

// ──────── Narrator ────────

test("Narrator: narrates comprehension layer by default", async () => {
  const specialist = new Narrator();
  const goal = make_goal("narrate_layer");
  const result = await specialist.run(make_ctx(), goal);

  const paragraphs = result.writes[0]!.value as Array<{ layer: string; text: string }>;
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0]!.layer, "comprehension");
  assert.ok(paragraphs[0]!.text.length > 0);
});

test("Narrator: respects layer from goal payload", async () => {
  const specialist = new Narrator();
  const goal = make_goal("narrate_layer", { layer: "decision" });
  const ctx = make_ctx();
  (ctx.blackboard.hypotheses as Record<string, unknown>).ship_decision = {
    verdict: "ship",
    interview_ready_score: 85,
  };

  const result = await specialist.run(ctx, goal);
  const paragraphs = result.writes[0]!.value as Array<{ layer: string; text: string }>;
  assert.equal(paragraphs[0]!.layer, "decision");
  assert.ok(paragraphs[0]!.text.includes("SHIP"));
});
