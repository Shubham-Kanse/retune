/**
 * Attention scheduler.
 *
 * Per tick, given a goal and a set of candidate specialists, the
 * scheduler ranks candidates by expected value — quality × goal-priority
 * minus an estimated-cost penalty — and returns the winner. If no
 * candidate fits inside the remaining budget, returns `null` so the
 * orchestrator can decide whether to abandon, defer, or escalate.
 *
 * Commit #2 ranking (deliberately simple, deterministic):
 *
 *   ev = priority_factor × competence_factor − cost_penalty
 *
 *   priority_factor   = goal.priority / 100      (∈ [0,1])
 *   competence_factor = 1.0 (every registered candidate is competent;
 *                       differentiated competence lands when we have
 *                       multiple specialists per goal kind in commit #4)
 *   cost_penalty      = α × (estimated_cost / remaining_budget)
 *                       α defaults to 0.5; tunable via constructor
 *
 * Tie-breaking: lower estimated cost wins, then registration order.
 *
 * The learned RL-ranker described in PRD §E1 replaces this in year 2
 * once we have ≥ 50k logged ticks. The interface stays the same.
 *
 * @brain DLPFC: top-down attention allocation
 *        + dorsal anterior cingulate: cost-of-control valuation
 */

import type { Goal } from "@retune/types";
import type { Specialist } from "./types";

export interface PickInput {
  goal: Goal;
  candidates: readonly Specialist[];
  budget_remaining_usd: number;
}

export interface PickOutput {
  specialist: Specialist;
  expected_value: number;
  rationale: string;
}

export class AttentionScheduler {
  constructor(private readonly cost_penalty_alpha = 0.5) {}

  pick(input: PickInput): PickOutput | null {
    if (input.candidates.length === 0) return null;

    // Filter candidates that can't fit even soft-budget.
    const affordable = input.candidates.filter(
      (s) => s.estimated_cost_usd <= input.budget_remaining_usd,
    );
    if (affordable.length === 0) return null;

    let best: PickOutput | null = null;
    for (let i = 0; i < affordable.length; i++) {
      const s = affordable[i];
      if (!s) continue;
      const ev = score(s, input);
      if (best === null) {
        best = { specialist: s, expected_value: ev, rationale: rationale(s, ev) };
        continue;
      }
      // Higher EV wins; on tie, lower cost wins; on tie again, earlier registration wins.
      if (
        ev > best.expected_value ||
        (almostEqual(ev, best.expected_value) &&
          s.estimated_cost_usd < best.specialist.estimated_cost_usd)
      ) {
        best = { specialist: s, expected_value: ev, rationale: rationale(s, ev) };
      }
    }
    return best;
  }
}

function score(s: Specialist, input: PickInput): number {
  const priority_factor = input.goal.priority / 100;
  const competence_factor = 1.0;
  const cost_penalty =
    input.budget_remaining_usd > 0 ? 0.5 * (s.estimated_cost_usd / input.budget_remaining_usd) : 0;
  return priority_factor * competence_factor - cost_penalty;
}

function rationale(s: Specialist, ev: number): string {
  return `picked ${s.id} (cost=$${s.estimated_cost_usd.toFixed(4)}, ev=${ev.toFixed(3)})`;
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
