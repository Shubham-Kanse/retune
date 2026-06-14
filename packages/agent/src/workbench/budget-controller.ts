/**
 * Budget controller — the hard kill switch.
 *
 * Enforces the per-generation cost ceiling and triggers cooperative
 * cancellation via AbortController when exceeded.
 *
 * Also tracks per-specialist spend for SHAP-style cost attribution and
 * for the cost dashboard (PRD §C10).
 *
 *        amygdala: threat (cost runaway) detection
 */

import type { CostBudget } from "@retune/types";

export class BudgetExhaustedError extends Error {
  constructor(
    public readonly spent_usd: number,
    public readonly ceiling_usd: number,
  ) {
    super(`budget exhausted: spent $${spent_usd.toFixed(4)} of $${ceiling_usd.toFixed(4)}`);
    this.name = "BudgetExhaustedError";
  }
}

export class BudgetController {
  private readonly abort_controller = new AbortController();

  constructor(private budget: CostBudget) {}

  get signal(): AbortSignal {
    return this.abort_controller.signal;
  }

  snapshot(): CostBudget {
    return JSON.parse(JSON.stringify(this.budget)) as CostBudget;
  }

  spent(): number {
    return this.budget.spent_usd;
  }

  remaining(): number {
    return Math.max(0, this.budget.ceiling_usd - this.budget.spent_usd);
  }

  /**
   * Check if we can afford to run a specialist with this estimated cost
   * WITHOUT triggering hard kill. Soft ceiling: refuse to start.
   */
  can_afford(estimated_cost_usd: number): boolean {
    return this.budget.spent_usd + estimated_cost_usd <= this.budget.ceiling_usd;
  }

  /**
   * Charge actual cost after a specialist completes. May trigger hard
   * kill if it pushes us past `hard_kill_usd`, which aborts the signal
   * and throws on next call to `assert_alive`.
   */
  charge(specialist_id: string, actual_cost_usd: number): void {
    this.budget = {
      ...this.budget,
      spent_usd: this.budget.spent_usd + actual_cost_usd,
      per_specialist_spent: {
        ...this.budget.per_specialist_spent,
        [specialist_id]: (this.budget.per_specialist_spent[specialist_id] ?? 0) + actual_cost_usd,
      },
    };
    if (this.budget.spent_usd >= this.budget.hard_kill_usd) {
      this.abort_controller.abort(
        new BudgetExhaustedError(this.budget.spent_usd, this.budget.hard_kill_usd),
      );
    }
  }

  /**
   * Throw if the budget has been exhausted. Called between ticks by the
   * orchestrator.
   */
  assert_alive(): void {
    if (this.abort_controller.signal.aborted) {
      throw new BudgetExhaustedError(this.budget.spent_usd, this.budget.hard_kill_usd);
    }
  }
}
