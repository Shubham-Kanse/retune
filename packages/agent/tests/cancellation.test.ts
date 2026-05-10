/**
 * Failure mode: external signal abort (prd-2.0 §9, failure #6).
 *
 * When a client disconnects or sends an abort signal mid-generation,
 * the orchestrator must stop within the current tick and report
 * `external_abort` termination.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard, Goal, GoalKind } from "@retune/types";
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
import type { Specialist, SpecialistContext, SpecialistResult } from "../src/workbench/types";

class SlowSpecialist implements Specialist {
  readonly id = "slow_specialist";
  readonly display_name = "Slow Specialist";
  readonly brain_region = "test";
  readonly handles_goal_kinds: readonly GoalKind[] = ["narrate_layer"];
  readonly estimated_cost_usd = 0.001;
  readonly estimated_latency_ms = 100;

  async run(_ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      writes: [{ path: "hypotheses.narrative_paragraphs", value: [] }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        inputs_hash: "test",
        output_hash: "test",
        latency_ms: 50,
        cost_usd: 0.001,
        writes: ["hypotheses.narrative_paragraphs"],
      },
    };
  }
}

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

test("external abort signal terminates orchestrator between ticks", async () => {
  const ac = new AbortController();
  const bus = new TriggerBus();
  const bb = new BlackboardStore(empty_blackboard(), bus);
  const goals = new GoalStack();
  const registry = new SpecialistRegistry();
  registry.register(new SlowSpecialist());

  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 1,
    hard_kill_usd: 2,
    per_specialist_spent: {},
  });

  // Push multiple goals so the orchestrator would loop
  goals.add({ kind: "narrate_layer", priority: 50, emitted_by: "test" });
  goals.add({ kind: "narrate_layer", priority: 40, emitted_by: "test" });
  goals.add({ kind: "narrate_layer", priority: 30, emitted_by: "test" });

  const orchestrator = new Orchestrator({
    blackboard: bb,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget,
  });

  // Abort after the first tick completes
  setTimeout(() => ac.abort(), 70);

  const result = await orchestrator.run({
    max_ticks: 100,
    external_signal: ac.signal,
  });

  assert.equal(result.termination, "external_abort");
  assert.ok(result.ticks_executed >= 1, "should have run at least 1 tick");
  assert.ok(result.ticks_executed < 3, "should have stopped before all 3 ticks");
});

test("pre-aborted signal terminates immediately", async () => {
  const ac = new AbortController();
  ac.abort();

  const bus = new TriggerBus();
  const bb = new BlackboardStore(empty_blackboard(), bus);
  const goals = new GoalStack();
  const registry = new SpecialistRegistry();
  registry.register(new SlowSpecialist());

  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 1,
    hard_kill_usd: 2,
    per_specialist_spent: {},
  });

  goals.add({ kind: "narrate_layer", priority: 50, emitted_by: "test" });

  const orchestrator = new Orchestrator({
    blackboard: bb,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: new AuditTrail(),
    budget,
  });

  const result = await orchestrator.run({
    max_ticks: 100,
    external_signal: ac.signal,
  });

  assert.equal(result.termination, "external_abort");
  assert.equal(result.ticks_executed, 0);
});

test("abort during retry backoff surfaces cleanly", async () => {
  const { MLClientError } = await import("../src/ml-client/errors");
  const { with_retries, DEFAULT_RETRY_POLICY } = await import("../src/ml-client/retry-policy");

  const ac = new AbortController();
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 500, max_delay_ms: 2000 };

  // Abort during backoff sleep
  setTimeout(() => ac.abort(), 10);

  await assert.rejects(
    () =>
      with_retries(
        () => {
          throw new MLClientError("server_5xx", "down", 503);
        },
        policy,
        ac.signal,
      ),
    (err: InstanceType<typeof MLClientError>) => {
      assert.equal(err.kind, "aborted");
      return true;
    },
  );
});
