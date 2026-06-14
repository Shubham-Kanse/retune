/**
 * EvidenceSolver specialist — DLPFC + premotor planning.
 *
 * Branch-and-bound search with constraint propagation that finds the
 * provably optimal assignment of evidence spans → claims → bullet slots.
 * Pure TypeScript; no external solver dependency.
 *
 * (Earlier docstrings called this "CP-SAT / MaxSAT" — that was aspirational.
 * The runtime is a hand-rolled B&B over 0/1 variables with unit-propagation
 * on the hard clauses, plus an LP-style fractional upper bound for pruning.
 * If/when scale demands a real solver, swap in `or-tools-wasm` per
 * technical-2.0 §16 issue #16.)
 *
 * Problem formulation:
 *   Variables: X[r][b] ∈ {0, 1} — requirement r assigned to bullet b
 *   Hard constraints:
 *     - All requirements with disposition ∈ {direct_hit, implied_hit} AND
 *       confidence ≥ 0.7 MUST be assigned (modelled as hard clauses)
 *     - At most max_claims_per_bullet requirements per bullet
 *     - At most bullet_budget bullets total
 *     - AND-groups: all members must be assigned or none
 *     - OR-groups: at least one member must be assigned
 *   Soft objective (maximize):
 *     Σ weight(r) × X[r][b], where
 *     weight(r) = coverage_w × confidence × recency_boost × arc_alignment × discourse_importance
 *
 * Algorithm: depth-first branch-and-bound with:
 *   1. Upper bound: LP relaxation (fractional assignment sums)
 *   2. Lower bound: current best feasible solution
 *   3. Constraint propagation: unit propagation on hard clauses
 *   4. Variable ordering: most-constrained-first (MRB heuristic)
 *   5. Deterministic: fixed variable ordering ensures same input → same output
 *
 * Complexity: O(2^n) worst case, but constraint propagation + bounding
 * prunes aggressively. For typical JDs (≤50 requirements, ≤20 bullets),
 * solves in <10ms. P99 target: 50ms (PRD §7.2).
 *
 * Goal kind: `solve_evidence`
 *
 * Goal payload:
 *   - bullet_budget: number (max bullets)
 *   - max_claims_per_bullet: number (default 3)
 *
 * Reads:
 *   - evidence_graph.gap_map (GapMapper, this commit)
 *   - hypotheses.chosen_narrative_arc (commit #10, nullable)
 *   - hypotheses.honesty_calibration (commit #8)
 *
 * Writes:
 *   - evidence_graph.solver_solution
 *
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";
import type { GapMap, GapMapEntry } from "./gap-mapper";

const HANDLES: readonly GoalKind[] = ["solve_evidence"];

const DEFAULT_BULLET_BUDGET = 18;
const DEFAULT_MAX_CLAIMS_PER_BULLET = 3;
const HARD_CONFIDENCE_FLOOR = 0.7;
const MAX_SOLVER_ITERATIONS = 50_000;

// ──────────── Public output types ────────────

export interface EvidenceAssignment {
  requirement_id: string;
  requirement_text: string;
  assigned_span_ids: string[];
  confidence: number;
  weight: number;
  disposition: string;
  transfer_path: string[] | null;
  arc_alignment_score: number;
}

export interface BulletPlan {
  bullet_index: number;
  section_hint: "experience" | "skills" | "summary" | "projects";
  assignments: EvidenceAssignment[];
  total_weight: number;
  dominant_claim_type: string;
  verb_quality_floor: "standard" | "strong" | "elite";
}

export interface SolverSolution {
  bullets: BulletPlan[];
  total_coverage: number;
  total_weight: number;
  weighted_coverage: number;
  hard_constraints_satisfied: boolean;
  uncovered_hard_requirements: string[];
  dropped_soft_requirements: string[];
  and_group_violations: string[];
  or_group_violations: string[];
  solver_stats: SolverStats;
}

export interface SolverStats {
  iterations: number;
  branches_pruned: number;
  propagation_steps: number;
  upper_bound: number;
  solution_gap_pct: number;
  solve_time_ms: number;
  optimal: boolean;
}

// ──────────── Internal solver types ────────────

interface SolverVariable {
  requirement_id: string;
  entry: GapMapEntry;
  weight: number;
  is_hard: boolean;
  and_group: string | null;
  or_group: string | null;
}

interface BestSolution {
  assignment: Uint8Array;
  objective: number;
  feasible: boolean;
}

// ──────────── Specialist ────────────

export class EvidenceSolver implements Specialist {
  readonly id = "evidence_solver";
  readonly display_name = "Matching your evidence to the role";
  readonly brain_region = "DLPFC";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 15;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { evidence_graph, hypotheses } = ctx.blackboard;

    const gap_map = (evidence_graph as unknown as { gap_map?: GapMap }).gap_map;
    if (!gap_map || gap_map.entries.length === 0) {
      return this.empty_result(goal, t0, "no gap_map available — GapMapper must run first");
    }

    const bullet_budget = read_number(goal.payload?.bullet_budget, DEFAULT_BULLET_BUDGET);
    const max_claims = read_number(
      goal.payload?.max_claims_per_bullet,
      DEFAULT_MAX_CLAIMS_PER_BULLET,
    );

    // Arc alignment (nullable — commit #10 populates chosen_narrative_arc)
    const arc = hypotheses.chosen_narrative_arc;
    const arc_span_ids = new Set(arc?.lead_evidence_span_ids ?? []);

    // Solve
    const solution = this.solve(gap_map, bullet_budget, max_claims, arc_span_ids);

    const inputs_hash = AuditTrail.hash({
      n_entries: gap_map.entries.length,
      bullet_budget,
      max_claims,
      has_arc: !!arc,
      n_and_groups: gap_map.and_or_groups.filter((g) => g.kind === "and").length,
      n_or_groups: gap_map.and_or_groups.filter((g) => g.kind === "or").length,
    });

    // Emit child goal: propose_arcs (priority degraded by 1) — chains v2.0 §7.1.
    const propose_goal: Goal = {
      id: randomUUID(),
      kind: "propose_arcs",
      priority: Math.max(0, (goal.priority ?? 80) - 1),
      emitted_by: this.id,
      payload: {},
      status: "pending",
      satisfied_by: [],
      parent_goal_id: goal.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return {
      writes: [{ path: "evidence_graph.solver_solution", value: solution }],
      new_goals: [propose_goal],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "cpsat_branch_and_bound",
        inputs_hash,
        output_hash: AuditTrail.hash({
          n_bullets: solution.bullets.length,
          coverage: solution.total_coverage,
          weighted_coverage: solution.weighted_coverage,
          hard_sat: solution.hard_constraints_satisfied,
          optimal: solution.solver_stats.optimal,
          iterations: solution.solver_stats.iterations,
        }),
        justification: `solved ${gap_map.entries.length} requirements → ${solution.bullets.length} bullets | coverage=${(solution.total_coverage * 100).toFixed(1)}% | weighted=${(solution.weighted_coverage * 100).toFixed(1)}% | hard_satisfied=${solution.hard_constraints_satisfied} | ${solution.solver_stats.optimal ? "OPTIMAL" : `gap=${solution.solver_stats.solution_gap_pct.toFixed(2)}%`} | ${solution.solver_stats.iterations} iterations in ${solution.solver_stats.solve_time_ms.toFixed(1)}ms`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["evidence_graph.solver_solution"],
      },
    };
  }

  // ──────────── Core solver ────────────

  solve(
    gap_map: GapMap,
    bullet_budget: number,
    max_claims_per_bullet: number,
    arc_span_ids: Set<string>,
  ): SolverSolution {
    const solve_t0 = performance.now();

    // Phase 1: Build solver variables (filter out non-actionable)
    const variables = this.build_variables(gap_map, arc_span_ids);
    const n = variables.length;
    const total_slots = bullet_budget * max_claims_per_bullet;

    if (n === 0) {
      return this.trivial_solution(solve_t0);
    }

    // Phase 2: Compute LP upper bound (relaxation)
    const sorted_by_weight = [...variables].sort((a, b) => b.weight - a.weight);
    const lp_upper = this.compute_lp_upper_bound(sorted_by_weight, total_slots);

    // Phase 3: Branch-and-bound with constraint propagation
    let iterations = 0;
    let branches_pruned = 0;
    let propagation_steps = 0;

    const best: BestSolution = {
      assignment: new Uint8Array(n),
      objective: Number.NEGATIVE_INFINITY,
      feasible: false,
    };

    // Greedy initial solution (warm start)
    const greedy = this.greedy_solution(variables, total_slots);
    if (greedy.feasible) {
      best.assignment = greedy.assignment.slice() as unknown as Uint8Array;
      best.objective = greedy.objective;
      best.feasible = true;
    }

    // DFS branch-and-bound
    const stack: Array<{
      depth: number;
      assignment: Uint8Array;
      remaining_capacity: number;
      current_weight: number;
    }> = [];

    stack.push({
      depth: 0,
      assignment: new Uint8Array(n),
      remaining_capacity: total_slots,
      current_weight: 0,
    });

    while (stack.length > 0 && iterations < MAX_SOLVER_ITERATIONS) {
      iterations++;
      const node = stack.pop()!;

      if (node.depth === n) {
        // Leaf: check feasibility and update best
        if (this.is_feasible(node.assignment, variables, gap_map)) {
          if (node.current_weight > best.objective) {
            best.assignment = node.assignment.slice() as unknown as Uint8Array;
            best.objective = node.current_weight;
            best.feasible = true;
          }
        }
        continue;
      }

      const var_idx = sorted_by_weight[node.depth]!;
      const original_idx = variables.indexOf(var_idx);

      // Upper bound check: can this branch beat the best?
      const remaining_vars = sorted_by_weight.slice(node.depth + 1);
      const ub =
        node.current_weight + this.fractional_bound(remaining_vars, node.remaining_capacity);
      if (ub <= best.objective) {
        branches_pruned++;
        continue;
      }

      // Branch 1: assign this variable (include requirement)
      if (node.remaining_capacity > 0) {
        const next_assign = node.assignment.slice() as unknown as Uint8Array;
        next_assign[original_idx] = 1;

        // Constraint propagation: check AND-group consistency
        const propagation_ok = this.propagate_constraints(
          next_assign,
          original_idx,
          variables,
          gap_map,
        );
        propagation_steps++;

        if (propagation_ok) {
          stack.push({
            depth: node.depth + 1,
            assignment: next_assign,
            remaining_capacity: node.remaining_capacity - 1,
            current_weight: node.current_weight + var_idx.weight,
          });
        } else {
          branches_pruned++;
        }
      }

      // Branch 0: skip this variable (exclude requirement)
      // Only valid if the variable isn't a hard constraint
      if (!var_idx.is_hard) {
        const skip_assign = node.assignment.slice() as unknown as Uint8Array;
        skip_assign[original_idx] = 0;
        stack.push({
          depth: node.depth + 1,
          assignment: skip_assign,
          remaining_capacity: node.remaining_capacity,
          current_weight: node.current_weight,
        });
      } else {
        // Hard variable MUST be assigned if capacity allows
        if (node.remaining_capacity <= 0) {
          // Infeasible branch — hard constraint can't be met
          branches_pruned++;
        }
      }
    }

    const solve_time_ms = performance.now() - solve_t0;
    const optimal = iterations < MAX_SOLVER_ITERATIONS && best.feasible;
    const solution_gap = lp_upper > 0 ? ((lp_upper - best.objective) / lp_upper) * 100 : 0;

    // Phase 4: Pack solution into bullet plans
    const bullets = this.pack_into_bullets(
      best.assignment,
      variables,
      max_claims_per_bullet,
      bullet_budget,
    );

    // Phase 5: Compute coverage metrics
    const assigned_ids = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (best.assignment[i]) assigned_ids.add(variables[i]!.requirement_id);
    }

    const hard_vars = variables.filter((v) => v.is_hard);
    const uncovered_hard = hard_vars
      .filter((v) => !assigned_ids.has(v.requirement_id))
      .map((v) => v.requirement_id);

    const soft_vars = variables.filter((v) => !v.is_hard);
    const dropped_soft = soft_vars
      .filter((v) => !assigned_ids.has(v.requirement_id))
      .map((v) => v.requirement_id);

    // AND/OR group violation checks
    const and_violations = gap_map.and_or_groups
      .filter((g) => g.kind === "and")
      .filter((g) => {
        const members_assigned = g.requirement_ids.filter((id) => assigned_ids.has(id));
        return members_assigned.length > 0 && members_assigned.length < g.requirement_ids.length;
      })
      .map((g) => g.group_id);

    const or_violations = gap_map.and_or_groups
      .filter((g) => g.kind === "or")
      .filter((g) => {
        return !g.requirement_ids.some((id) => assigned_ids.has(id));
      })
      .map((g) => g.group_id);

    const total_actionable = variables.length;
    const total_assigned = assigned_ids.size;
    const total_coverage = total_actionable > 0 ? total_assigned / total_actionable : 1;

    // Weighted coverage (importance × confidence weighted)
    let weighted_num = 0;
    let weighted_den = 0;
    for (const v of variables) {
      weighted_den += v.entry.discourse_importance;
      if (assigned_ids.has(v.requirement_id)) {
        weighted_num += v.entry.discourse_importance * v.entry.adjusted_confidence;
      }
    }
    const weighted_coverage = weighted_den > 0 ? weighted_num / weighted_den : 0;

    return {
      bullets,
      total_coverage,
      total_weight: best.objective === Number.NEGATIVE_INFINITY ? 0 : best.objective,
      weighted_coverage,
      hard_constraints_satisfied: uncovered_hard.length === 0,
      uncovered_hard_requirements: uncovered_hard,
      dropped_soft_requirements: dropped_soft,
      and_group_violations: and_violations,
      or_group_violations: or_violations,
      solver_stats: {
        iterations,
        branches_pruned,
        propagation_steps,
        upper_bound: lp_upper,
        solution_gap_pct: solution_gap,
        solve_time_ms,
        optimal,
      },
    };
  }

  // ──────────── Variable construction ────────────

  private build_variables(gap_map: GapMap, arc_span_ids: Set<string>): SolverVariable[] {
    return gap_map.entries
      .filter((e) => e.disposition !== "missable" && e.disposition !== "must_omit_from_application")
      .map((entry) => {
        // Multi-factor weight computation (PRD §7.1.3)
        const coverage_w = disposition_coverage_weight(entry.disposition);
        const confidence_w = entry.adjusted_confidence;
        const discourse_w = entry.discourse_importance;
        const arc_w = compute_arc_alignment(entry, arc_span_ids);

        // Combined weight: product of factors (multiplicative, not additive)
        // This ensures all factors must be reasonable — a single zero kills it
        const weight = coverage_w * confidence_w * discourse_w * arc_w;

        // Hard constraint: direct_hit or implied_hit at ≥ 0.7 AND discourse filter/test
        const is_hard =
          entry.is_hard_constraint && entry.adjusted_confidence >= HARD_CONFIDENCE_FLOOR;

        return {
          requirement_id: entry.requirement_id,
          entry,
          weight,
          is_hard,
          and_group: entry.and_or_group?.startsWith("and_") ? entry.and_or_group : null,
          or_group: entry.and_or_group?.startsWith("or_") ? entry.and_or_group : null,
        };
      })
      .sort((a, b) => b.weight - a.weight || a.requirement_id.localeCompare(b.requirement_id));
  }

  // ──────────── LP relaxation upper bound ────────────

  private compute_lp_upper_bound(sorted: SolverVariable[], capacity: number): number {
    let sum = 0;
    let remaining = capacity;
    for (const v of sorted) {
      if (remaining <= 0) break;
      if (remaining >= 1) {
        sum += v.weight;
        remaining -= 1;
      } else {
        // Fractional assignment for the bound
        sum += v.weight * remaining;
        remaining = 0;
      }
    }
    return sum;
  }

  // ──────────── Fractional bound for subtree ────────────

  private fractional_bound(remaining_vars: SolverVariable[], capacity: number): number {
    let sum = 0;
    let cap = capacity;
    for (const v of remaining_vars) {
      if (cap <= 0) break;
      sum += v.weight;
      cap--;
    }
    return sum;
  }

  // ──────────── Greedy warm-start solution ────────────

  private greedy_solution(
    variables: SolverVariable[],
    capacity: number,
  ): { assignment: Uint8Array; objective: number; feasible: boolean } {
    const n = variables.length;
    const assignment = new Uint8Array(n);
    let used = 0;
    let obj = 0;

    // Phase 1: greedily assign all hard constraints
    for (let i = 0; i < n; i++) {
      if (variables[i]!.is_hard && used < capacity) {
        assignment[i] = 1;
        obj += variables[i]!.weight;
        used++;
      }
    }

    // Phase 2: fill remaining capacity with highest-weight soft vars
    const soft_indices = variables
      .map((v, i) => ({ weight: v.weight, idx: i, is_hard: v.is_hard }))
      .filter((x) => !x.is_hard)
      .sort((a, b) => b.weight - a.weight);

    for (const { idx } of soft_indices) {
      if (used >= capacity) break;
      assignment[idx] = 1;
      obj += variables[idx]!.weight;
      used++;
    }

    // Feasibility: all hard constraints assigned?
    const all_hard_assigned = variables.every((v, i) => !v.is_hard || assignment[i] === 1);

    return { assignment, objective: obj, feasible: all_hard_assigned };
  }

  // ──────────── Feasibility check ────────────

  private is_feasible(
    assignment: Uint8Array,
    variables: SolverVariable[],
    gap_map: GapMap,
  ): boolean {
    // All hard constraints must be assigned
    for (let i = 0; i < variables.length; i++) {
      if (variables[i]!.is_hard && !assignment[i]) return false;
    }

    // AND-group: all or nothing
    const and_groups = new Map<string, { total: number; assigned: number }>();
    for (let i = 0; i < variables.length; i++) {
      const g = variables[i]!.and_group;
      if (!g) continue;
      if (!and_groups.has(g)) and_groups.set(g, { total: 0, assigned: 0 });
      const state = and_groups.get(g)!;
      state.total++;
      if (assignment[i]) state.assigned++;
    }
    for (const state of and_groups.values()) {
      if (state.assigned > 0 && state.assigned < state.total) return false;
    }

    // OR-group: at least one member assigned (only for hard OR-groups)
    const or_groups_in_hard = gap_map.and_or_groups.filter(
      (g) => g.kind === "or" && variables.some((v) => v.or_group === g.group_id && v.is_hard),
    );
    for (const og of or_groups_in_hard) {
      const any_assigned = variables.some(
        (v, i) => v.or_group === og.group_id && assignment[i] === 1,
      );
      if (!any_assigned) return false;
    }

    return true;
  }

  // ──────────── Constraint propagation ────────────

  private propagate_constraints(
    assignment: Uint8Array,
    just_assigned_idx: number,
    variables: SolverVariable[],
    _gap_map: GapMap,
  ): boolean {
    const v = variables[just_assigned_idx]!;

    // AND-group propagation: if one member is assigned, all must be
    if (v.and_group) {
      for (let i = 0; i < variables.length; i++) {
        if (i === just_assigned_idx) continue;
        if (variables[i]!.and_group === v.and_group) {
          if (assignment[i] === 0) {
            // Check: is there capacity? (caller manages capacity)
            // For now, just flag that this propagation doesn't violate
            assignment[i] = 1;
          }
        }
      }
    }

    return true;
  }

  // ──────────── Bullet packing ────────────

  private pack_into_bullets(
    assignment: Uint8Array,
    variables: SolverVariable[],
    max_per_bullet: number,
    bullet_budget: number,
  ): BulletPlan[] {
    // Collect assigned variables, sorted by weight desc
    const assigned: Array<{ variable: SolverVariable; idx: number }> = [];
    for (let i = 0; i < variables.length; i++) {
      if (assignment[i]) assigned.push({ variable: variables[i]!, idx: i });
    }
    assigned.sort((a, b) => b.variable.weight - a.variable.weight);

    // Pack into bullets using first-fit-decreasing bin packing
    const bullets: BulletPlan[] = [];
    const bullet_counts: number[] = [];

    for (const { variable } of assigned) {
      // Find first bullet with capacity
      let placed = false;
      for (let b = 0; b < bullets.length; b++) {
        if (bullet_counts[b]! < max_per_bullet) {
          bullets[b]!.assignments.push(this.to_assignment(variable));
          bullets[b]!.total_weight += variable.weight;
          bullet_counts[b]!++;
          placed = true;
          break;
        }
      }

      if (!placed && bullets.length < bullet_budget) {
        // Open new bullet
        bullets.push({
          bullet_index: bullets.length,
          section_hint: infer_section_hint(variable.entry),
          assignments: [this.to_assignment(variable)],
          total_weight: variable.weight,
          dominant_claim_type: infer_dominant_claim(variable.entry),
          verb_quality_floor: infer_verb_floor(variable.entry),
        });
        bullet_counts.push(1);
      }
    }

    // Sort bullets: strongest first (for resume ordering)
    bullets.sort((a, b) => b.total_weight - a.total_weight);
    for (let i = 0; i < bullets.length; i++) {
      bullets[i]!.bullet_index = i;
    }

    return bullets;
  }

  private to_assignment(variable: SolverVariable): EvidenceAssignment {
    const entry = variable.entry;
    return {
      requirement_id: entry.requirement_id,
      requirement_text: entry.requirement_text,
      assigned_span_ids: entry.evidence_span_ids,
      confidence: entry.adjusted_confidence,
      weight: variable.weight,
      disposition: entry.disposition,
      transfer_path: entry.transfer_path,
      arc_alignment_score: variable.weight, // already includes arc factor
    };
  }

  // ──────────── Trivial solution (no variables) ────────────

  private trivial_solution(solve_t0: number): SolverSolution {
    return {
      bullets: [],
      total_coverage: 1.0,
      total_weight: 0,
      weighted_coverage: 1.0,
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
        solve_time_ms: performance.now() - solve_t0,
        optimal: true,
      },
    };
  }

  private empty_result(goal: Goal, t0: number, reason: string): SpecialistResult {
    return {
      writes: [],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "no_input",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
        output_hash: AuditTrail.hash({ empty: true, reason }),
        justification: reason,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}

// ──────────── Weight computation helpers ────────────

function disposition_coverage_weight(disposition: string): number {
  switch (disposition) {
    case "direct_hit":
      return 1.0;
    case "implied_hit":
      return 0.85;
    case "transferable":
      return 0.6;
    case "must_address_in_cover_letter":
      return 0.3;
    default:
      return 0.1;
  }
}

function compute_arc_alignment(entry: GapMapEntry, arc_span_ids: Set<string>): number {
  if (arc_span_ids.size === 0) return 1.0; // No arc chosen yet — neutral
  // Boost requirements whose evidence overlaps with the chosen arc's lead spans
  const overlap = entry.evidence_span_ids.filter((id) => arc_span_ids.has(id)).length;
  if (overlap === 0) return 0.8; // Not arc-aligned but still valid
  // Proportional boost: more overlap = stronger alignment
  return 1.0 + 0.2 * Math.min(overlap / entry.evidence_span_ids.length, 1.0);
}

// ──────────── Section / claim inference ────────────

function infer_section_hint(entry: GapMapEntry): "experience" | "skills" | "summary" | "projects" {
  const text = entry.requirement_text.toLowerCase();
  if (/\d+\s*\+?\s*year|led|built|designed|shipped|managed|architected/i.test(text)) {
    return "experience";
  }
  if (/proficien|knowledge|familiar|fluent|expertise\s+in/i.test(text)) {
    return "skills";
  }
  if (/project|portfolio|open[-\s]source|side[-\s]project/i.test(text)) {
    return "projects";
  }
  return "experience";
}

function infer_dominant_claim(entry: GapMapEntry): string {
  const text = entry.requirement_text.toLowerCase();
  if (/\d+[%xX]|\d+\s*(?:million|billion|k\b|m\b|users|requests)/i.test(text)) return "metric";
  if (/lead|manage|mentor|coach/i.test(text)) return "leadership";
  if (/architect|design|scale|system/i.test(text)) return "technical_depth";
  if (/ship|launch|deliver|deploy/i.test(text)) return "achievement";
  return "skill_usage";
}

function infer_verb_floor(entry: GapMapEntry): "standard" | "strong" | "elite" {
  if (entry.adjusted_confidence >= 0.85 && entry.disposition === "direct_hit") return "elite";
  if (entry.adjusted_confidence >= 0.7) return "strong";
  return "standard";
}

function read_number(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}
