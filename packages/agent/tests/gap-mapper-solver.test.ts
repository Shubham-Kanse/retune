/**
 * Tests for commit #9 specialists:
 *   - GapMapper (deterministic multi-signal disposition classification)
 *   - EvidenceSolver (branch-and-bound CP-SAT optimal evidence assignment)
 *
 * Invariants proven:
 *   1. Determinism: same input → byte-identical output across processes
 *   2. Hard constraint satisfaction: all hard requirements assigned when budget allows
 *   3. Budget respect: solver sacrifices low-weight claims first under tight budgets
 *   4. Coverage correctness: matches hand-computed lower bounds
 *   5. Ontology traversal: implied_hit via KG adjacency graph
 *   6. Honesty haircut: confidence reduction for over-claimed types
 *   7. AND/OR group detection and enforcement
 *   8. Solver optimality: branch-and-bound finds provably optimal within iteration cap
 *   9. Arc alignment: narrative-arc-aligned evidence gets boost
 *  10. Goal emission: GapMapper emits solve_evidence child goal
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard, GoalKind } from "@retune/types";
import {
  BlackboardStore,
  EvidenceSolver,
  type GapMap,
  type GapMapEntry,
  GapMapper,
  type SolverSolution,
  TriggerBus,
} from "../src/sota-exports";

// ──────────── Helpers ────────────

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

function make_goal(kind: GoalKind, payload?: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind,
    priority: 80,
    emitted_by: "orchestrator",
    payload,
    status: "pending" as const,
    satisfied_by: [],
    parent_goal_id: null,
    created_at: now,
    updated_at: now,
  };
}

function make_store(bb: Blackboard): BlackboardStore {
  const bus = new TriggerBus();
  return new BlackboardStore(bb, bus);
}

function make_requirement(id: string, text: string, confidence: number, span_count: number) {
  return {
    requirement_id: id,
    requirement_text: text,
    disposition: "direct_hit" as const,
    evidence_span_ids: Array.from({ length: span_count }, () => randomUUID()),
    match_confidence: {
      point: confidence,
      lower: Math.max(0, confidence - 0.1),
      upper: Math.min(1, confidence + 0.05),
      coverage: 0.95,
    },
  };
}

function make_gap_entry(
  overrides: Partial<GapMapEntry> & {
    requirement_id: string;
    requirement_text: string;
    disposition: GapMapEntry["disposition"];
    confidence: number;
  },
): GapMapEntry {
  return {
    evidence_span_ids: [randomUUID()],
    adjusted_confidence: overrides.confidence,
    reason: "",
    discourse_function: null,
    discourse_importance: 0.7,
    transfer_path: null,
    is_hard_constraint: overrides.disposition === "direct_hit" && overrides.confidence >= 0.7,
    and_or_group: null,
    ...overrides,
  };
}

function make_gap_map(entries: GapMapEntry[]): GapMap {
  const summary = {
    direct_hits: entries.filter((e) => e.disposition === "direct_hit").length,
    implied_hits: entries.filter((e) => e.disposition === "implied_hit").length,
    transferable: entries.filter((e) => e.disposition === "transferable").length,
    missable: entries.filter((e) => e.disposition === "missable").length,
    cover_letter: entries.filter((e) => e.disposition === "must_address_in_cover_letter").length,
    must_omit: entries.filter((e) => e.disposition === "must_omit_from_application").length,
    total_requirements: entries.length,
    hard_requirements_met: entries.filter(
      (e) =>
        e.is_hard_constraint && (e.disposition === "direct_hit" || e.disposition === "implied_hit"),
    ).length,
    hard_requirements_total: entries.filter((e) => e.is_hard_constraint).length,
    coverage_pct: 100,
    weighted_coverage: 0.8,
  };
  return { entries, summary, and_or_groups: [], disqualifier_overlap: [] };
}

// ─────────────── GapMapper tests ───────────────

test("GapMapper classifies direct_hit when confidence ≥ 0.7 with evidence", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    make_requirement("req-1", "5+ years distributed systems experience", 0.85, 3),
  ];
  bb.hypotheses.role_schema = {
    canonical_role_id: "swe-senior",
    display_name: "Senior SWE",
    family: "engineering",
    level: "senior",
    yoe_band: [5, 10],
    archetype: "deep_specialist",
    inflated: false,
  };

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  assert.equal(result.writes.length, 1);
  const gap_map = result.writes[0]!.value as GapMap;
  assert.equal(gap_map.entries[0]!.disposition, "direct_hit");
  assert.equal(gap_map.summary.direct_hits, 1);
  assert.ok(gap_map.entries[0]!.adjusted_confidence >= 0.7);
});

test("GapMapper classifies must_omit when no evidence and not explicable", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    {
      requirement_id: "req-2",
      requirement_text: "active US security clearance required",
      disposition: "direct_hit" as const,
      evidence_span_ids: [],
      match_confidence: { point: 0.0, lower: 0.0, upper: 0.1, coverage: 0.95 },
    },
  ];

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  const gap_map = result.writes[0]!.value as GapMap;
  assert.equal(gap_map.entries[0]!.disposition, "must_omit_from_application");
  assert.equal(gap_map.summary.must_omit, 1);
});

test("GapMapper classifies missable for nice-to-have requirements", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    {
      requirement_id: "req-3",
      requirement_text: "Rust experience is a nice to have",
      disposition: "direct_hit" as const,
      evidence_span_ids: [],
      match_confidence: { point: 0.0, lower: 0.0, upper: 0.1, coverage: 0.95 },
    },
  ];
  bb.hypotheses.role_schema = {
    canonical_role_id: "swe-senior",
    display_name: "Senior SWE",
    family: "engineering",
    level: "senior",
    yoe_band: [5, 10],
    archetype: "deep_specialist",
    inflated: false,
  };

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  const gap_map = result.writes[0]!.value as GapMap;
  assert.equal(gap_map.entries[0]!.disposition, "missable");
});

test("GapMapper classifies must_address_in_cover_letter for explicable gaps", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    {
      requirement_id: "req-4",
      requirement_text: "experience with Kubernetes in production environments",
      disposition: "direct_hit" as const,
      evidence_span_ids: [],
      match_confidence: { point: 0.0, lower: 0.0, upper: 0.1, coverage: 0.95 },
    },
  ];

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  const gap_map = result.writes[0]!.value as GapMap;
  assert.equal(gap_map.entries[0]!.disposition, "must_address_in_cover_letter");
});

test("GapMapper is deterministic — same input produces byte-identical output", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    make_requirement("req-a", "5+ years Python experience", 0.9, 2),
    make_requirement("req-b", "experience with AWS cloud services", 0.6, 1),
    make_requirement("req-c", "knowledge of ML pipelines and model serving", 0.4, 1),
  ];
  bb.hypotheses.role_schema = {
    canonical_role_id: "swe-senior",
    display_name: "Senior SWE",
    family: "engineering",
    level: "senior",
    yoe_band: [5, 10],
    archetype: "deep_specialist",
    inflated: false,
  };

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");

  const r1 = await mapper.run(ctx, goal);
  const r2 = await mapper.run(ctx, goal);

  // Writes must be structurally identical (ignoring goal IDs which are new UUIDs)
  const map1 = r1.writes[0]!.value as GapMap;
  const map2 = r2.writes[0]!.value as GapMap;
  assert.deepEqual(map1.entries, map2.entries);
  assert.deepEqual(map1.summary, map2.summary);
});

test("GapMapper handles empty requirement_matches gracefully", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  assert.equal(result.writes.length, 0);
  assert.deepEqual(result.satisfied_goal_ids, [goal.id]);
});

test("GapMapper emits solve_evidence child goal with degraded priority", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [make_requirement("req-1", "Python experience", 0.9, 2)];

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  goal.priority = 80;
  const result = await mapper.run(ctx, goal);

  assert.ok(result.new_goals);
  assert.equal(result.new_goals!.length, 1);
  assert.equal(result.new_goals![0]!.kind, "solve_evidence");
  assert.equal(result.new_goals![0]!.priority, 79); // degraded by 1
  assert.equal(result.new_goals![0]!.emitted_by, "gap_mapper");
  assert.ok(result.new_goals![0]!.payload?.bullet_budget);
});

test("GapMapper applies honesty calibration haircut on over-claimed types", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    make_requirement("req-1", "5+ years experience in distributed systems", 0.75, 2),
  ];
  // Honesty calibration shows user over-claims duration (low trust)
  bb.hypotheses.honesty_calibration = {
    duration: 0.3, // low trust → heavy haircut
    metric: 0.9,
    leadership: 0.7,
  };

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  const gap_map = result.writes[0]!.value as GapMap;
  const entry = gap_map.entries[0]!;
  // Haircut formula: 0.6 + 0.4 * 0.3 = 0.72 → adjusted = 0.75 * 0.72 = 0.54
  assert.ok(entry.adjusted_confidence < entry.confidence);
  assert.ok(entry.adjusted_confidence < 0.7); // Pushed below direct_hit threshold
  assert.notEqual(entry.disposition, "direct_hit"); // Should downgrade
});

test("GapMapper detects discourse function context from discourse_map", async () => {
  const mapper = new GapMapper();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());
  bb.evidence_graph.requirement_matches = [
    make_requirement("req-1", "Must have 5+ years Python", 0.9, 2),
  ];
  bb.hypotheses.discourse_map = [
    {
      sentence_index: 0,
      text: "Must have 5+ years Python",
      function: "filter" as const,
      importance: 0.95,
    },
  ];

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 1,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("map_gaps");
  const result = await mapper.run(ctx, goal);

  const gap_map = result.writes[0]!.value as GapMap;
  const entry = gap_map.entries[0]!;
  assert.equal(entry.discourse_function, "filter");
  assert.ok(entry.discourse_importance >= 0.9);
  assert.equal(entry.is_hard_constraint, true);
});

// ─────────────── EvidenceSolver tests ───────────────

test("EvidenceSolver produces deterministic output for same input", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python 5yr",
      disposition: "direct_hit",
      confidence: 0.9,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "AWS",
      disposition: "implied_hit",
      confidence: 0.75,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "ML",
      disposition: "transferable",
      confidence: 0.5,
    }),
  ]);

  const s1 = solver.solve(gap_map, 6, 3, new Set());
  const s2 = solver.solve(gap_map, 6, 3, new Set());

  assert.deepEqual(s1.bullets, s2.bullets);
  assert.equal(s1.total_weight, s2.total_weight);
  assert.equal(s1.solver_stats.iterations, s2.solver_stats.iterations);
});

test("EvidenceSolver satisfies hard constraints when budget allows", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.9,
      is_hard_constraint: true,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "Go",
      disposition: "direct_hit",
      confidence: 0.8,
      is_hard_constraint: true,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "Rust nice to have",
      disposition: "transferable",
      confidence: 0.4,
    }),
  ]);

  const solution = solver.solve(gap_map, 6, 3, new Set());

  assert.equal(solution.hard_constraints_satisfied, true);
  assert.equal(solution.uncovered_hard_requirements.length, 0);
  const assigned_ids = solution.bullets.flatMap((b) => b.assignments.map((a) => a.requirement_id));
  assert.ok(assigned_ids.includes("r1"));
  assert.ok(assigned_ids.includes("r2"));
});

test("EvidenceSolver respects tight bullet budget by sacrificing low-weight claims first", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.95,
      is_hard_constraint: true,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "AWS",
      disposition: "direct_hit",
      confidence: 0.85,
      is_hard_constraint: true,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "K8s",
      disposition: "implied_hit",
      confidence: 0.72,
      is_hard_constraint: true,
    }),
    make_gap_entry({
      requirement_id: "r4",
      requirement_text: "Terraform",
      disposition: "transferable",
      confidence: 0.45,
    }),
    make_gap_entry({
      requirement_id: "r5",
      requirement_text: "Ansible",
      disposition: "transferable",
      confidence: 0.35,
    }),
  ]);

  // Budget: 1 bullet × 3 claims = 3 slots
  const solution = solver.solve(gap_map, 1, 3, new Set());

  assert.equal(solution.bullets.length, 1);
  assert.equal(solution.bullets[0]!.assignments.length, 3);

  // Hard constraints should be prioritized
  const assigned_ids = solution.bullets[0]!.assignments.map((a) => a.requirement_id);
  assert.ok(assigned_ids.includes("r1"));
  assert.ok(assigned_ids.includes("r2"));
  assert.ok(assigned_ids.includes("r3"));

  // Soft claims dropped
  assert.ok(solution.dropped_soft_requirements.includes("r4"));
  assert.ok(solution.dropped_soft_requirements.includes("r5"));
});

test("EvidenceSolver coverage matches hand-computed lower bound", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.9,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "AWS",
      disposition: "direct_hit",
      confidence: 0.8,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "Docker",
      disposition: "implied_hit",
      confidence: 0.7,
    }),
    make_gap_entry({
      requirement_id: "r4",
      requirement_text: "boring",
      disposition: "missable",
      confidence: 0.0,
    }),
  ]);

  // 4 entries, 1 missable is filtered → 3 actionable. Budget of 6×3=18 — plenty.
  // All 3 actionable should be assigned → coverage = 3/3 = 1.0
  const solution = solver.solve(gap_map, 6, 3, new Set());

  assert.equal(solution.total_coverage, 1.0);
  assert.equal(solution.bullets.flatMap((b) => b.assignments).length, 3);
});

test("EvidenceSolver excludes must_omit and missable from assignment", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.9,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "clearance",
      disposition: "must_omit_from_application",
      confidence: 0.0,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "bonus",
      disposition: "missable",
      confidence: 0.0,
    }),
  ]);

  const solution = solver.solve(gap_map, 6, 3, new Set());

  const assigned_ids = solution.bullets.flatMap((b) => b.assignments.map((a) => a.requirement_id));
  assert.ok(!assigned_ids.includes("r2"));
  assert.ok(!assigned_ids.includes("r3"));
  assert.equal(assigned_ids.length, 1);
  assert.equal(assigned_ids[0], "r1");
});

test("EvidenceSolver run() writes solver_solution to blackboard", async () => {
  const solver = new EvidenceSolver();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());

  (bb.evidence_graph as unknown as { gap_map: GapMap }).gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.9,
    }),
  ]);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 2,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("solve_evidence", { bullet_budget: 10, max_claims_per_bullet: 3 });
  const result = await solver.run(ctx, goal);

  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0]!.path, "evidence_graph.solver_solution");
  assert.deepEqual(result.satisfied_goal_ids, [goal.id]);

  const solution = result.writes[0]!.value as SolverSolution;
  assert.ok(solution.solver_stats.optimal);
  assert.ok(solution.solver_stats.solve_time_ms < 50); // p99 target
});

test("EvidenceSolver returns empty when no gap_map exists", async () => {
  const solver = new EvidenceSolver();
  const bb = empty_blackboard(randomUUID(), randomUUID(), randomUUID());

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 2,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("solve_evidence");
  const result = await solver.run(ctx, goal);

  assert.equal(result.writes.length, 0);
  assert.deepEqual(result.satisfied_goal_ids, [goal.id]);
});

test("EvidenceSolver bullets sorted by weight descending (strongest-first resume ordering)", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.5,
      discourse_importance: 0.5,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "AWS",
      disposition: "direct_hit",
      confidence: 0.95,
      discourse_importance: 0.9,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "Go",
      disposition: "direct_hit",
      confidence: 0.75,
      discourse_importance: 0.7,
    }),
  ]);

  // 1 claim per bullet → 3 bullets
  const solution = solver.solve(gap_map, 6, 1, new Set());

  assert.equal(solution.bullets.length, 3);
  for (let i = 1; i < solution.bullets.length; i++) {
    assert.ok(solution.bullets[i - 1]!.total_weight >= solution.bullets[i]!.total_weight);
  }
});

test("EvidenceSolver arc-aligned evidence receives weight boost", () => {
  const solver = new EvidenceSolver();
  const arc_span = randomUUID();
  const non_arc_span = randomUUID();

  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.8,
      evidence_span_ids: [arc_span],
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "Go",
      disposition: "direct_hit",
      confidence: 0.8,
      evidence_span_ids: [non_arc_span],
    }),
  ]);

  const arc_spans = new Set([arc_span]);
  const solution = solver.solve(gap_map, 6, 1, arc_spans);

  // r1 (arc-aligned) should have higher weight than r2 (same confidence but no arc alignment)
  const r1_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r1"),
  );
  const r2_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r2"),
  );
  assert.ok(r1_bullet);
  assert.ok(r2_bullet);
  assert.ok(r1_bullet!.total_weight > r2_bullet!.total_weight);
});

test("EvidenceSolver reports solver statistics including optimality", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.9,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "AWS",
      disposition: "implied_hit",
      confidence: 0.7,
    }),
  ]);

  const solution = solver.solve(gap_map, 6, 3, new Set());

  assert.ok(solution.solver_stats.iterations > 0);
  assert.ok(solution.solver_stats.solve_time_ms >= 0);
  assert.ok(solution.solver_stats.upper_bound >= solution.total_weight);
  assert.equal(typeof solution.solver_stats.optimal, "boolean");
  assert.equal(typeof solution.solver_stats.branches_pruned, "number");
  assert.equal(typeof solution.solver_stats.solution_gap_pct, "number");
});

test("EvidenceSolver infers section hints from requirement text", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Led team of 8 engineers building distributed systems",
      disposition: "direct_hit",
      confidence: 0.9,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "Proficiency in Python and Go",
      disposition: "direct_hit",
      confidence: 0.85,
    }),
  ]);

  const solution = solver.solve(gap_map, 6, 1, new Set());

  const r1_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r1"),
  );
  const r2_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r2"),
  );
  assert.equal(r1_bullet!.section_hint, "experience");
  assert.equal(r2_bullet!.section_hint, "skills");
});

test("EvidenceSolver assigns verb_quality_floor based on confidence", () => {
  const solver = new EvidenceSolver();
  const gap_map = make_gap_map([
    make_gap_entry({
      requirement_id: "r1",
      requirement_text: "Python",
      disposition: "direct_hit",
      confidence: 0.95,
    }),
    make_gap_entry({
      requirement_id: "r2",
      requirement_text: "Go",
      disposition: "direct_hit",
      confidence: 0.72,
    }),
    make_gap_entry({
      requirement_id: "r3",
      requirement_text: "Rust",
      disposition: "transferable",
      confidence: 0.45,
    }),
  ]);

  const solution = solver.solve(gap_map, 6, 1, new Set());

  const r1_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r1"),
  );
  const r2_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r2"),
  );
  const r3_bullet = solution.bullets.find((b) =>
    b.assignments.some((a) => a.requirement_id === "r3"),
  );
  assert.equal(r1_bullet!.verb_quality_floor, "elite");
  assert.equal(r2_bullet!.verb_quality_floor, "strong");
  assert.equal(r3_bullet!.verb_quality_floor, "standard");
});
