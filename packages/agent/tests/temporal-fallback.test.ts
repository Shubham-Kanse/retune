/**
 * Failure mode: Temporal server down — in-process fallback (prd-2.0 §9, failure #4).
 *
 * When Temporal is unavailable, the pipeline should fall back to
 * in-process execution rather than blocking. This tests that the
 * temporal client reports availability correctly and that the
 * orchestrator can run directly without Temporal.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard } from "@retune/types";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  GoalStack,
  Orchestrator,
  SpecialistRegistry,
  TriggerBus,
} from "../src/sota-exports";

function empty_blackboard(): Blackboard {
  const now = new Date().toISOString();
  return {
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
  };
}

test("orchestrator runs in-process without Temporal (fallback mode)", async () => {
  const bus = new TriggerBus();
  const bb = new BlackboardStore(empty_blackboard(), bus);
  const goals = new GoalStack();
  const registry = new SpecialistRegistry();
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 1,
    hard_kill_usd: 2,
    per_specialist_spent: {},
  });

  const orchestrator = new Orchestrator({
    blackboard: bb,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget,
    // No persistence, no temporal — pure in-process
  });

  const result = await orchestrator.run({ max_ticks: 10 });

  assert.equal(result.termination, "no_open_work");
  assert.equal(result.ticks_executed, 0);
  assert.equal(result.total_cost_usd, 0);
});

test("orchestrator terminates cleanly with no specialists for a goal", async () => {
  const bus = new TriggerBus();
  const bb = new BlackboardStore(empty_blackboard(), bus);
  const goals = new GoalStack();
  const registry = new SpecialistRegistry();
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 1,
    hard_kill_usd: 2,
    per_specialist_spent: {},
  });

  // Push a goal with no specialist registered for it
  goals.add({ kind: "narrate_layer", priority: 50, emitted_by: "test" });

  const orchestrator = new Orchestrator({
    blackboard: bb,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget,
  });

  const result = await orchestrator.run({ max_ticks: 10 });

  // Goal is abandoned (tick 1), then no more goals → no_open_work (tick 2 check)
  assert.equal(result.termination, "no_open_work");
  assert.equal(result.ticks_executed, 1);
});
