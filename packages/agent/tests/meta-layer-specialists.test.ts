/**
 * Meta-layer specialists tests (technical-2.0 §24).
 *
 * Tests the Narrator meta-layer specialist.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard, Goal } from "@retune/types";
import { Narrator } from "../src/specialists";
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
