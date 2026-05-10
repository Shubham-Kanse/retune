/**
 * ActiveQuestionHandler tests.
 *
 * Verifies that a `request_user_input` goal pushed by TitleSchemaRetriever
 * for an unknown title is consumed by the handler, written to the
 * `active_questions` table, and surfaced through the audit trail.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { active_questions } from "@retune/db/pg";
import type { Blackboard } from "@retune/types";
import { eq } from "drizzle-orm";
import {
  ActiveQuestionHandler,
  type ActiveQuestionSink,
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  GoalStack,
  OntologyResolver,
  Orchestrator,
  SpecialistRegistry,
  TitleSchemaRetriever,
  TriggerBus,
} from "../src/sota-exports";
import { build_pglite_harness } from "./helpers/pglite-harness";

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

test("unknown title → handler persists active_questions row", async () => {
  const h = await build_pglite_harness();
  try {
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
    const goals = new GoalStack();
    const resolver = new OntologyResolver();
    const registry = new SpecialistRegistry();

    const sink: ActiveQuestionSink = {
      record: async (input) => h.persistence.record_active_question(input),
    };
    registry.register_all([new TitleSchemaRetriever(resolver), new ActiveQuestionHandler(sink)]);

    goals.add({
      kind: "analyze_jd",
      priority: 80,
      emitted_by: "test",
      payload: { jd_title: "Vibe Platform Architect" }, // not in seed data
    });

    const orchestrator = new Orchestrator({
      blackboard,
      goal_stack: goals,
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

    const result = await orchestrator.run({
      generation_context: {
        user_id: h.user_id,
        jd_id,
        ontology_version: "0.0.1",
      },
    });

    // Tick 1: TitleSchemaRetriever (miss → pushes request_user_input)
    // Tick 2: ActiveQuestionHandler (records)
    assert.ok(result.ticks_executed >= 2, `expected ≥2 ticks, got ${result.ticks_executed}`);

    const rows = await h.db
      .select()
      .from(active_questions)
      .where(eq(active_questions.generation_id, generation_id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.target_field, "hypotheses.role_schema");
    assert.match(rows[0]?.question ?? "", /canonical role family/i);
    assert.equal(rows[0]?.user_id, h.user_id);
  } finally {
    await h.close();
  }
});
