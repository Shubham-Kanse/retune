/**
 * Provider parity — NarrativeArcProposer.
 *
 * Given the same canonical arc-list fixture, the proposer must produce
 * identical blackboard writes (`narrative_arcs_candidates`,
 * `chosen_narrative_arc`) regardless of provider. Audit `model_version`
 * and `new_goals[].id` (UUIDs are random) are allowed to differ.
 *
 * Acceptance: technical-2.0 §4.4, §20 (Phase 1).
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { NarrativeArcProposer } from "../../src/sota-exports";
import type { SolverSolution } from "../../src/specialists/evidence-solver";
import type { GapMap } from "../../src/specialists/gap-mapper";
import { canonicalWrites, emptyBlackboard, makeGoal, runWithBothProviders } from "./_helpers";

const SPAN_A = "11111111-1111-4111-8111-111111111111";
const SPAN_B = "22222222-2222-4222-8222-222222222222";

const FIXTURE = {
  arcs: [
    {
      archetype: "deep_specialist",
      thesis:
        "Senior ML engineer who turned model-serving infra from research-grade scripts into a 5kqps production fleet.",
      lead_evidence_span_ids: [SPAN_A, SPAN_B],
      feasibility_point: 0.82,
      rationale: "Strongest evidence is depth and shipping cadence.",
    },
    {
      archetype: "scaled_it",
      thesis: "Took ML inference from 50qps prototype to 5kqps production with 99.9% SLO.",
      lead_evidence_span_ids: [SPAN_A],
      feasibility_point: 0.74,
      rationale: "Quantified scale narrative is well-supported.",
    },
    {
      archetype: "fixed_the_mess",
      thesis: "Rebuilt a brittle ML platform after a Q3 incident; restored uptime to 99.95%.",
      lead_evidence_span_ids: [SPAN_B],
      feasibility_point: 0.55,
      rationale: "Turnaround narrative requires more incident detail.",
    },
  ],
};

test("NarrativeArcProposer produces identical writes on Anthropic vs OpenAI", async () => {
  const buildBlackboard = () => {
    const bb = emptyBlackboard();
    bb.evidence_graph = {
      span_ids: [SPAN_A, SPAN_B],
      requirement_matches: [],
    };
    const gap_map: GapMap = {
      entries: [
        {
          requirement_id: "req-1",
          requirement_text: "5+ years distributed systems",
          disposition: "direct_hit",
          evidence_span_ids: [SPAN_A],
          confidence: 0.85,
          adjusted_confidence: 0.85,
          reason: "direct evidence",
          discourse_function: "actual_test",
          discourse_importance: 1.0,
          transfer_path: null,
          is_hard_constraint: true,
          and_or_group: null,
        },
      ],
      summary: {
        direct_hits: 1,
        implied_hits: 0,
        transferable: 0,
        missable: 0,
        cover_letter: 0,
        must_omit: 0,
        total_requirements: 1,
        hard_requirements_met: 1,
        hard_requirements_total: 1,
        coverage_pct: 1.0,
        weighted_coverage: 1.0,
      },
      and_or_groups: [],
      disqualifier_overlap: [],
    };
    const solver: SolverSolution = {
      bullets: [
        {
          bullet_index: 0,
          section_hint: "experience",
          assignments: [
            {
              requirement_id: "req-1",
              requirement_text: "5+ years distributed systems",
              assigned_span_ids: [SPAN_A],
              confidence: 0.85,
              weight: 1.0,
              disposition: "direct_hit",
              transfer_path: null,
              arc_alignment_score: 0.8,
            },
          ],
          total_weight: 1.0,
          dominant_claim_type: "metric",
          verb_quality_floor: "strong",
        },
      ],
      total_coverage: 1.0,
      total_weight: 1.0,
      weighted_coverage: 1.0,
      hard_constraints_satisfied: true,
      uncovered_hard_requirements: [],
      dropped_soft_requirements: [],
      and_group_violations: [],
      or_group_violations: [],
      solver_stats: {
        iterations: 1,
        branches_pruned: 0,
        propagation_steps: 0,
        upper_bound: 1.0,
        solution_gap_pct: 0,
        solve_time_ms: 1,
        optimal: true,
      },
    };
    (bb.evidence_graph as unknown as { gap_map: GapMap }).gap_map = gap_map;
    (bb.evidence_graph as unknown as { solver_solution: SolverSolution }).solver_solution = solver;
    bb.hypotheses = {
      ...bb.hypotheses,
      role_schema: {
        canonical_id: "swe_senior",
        display_name: "Senior Software Engineer",
        level: "senior",
        yoe_band: [5, 9],
        required_skills: ["distributed_systems"],
        adjacent_domains: [],
      } as never,
      honesty_calibration: { metric: 0.9, scope: 0.85 },
    };
    return bb;
  };

  const goal = makeGoal("propose_arcs");

  const { anthropic, openai } = await runWithBothProviders({
    specialist: new NarrativeArcProposer(),
    buildBlackboard,
    goal,
    fixture: FIXTURE,
  });

  assert.deepEqual(canonicalWrites(anthropic), canonicalWrites(openai));

  // Sanity: both wrote the candidates and chosen arc.
  const paths = anthropic.writes.map((w) => w.path).sort();
  assert.deepEqual(paths, [
    "hypotheses.chosen_narrative_arc",
    "hypotheses.narrative_arcs_candidates",
  ]);

  // v2.0 §7.1: emits BOTH `model_recruiter_beliefs` and `select_arc` —
  // ToM specialist runs first, then CriticEnsemble.
  assert.equal(anthropic.new_goals?.length, 2);
  assert.equal(openai.new_goals?.length, 2);
  const kindsA = anthropic.new_goals!.map((g) => g.kind).sort();
  const kindsO = openai.new_goals!.map((g) => g.kind).sort();
  assert.deepEqual(kindsA, ["model_recruiter_beliefs", "select_arc"]);
  assert.deepEqual(kindsO, ["model_recruiter_beliefs", "select_arc"]);
});

test("NarrativeArcProposer chosen arc is highest feasibility on both providers", async () => {
  const buildBlackboard = () => {
    const bb = emptyBlackboard();
    bb.evidence_graph = { span_ids: [SPAN_A, SPAN_B], requirement_matches: [] };
    (bb.evidence_graph as unknown as { gap_map: GapMap }).gap_map = {
      entries: [],
      summary: {
        direct_hits: 0,
        implied_hits: 0,
        transferable: 0,
        missable: 0,
        cover_letter: 0,
        must_omit: 0,
        total_requirements: 0,
        hard_requirements_met: 0,
        hard_requirements_total: 0,
        coverage_pct: 0,
        weighted_coverage: 0,
      },
      and_or_groups: [],
      disqualifier_overlap: [],
    };
    (bb.evidence_graph as unknown as { solver_solution: SolverSolution }).solver_solution = {
      bullets: [],
      total_coverage: 0,
      total_weight: 0,
      weighted_coverage: 0,
      hard_constraints_satisfied: true,
      uncovered_hard_requirements: [],
      dropped_soft_requirements: [],
      and_group_violations: [],
      or_group_violations: [],
      solver_stats: {
        iterations: 0,
        branches_pruned: 0,
        propagation_steps: 0,
        upper_bound: 0,
        solution_gap_pct: 0,
        solve_time_ms: 0,
        optimal: true,
      },
    };
    return bb;
  };

  const { anthropic, openai } = await runWithBothProviders({
    specialist: new NarrativeArcProposer(),
    buildBlackboard,
    goal: makeGoal("propose_arcs"),
    fixture: FIXTURE,
  });

  const chosenA = anthropic.writes.find((w) => w.path === "hypotheses.chosen_narrative_arc")!
    .value as { archetype: string };
  const chosenO = openai.writes.find((w) => w.path === "hypotheses.chosen_narrative_arc")!
    .value as { archetype: string };

  assert.equal(chosenA.archetype, "deep_specialist");
  assert.equal(chosenO.archetype, "deep_specialist");
});

// Avoid an unused-import lint warning on the type-only `randomUUID` we keep around for symmetry.
void randomUUID;
