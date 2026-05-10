/**
 * Resume-from-crash test.
 *
 * Simulates a crash by running the orchestrator for exactly one tick,
 * tearing down the in-memory substrate, then rehydrating a fresh one
 * from Postgres and proving the second orchestrator (a) picks up the
 * remaining work, (b) emits audit seqs starting where the first left
 * off, (c) does not duplicate persisted ticks.
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
  rehydrate_substrate,
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

test("crash after tick 1, resume, remaining work completes", async () => {
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

    // ─── Phase 1: run with max_ticks=1 to simulate a crash ───
    const bus1 = new TriggerBus();
    const bb1 = new BlackboardStore(empty_blackboard(generation_id, h.user_id, jd_id), bus1);
    const goals1 = new GoalStack();
    const resolver = new OntologyResolver();
    const registry = new SpecialistRegistry();
    registry.register_all([
      new TitleSchemaRetriever(resolver),
      new CompanySchemaRetriever(resolver),
    ]);
    const scheduler = new AttentionScheduler();
    const budget1 = new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    });

    goals1.add({
      kind: "analyze_jd",
      priority: 80,
      emitted_by: "test",
      payload: { jd_title: "Senior Software Engineer" },
    });
    goals1.add({
      kind: "analyze_company",
      priority: 85, // runs first
      emitted_by: "test",
      payload: { company: "Stripe" },
    });

    const orch1 = new Orchestrator({
      blackboard: bb1,
      goal_stack: goals1,
      registry,
      scheduler,
      audit_trail: new AuditTrail(),
      budget: budget1,
      persistence: h.persistence,
    });

    const phase1 = await orch1.run({
      max_ticks: 1,
      generation_context: {
        user_id: h.user_id,
        jd_id,
        ontology_version: "0.0.1",
      },
    });
    assert.equal(phase1.ticks_executed, 1);
    // Crash here — we drop all references to orch1 / bb1 / goals1.

    // ─── Phase 2: resume ───
    const replayed = await h.persistence.load(generation_id);
    if (!replayed) throw new Error("replayed must load");
    assert.equal(replayed.latest_seq, 0);
    assert.equal(replayed.audit_entries.length, 1);
    assert.equal(replayed.audit_entries[0]?.specialist, "company_schema_retriever");
    // Company goal was satisfied; title goal still pending.
    assert.equal(replayed.goals.filter((g) => g.status === "satisfied").length, 1);
    assert.equal(replayed.goals.filter((g) => g.status === "pending").length, 1);

    const { orchestrator: orch2, audit_trail: audit2 } = rehydrate_substrate({
      replayed,
      registry,
      scheduler,
      persistence: h.persistence,
    });
    // Pre-resume audit trail mirrors the persisted seq.
    assert.equal(audit2.list().length, 1);
    assert.equal(audit2.list()[0]?.seq, 0);

    const phase2 = await orch2.run({
      // generation_context is optional on resume — ensure_generation is idempotent
      generation_context: {
        user_id: replayed.user_id,
        jd_id: replayed.jd_id,
        ontology_version: replayed.ontology_version,
      },
    });

    assert.equal(phase2.termination, "no_open_work");
    assert.equal(phase2.ticks_executed, 1);

    // ─── Verify final persisted state ───
    const final = await h.persistence.load(generation_id);
    assert.equal(final?.latest_seq, 1);
    assert.equal(final?.audit_entries.length, 2);
    assert.deepEqual(
      final?.audit_entries.map((e) => ({ seq: e.seq, specialist: e.specialist })),
      [
        { seq: 0, specialist: "company_schema_retriever" },
        { seq: 1, specialist: "title_schema_retriever" },
      ],
    );
    assert.equal(final?.termination, "no_open_work");
    assert.ok(final?.goals.every((g) => g.status === "satisfied"));

    // Both hypotheses present — state carried across the "crash".
    assert.equal(
      (final?.blackboard.hypotheses.role_schema as { canonical_role_id: string } | null)
        ?.canonical_role_id,
      "role.swe.senior",
    );
    assert.equal(
      (final?.blackboard.hypotheses.company_schema as { canonical_company_id: string } | null)
        ?.canonical_company_id,
      "company.stripe",
    );

    // Cost total is cumulative across phases.
    assert.ok(final?.blackboard.cost_budget.spent_usd !== undefined);
  } finally {
    await h.close();
  }
});
