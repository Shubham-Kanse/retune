/**
 * Persistence round-trip tests.
 *
 * Starts a fresh pglite, boots the orchestrator with PostgresPersistence,
 * runs a generation, then loads state back via the same adapter and
 * asserts byte-level equivalence on the load-bearing fields.
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
  CompanySchemaRetriever,
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

test("round-trip: run two specialists → load → state matches", async () => {
  const h = await build_pglite_harness();
  try {
    const generation_id = randomUUID();
    const jd_id = randomUUID();

    const bus = new TriggerBus();
    const blackboard = new BlackboardStore(empty_blackboard(generation_id, h.user_id, jd_id), bus);
    const goals = new GoalStack();
    const resolver = new OntologyResolver();
    const registry = new SpecialistRegistry();
    registry.register_all([
      new TitleSchemaRetriever(resolver),
      new CompanySchemaRetriever(resolver),
    ]);
    const budget = new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    });

    goals.add({
      kind: "analyze_jd",
      priority: 80,
      emitted_by: "test",
      payload: { jd_title: "Senior Software Engineer" },
    });
    goals.add({
      kind: "analyze_company",
      priority: 85,
      emitted_by: "test",
      payload: { company: "Stripe" },
    });

    // Seed jds row so FK is satisfied.
    const { jds } = await import("@retune/db/pg");
    await h.db.insert(jds).values({
      id: jd_id,
      source: "test",
      content_hash: "abc",
      raw_text: "seed",
    });

    const orchestrator = new Orchestrator({
      blackboard,
      goal_stack: goals,
      registry,
      scheduler: new AttentionScheduler(),
      audit_trail: new AuditTrail(),
      budget,
      persistence: h.persistence,
    });

    const result = await orchestrator.run({
      generation_context: {
        user_id: h.user_id,
        jd_id,
        ontology_version: "0.0.1",
      },
    });

    assert.equal(result.termination, "no_open_work");
    assert.equal(result.ticks_executed, 2);

    // Now load from the DB using a fresh loader handle.
    const replayed = await h.persistence.load(generation_id);
    assert.ok(replayed, "replayed must be non-null");
    assert.equal(replayed?.user_id, h.user_id);
    assert.equal(replayed?.jd_id, jd_id);
    assert.equal(replayed?.latest_seq, 1);
    assert.equal(replayed?.termination, "no_open_work");
    assert.equal(replayed?.audit_entries.length, 2);
    assert.deepEqual(
      replayed?.audit_entries.map((e) => e.specialist),
      ["company_schema_retriever", "title_schema_retriever"],
    );
    assert.equal(replayed?.goals.length, 2);
    assert.ok(replayed?.goals.every((g) => g.status === "satisfied"));

    // Blackboard hypotheses survived the round-trip.
    assert.equal(
      (replayed?.blackboard.hypotheses.role_schema as { canonical_role_id: string } | null)
        ?.canonical_role_id,
      "role.swe.senior",
    );
    assert.equal(
      (replayed?.blackboard.hypotheses.company_schema as { canonical_company_id: string } | null)
        ?.canonical_company_id,
      "company.stripe",
    );
  } finally {
    await h.close();
  }
});

test("load() returns null for unknown generation_id", async () => {
  const h = await build_pglite_harness();
  try {
    const result = await h.persistence.load(randomUUID());
    assert.equal(result, null);
  } finally {
    await h.close();
  }
});

test("ensure_generation is idempotent on duplicate id", async () => {
  const h = await build_pglite_harness();
  try {
    const generation_id = randomUUID();
    const bb = empty_blackboard(generation_id, h.user_id, randomUUID());
    await h.persistence.ensure_generation({
      generation_id,
      user_id: h.user_id,
      jd_id: null,
      ontology_version: "0.0.1",
      initial_blackboard: bb,
      initial_goals: [],
    });
    // Second call must not throw.
    await h.persistence.ensure_generation({
      generation_id,
      user_id: h.user_id,
      jd_id: null,
      ontology_version: "0.0.1",
      initial_blackboard: bb,
      initial_goals: [],
    });
    const replayed = await h.persistence.load(generation_id);
    assert.ok(replayed);
  } finally {
    await h.close();
  }
});
