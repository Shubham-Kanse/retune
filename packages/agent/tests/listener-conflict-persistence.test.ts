/**
 * Listener-conflict persistence (technical-2.0 §9, §20 Phase 3).
 *
 * Proves the v2.0 fix for issue #7: trigger-bus listeners
 * (FairnessMonitor, VoiceDriftMonitor, WellBeingMonitor) push concerns
 * into a shared `ConflictStagingQueue`; the orchestrator drains the
 * queue at the top of every tick and commits the staged conflicts onto
 * the blackboard via a synthetic `listener_drainer` audit entry.
 *
 * Without this wiring, listener concerns existed only in an in-memory
 * ring buffer and evaporated when the workflow completed.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard } from "@retune/types";
import { OntologyResolver } from "../src/memory";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  CompanySchemaRetriever,
  ConflictStagingQueue,
  FairnessMonitor,
  GoalStack,
  Orchestrator,
  SpecialistRegistry,
  TitleSchemaRetriever,
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

test("orchestrator drains listener-staged conflicts onto the blackboard", async () => {
  const conflict_staging = new ConflictStagingQueue();
  const bus = new TriggerBus();
  const fairness = new FairnessMonitor(() => {}, "**", conflict_staging);
  bus.subscribe(fairness);

  const store = new BlackboardStore(empty_blackboard(), bus);
  const goals = new GoalStack();
  const resolver = new OntologyResolver();
  const registry = new SpecialistRegistry();
  registry.register_all([new TitleSchemaRetriever(resolver), new CompanySchemaRetriever(resolver)]);
  const audit = new AuditTrail();
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.05,
    hard_kill_usd: 0.2,
    per_specialist_spent: {},
  });
  const orchestrator = new Orchestrator({
    blackboard: store,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: audit,
    budget,
    conflict_staging,
  });

  // Stage a fairness concern manually — simulates what FairnessMonitor
  // would push when it sees gendered language. We bypass the listener
  // event path here so the test is hermetic.
  conflict_staging.stage({
    monitor: "fairness_concern",
    severity: "medium",
    payload: { category: "gendered", description: "test", matched_text: "rockstar" },
    emitted_by: "fairness_monitor",
  });
  assert.equal(conflict_staging.pending(), 1);

  // Seed an arbitrary goal so the orchestrator runs at least one tick.
  goals.add({
    kind: "analyze_jd",
    priority: 80,
    emitted_by: "test",
    payload: { jd_title: "Senior Software Engineer" },
  });

  await orchestrator.run({ max_ticks: 4 });

  // Queue must be drained.
  assert.equal(conflict_staging.pending(), 0);

  // Conflict landed on the blackboard.
  const snap = store.snapshot();
  assert.ok(snap.conflicts.length >= 1, `expected ≥ 1 conflict, got ${snap.conflicts.length}`);
  const fairness_conflicts = snap.conflicts.filter((c) => c.monitor === "fairness_concern");
  assert.equal(fairness_conflicts.length, 1);
  assert.equal(fairness_conflicts[0]!.severity, "medium");
  assert.equal(
    (fairness_conflicts[0]!.payload as { matched_text?: string }).matched_text,
    "rockstar",
  );

  // Audit trail recorded the synthetic drain entry.
  const drain_entries = audit.list().filter((e) => e.specialist === "listener_drainer");
  assert.equal(drain_entries.length, 1);
  assert.equal(drain_entries[0]!.micro_stage, "drain_staged_conflicts");
});

test("FairnessMonitor stages a fairness_concern when it detects gendered language", async () => {
  const conflict_staging = new ConflictStagingQueue();
  const bus = new TriggerBus();
  const fairness = new FairnessMonitor(() => {}, "**", conflict_staging);
  bus.subscribe(fairness);

  const store = new BlackboardStore(empty_blackboard(), bus);
  // Write a discourse map containing a gendered cliché.
  await store.commit({
    by_specialist: "test",
    writes: [
      {
        path: "hypotheses.discourse_map",
        value: [
          {
            sentence_index: 0,
            text: "We're looking for a rockstar engineer.",
            function: "filter",
            importance: 1.0,
          },
        ],
      },
    ],
    audit_entry: {
      seq: 1,
      timestamp: new Date().toISOString(),
      specialist: "test",
      micro_stage: "seed",
      inputs_hash: "test",
      output_hash: "test",
      justification: "seed",
      latency_ms: 0,
      cost_usd: 0,
      writes: ["hypotheses.discourse_map"],
    },
  });

  // Listener fired async — give the bus a microtask to flush.
  await new Promise((r) => setTimeout(r, 0));

  // Fairness staged a "rockstar" concern.
  assert.ok(conflict_staging.pending() >= 1);
  const drained = conflict_staging.drain();
  const has_rockstar = drained.some(
    (c) =>
      c.monitor === "fairness_concern" &&
      (c.payload as { matched_text?: string }).matched_text === "rockstar",
  );
  assert.ok(has_rockstar, `expected a 'rockstar' conflict, got: ${JSON.stringify(drained)}`);
});
