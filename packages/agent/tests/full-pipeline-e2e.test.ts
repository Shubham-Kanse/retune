/**
 * Full-pipeline E2E (Phase 2 acceptance — technical-2.0 §15.2, §20).
 *
 * Proves the v2.0 wiring fix: the strategy → production → critique →
 * decision chain runs end-to-end without the API layer needing to
 * pre-seed every goal.
 *
 * The comprehension layer is bypassed (existing `discourse-pipeline.test.ts`
 * and `jd-span-extractor.test.ts` cover that). We pre-populate the
 * blackboard with the outputs comprehension would have produced, then
 * seed only `map_gaps` and assert the chain reaches `decide_refuse_or_ship`
 * with all expected blackboard writes:
 *
 *   map_gaps → solve_evidence → propose_arcs
 *            → model_recruiter_beliefs + select_arc → compose_resume
 *            → estimate_outcome → decide_refuse_or_ship
 *
 * LLM calls are mocked at the provider level via the parity-test helper
 * pattern. The whole run completes in < 5 seconds (no real LLM).
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard, Goal } from "@retune/types";
import { _resetProvider } from "../src/lib/provider";
import { anthropicProvider } from "../src/lib/providers/anthropic";
import { OntologyResolver } from "../src/memory";
import type { MLClient } from "../src/ml-client";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BoilerplateStripper,
  BudgetController,
  CompanySchemaRetriever,
  CredibilityScanner,
  CriticEnsemble,
  CulturalCalibrator,
  DiscourseClassifier,
  EvidenceSolver,
  GapMapper,
  GoalStack,
  HonestyCalibrator,
  JdSpanExtractor,
  NarrativeArcProposer,
  Orchestrator,
  OutcomePredictor,
  RefuseOrShipGate,
  SequentialBulletComposer,
  type Specialist,
  SpecialistRegistry,
  TheoryOfMindSpecialist,
  TitleSchemaRetriever,
  type TraceEvent,
  TriggerBus,
  VoiceFingerprintExtractor,
} from "../src/sota-exports";

// ──────────── Helpers ────────────

function uuid(): string {
  return randomUUID();
}

const SPAN_A = uuid();
const SPAN_B = uuid();
const SPAN_C = uuid();

function seededBlackboard(): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id: uuid(),
    user_id: uuid(),
    jd_id: uuid(),
    ontology_version: "0.0.1",
    goals: [],
    hypotheses: {
      role_schema: {
        canonical_id: "swe_senior",
        display_name: "Senior Software Engineer",
        level: "senior",
        yoe_band: [5, 9],
        required_skills: ["distributed_systems", "python", "kubernetes"],
        adjacent_domains: [],
      } as never,
      company_schema: null,
      discourse_map: [
        {
          sentence_index: 0,
          text: "5+ years experience building distributed systems.",
          function: "actual_test",
          importance: 1.0,
        },
        {
          sentence_index: 1,
          text: "Strong Python and Kubernetes expertise required.",
          function: "filter",
          importance: 1.0,
        },
        {
          sentence_index: 2,
          text: "Equal opportunity employer.",
          function: "boilerplate",
          importance: 0,
        },
      ],
      hidden_disqualifiers: [],
      desperation_index: null,
      cultural_vector: [0.5, 0.3, 0.6, 0.2, 0.4, 0.5, 0.3, 0.4],
      candidate_credibility_prior: null,
      voice_fingerprint: null,
      honesty_calibration: {
        metric: 0.85,
        scope: 0.8,
        team_size: 0.7,
        tenure: 0.95,
      },
      narrative_arcs_candidates: [],
      chosen_narrative_arc: null,
    },
    evidence_graph: {
      span_ids: [SPAN_A, SPAN_B, SPAN_C],
      requirement_matches: [
        {
          requirement_id: "req-1",
          requirement_text: "5+ years experience building distributed systems",
          disposition: "direct_hit",
          evidence_span_ids: [SPAN_A],
          match_confidence: { point: 0.85, lower: 0.78, upper: 0.92, coverage: 0.95 },
        },
        {
          requirement_id: "req-2",
          requirement_text: "Strong Python expertise",
          disposition: "direct_hit",
          evidence_span_ids: [SPAN_B],
          match_confidence: { point: 0.9, lower: 0.83, upper: 0.95, coverage: 0.95 },
        },
        {
          requirement_id: "req-3",
          requirement_text: "Kubernetes production experience",
          disposition: "direct_hit",
          evidence_span_ids: [SPAN_C],
          match_confidence: { point: 0.78, lower: 0.7, upper: 0.86, coverage: 0.95 },
        },
      ],
    },
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

// ──────────── Provider mock ────────────
//
// Each LLM-driven specialist calls `getProvider().createMessageWithTool`
// with a different `toolName`. We dispatch on tool name to the right
// canned fixture so the cycle progresses deterministically.

function mockLlmProvider(): () => void {
  const original = anthropicProvider.createMessageWithTool.bind(anthropicProvider);

  anthropicProvider.createMessageWithTool = (async <T>(
    _agent: string,
    _params: unknown,
    toolName: string,
  ): Promise<T> => {
    switch (toolName) {
      case "propose_narrative_arcs":
        return {
          arcs: [
            {
              archetype: "deep_specialist",
              thesis:
                "Senior backend engineer with deep platform-tier experience scaling distributed systems.",
              lead_evidence_span_ids: [SPAN_A, SPAN_B],
              feasibility_point: 0.82,
              rationale: "Strong technical depth + production-scale evidence.",
            },
            {
              archetype: "scaled_it",
              thesis: "Took core platform from 100rps prototype to 5kqps production scale.",
              lead_evidence_span_ids: [SPAN_A],
              feasibility_point: 0.74,
              rationale: "Quantified scale narrative is well-supported.",
            },
            {
              archetype: "fixed_the_mess",
              thesis: "Rebuilt brittle deployment pipeline; restored uptime to 99.95%.",
              lead_evidence_span_ids: [SPAN_C],
              feasibility_point: 0.55,
              rationale: "Turnaround narrative requires more incident detail.",
            },
          ],
        } as T;

      case "model_recruiter_beliefs":
        return {
          inferred_candidate_level: "senior",
          inferred_domain: "backend_engineering",
          perceived_strengths: ["distributed systems", "production scale", "Python depth"],
          perceived_gaps: [],
          narrative_coherence_score: 0.82,
          flight_risk_signal: "low",
          overqualification_signal: false,
          hiring_intent_prediction: "likely_screen",
          projected_first_question: "Tell me about your largest distributed system.",
          belief_confidence: 0.85,
        } as T;

      case "critic_verdict":
        return {
          preferred_arc: "deep_specialist",
          score: 82,
          reasoning: "Strong production depth, clear quantified outcomes, narrative coherent.",
          top_concern: null,
          confidence: 0.88,
        } as T;

      case "compose_bullet":
        // Must start with the elite-tier first verb the composer chooses
        // (`Architected`) — solver yields `verb_quality_floor: "elite"` for
        // high-confidence direct-hit assignments.
        return {
          text: "Architected a typed configuration framework adopted by every backend service team within the platform organisation, eliminating an entire class of misconfiguration outages.",
          reasoning: "XYZ template; verb 'Architected' from elite tier.",
        } as T;

      default:
        throw new Error(`unmocked tool: ${toolName}`);
    }
  }) as typeof anthropicProvider.createMessageWithTool;

  return () => {
    anthropicProvider.createMessageWithTool = original;
    _resetProvider();
  };
}

// ──────────── Registry ────────────

function buildFullRegistry(): SpecialistRegistry {
  const reg = new SpecialistRegistry();
  const resolver = new OntologyResolver();
  // The ML client is unused in this E2E because we don't seed `extract_spans`
  // or `classify_discourse` goals — the comprehension layer is pre-populated.
  // We register comprehension specialists for completeness so the registry
  // matches §6 and the parity test invariant is preserved.
  const stub_ml: MLClient = {} as unknown as MLClient;
  const specialists: Specialist[] = [
    new TitleSchemaRetriever(resolver),
    new CompanySchemaRetriever(resolver),
    new JdSpanExtractor(stub_ml, { record: async () => [] }),
    new DiscourseClassifier(stub_ml),
    new BoilerplateStripper(),
    new CulturalCalibrator(stub_ml),
    new VoiceFingerprintExtractor(null),
    new HonestyCalibrator(null),
    new CredibilityScanner(),
    new GapMapper(),
    new EvidenceSolver(),
    new NarrativeArcProposer(),
    new SequentialBulletComposer(),
    new TheoryOfMindSpecialist(),
    new CriticEnsemble(),
    new OutcomePredictor(),
    new RefuseOrShipGate(),
  ];
  reg.register_all(specialists);
  return reg;
}

// ──────────── Test ────────────

test("full pipeline: map_gaps → … → decide_refuse_or_ship reaches the gate", async () => {
  process.env.AI_PROVIDER = "anthropic";
  _resetProvider();
  const restoreProvider = mockLlmProvider();

  try {
    const bus = new TriggerBus();
    const blackboard = new BlackboardStore(seededBlackboard(), bus);
    const goals = new GoalStack();
    const registry = buildFullRegistry();
    const audit = new AuditTrail();
    const budget = new BudgetController({
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    });
    const orchestrator = new Orchestrator({
      blackboard,
      goal_stack: goals,
      registry,
      scheduler: new AttentionScheduler(),
      audit_trail: audit,
      budget,
    });

    // Seed ONLY map_gaps — every other goal must come from chained specialists.
    const seed_now = new Date().toISOString();
    const seed_goal: Goal = {
      id: uuid(),
      kind: "map_gaps",
      priority: 73,
      emitted_by: "test",
      payload: {},
      status: "pending",
      satisfied_by: [],
      parent_goal_id: null,
      created_at: seed_now,
      updated_at: seed_now,
    };
    goals.push(seed_goal);

    const traces: TraceEvent[] = [];
    const result = await orchestrator.run({
      max_ticks: 64,
      on_trace: (ev) => traces.push(ev),
    });

    // ── Termination ──
    assert.equal(
      result.termination,
      "no_open_work",
      `unexpected termination: ${result.termination} after ${result.ticks_executed} ticks`,
    );
    assert.ok(result.ticks_executed >= 7, `expected ≥ 7 ticks, got ${result.ticks_executed}`);

    // ── Each layer's output landed on the blackboard ──
    const snap = blackboard.snapshot();
    const eg = snap.evidence_graph as unknown as {
      gap_map?: unknown;
      solver_solution?: unknown;
    };
    assert.ok(eg.gap_map, "GapMapper must have written gap_map");
    assert.ok(eg.solver_solution, "EvidenceSolver must have written solver_solution");
    assert.ok(
      snap.hypotheses.narrative_arcs_candidates.length >= 3,
      "NarrativeArcProposer must have written at least 3 candidates",
    );
    assert.ok(snap.hypotheses.chosen_narrative_arc, "chosen_narrative_arc must be set");

    const tom = (snap.hypotheses as unknown as { recruiter_belief_state?: unknown })
      .recruiter_belief_state;
    assert.ok(tom, "TheoryOfMindSpecialist must have written recruiter_belief_state");

    const ce = (snap.hypotheses as unknown as { critic_ensemble_result?: unknown })
      .critic_ensemble_result;
    assert.ok(ce, "CriticEnsemble must have written critic_ensemble_result");

    assert.ok(
      Object.keys(snap.draft.bullets).length > 0,
      "SequentialBulletComposer must have produced at least one bullet",
    );

    assert.ok(snap.outcome_estimate, "OutcomePredictor must have written outcome_estimate");

    const decision = (snap.hypotheses as unknown as { ship_decision?: { verdict?: string } })
      .ship_decision;
    assert.ok(decision, "RefuseOrShipGate must have written ship_decision");
    assert.ok(
      ["ship", "revise", "refuse"].includes(decision.verdict ?? ""),
      `unexpected verdict: ${decision.verdict}`,
    );

    // ── Audit trail recorded every layer ──
    const specialist_ids_run = new Set(traces.map((t) => t.specialist));
    for (const required of [
      "gap_mapper",
      "evidence_solver",
      "narrative_arc_proposer",
      "theory_of_mind",
      "critic_ensemble",
      "sequential_bullet_composer",
      "outcome_predictor",
      "refuse_or_ship_gate",
    ]) {
      assert.ok(
        specialist_ids_run.has(required),
        `expected specialist "${required}" to have run, traces: ${[...specialist_ids_run].join(", ")}`,
      );
    }
  } finally {
    restoreProvider();
  }
});
