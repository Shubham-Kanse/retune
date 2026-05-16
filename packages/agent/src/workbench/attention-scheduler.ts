/**
 * Attention scheduler.
 *
 * Per tick, given a goal and a set of candidate specialists, the
 * scheduler ranks candidates by expected value — quality × goal-priority
 * minus an estimated-cost penalty — and returns the winner. If no
 * candidate fits inside the remaining budget, returns `null` so the
 * orchestrator can decide whether to abandon, defer, or escalate.
 *
 * v003 SOTA additions:
 *   - When the goal carries `expected_value` and/or `uncertainty`, the
 *     scheduler folds them into the priority factor: higher EVOI
 *     boosts attention, higher already-resolved certainty (low
 *     uncertainty) reduces it. This keeps the cognitive cycle from
 *     spinning on goals whose answer is already in the blackboard.
 *
 * Ranking formula:
 *
 *   ev = priority_factor × competence_factor × evoi_factor − cost_penalty
 *
 *   priority_factor   = goal.priority / 100      (∈ [0,1])
 *   competence_factor = 1.0 (every registered candidate is competent)
 *   evoi_factor       = clamp(0.5 + 0.5 * goal.expected_value
 *                              + 0.25 * goal.uncertainty, 0.5, 1.5)
 *                       (default 1.0 when EVOI fields are absent)
 *   cost_penalty      = α × (estimated_cost / remaining_budget)
 *                       α defaults to 0.5; tunable via constructor
 *
 * Tie-breaking: lower estimated cost wins, then registration order.
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
      const ev = score(s, input, this.cost_penalty_alpha);
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

function score(s: Specialist, input: PickInput, cost_alpha: number): number {
  const priority_factor = input.goal.priority / 100;
  const competence_factor = 1.0;
  const evoi_factor = compute_evoi_factor(input.goal);
  const cost_penalty =
    input.budget_remaining_usd > 0 ? cost_alpha * (s.estimated_cost_usd / input.budget_remaining_usd) : 0;
  return priority_factor * competence_factor * evoi_factor - cost_penalty;
}

function compute_evoi_factor(goal: Goal): number {
  // Default 1.0 when EVOI fields are absent (legacy goals).
  if (goal.expected_value === undefined && goal.uncertainty === undefined) return 1.0;
  const ev = goal.expected_value ?? 0.5;
  const uncertainty = goal.uncertainty ?? 0;
  const factor = 0.5 + 0.5 * ev + 0.25 * uncertainty;
  return Math.max(0.5, Math.min(1.5, factor));
}

function rationale(s: Specialist, ev: number): string {
  return `picked ${s.id} (cost=$${s.estimated_cost_usd.toFixed(4)}, ev=${ev.toFixed(3)})`;
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
