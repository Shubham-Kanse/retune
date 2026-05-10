/**
 * Failure mode: cost runaway abort (prd-2.0 §9, failure #5).
 *
 * The BudgetController must:
 *   1. Refuse to start specialists that exceed the soft ceiling
 *   2. Abort the signal when hard_kill_usd is exceeded
 *   3. Throw BudgetExhaustedError when assert_alive() is called post-abort
 */

import assert from "node:assert/strict";
import test from "node:test";
import { BudgetController, BudgetExhaustedError } from "../src/workbench/budget-controller";

test("can_afford returns true when within budget", () => {
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.1,
    hard_kill_usd: 0.2,
    per_specialist_spent: {},
  });

  assert.equal(budget.can_afford(0.05), true);
  assert.equal(budget.can_afford(0.1), true);
  assert.equal(budget.can_afford(0.11), false);
});

test("can_afford accounts for already-spent budget", () => {
  const budget = new BudgetController({
    spent_usd: 0.08,
    ceiling_usd: 0.1,
    hard_kill_usd: 0.2,
    per_specialist_spent: {},
  });

  assert.equal(budget.can_afford(0.02), true);
  assert.equal(budget.can_afford(0.03), false);
});

test("charge tracks per-specialist spending", () => {
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 1,
    hard_kill_usd: 2,
    per_specialist_spent: {},
  });

  budget.charge("bullet_composer", 0.01);
  budget.charge("bullet_composer", 0.02);
  budget.charge("critic_ensemble", 0.005);

  const snap = budget.snapshot();
  assert.ok(Math.abs(snap.per_specialist_spent.bullet_composer! - 0.03) < 1e-10);
  assert.ok(Math.abs(snap.per_specialist_spent.critic_ensemble! - 0.005) < 1e-10);
  assert.ok(Math.abs(snap.spent_usd - 0.035) < 1e-10);
});

test("hard_kill_usd triggers abort signal", () => {
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.05,
    hard_kill_usd: 0.1,
    per_specialist_spent: {},
  });

  assert.equal(budget.signal.aborted, false);

  budget.charge("expensive_specialist", 0.1);

  assert.equal(budget.signal.aborted, true);
});

test("assert_alive throws BudgetExhaustedError after hard kill", () => {
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.05,
    hard_kill_usd: 0.1,
    per_specialist_spent: {},
  });

  budget.charge("specialist", 0.15);

  assert.throws(
    () => budget.assert_alive(),
    (err) => {
      assert.ok(err instanceof BudgetExhaustedError);
      assert.equal(err.spent_usd, 0.15);
      assert.equal(err.ceiling_usd, 0.1);
      return true;
    },
  );
});

test("remaining() decreases as charges accumulate", () => {
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.5,
    hard_kill_usd: 1.0,
    per_specialist_spent: {},
  });

  assert.equal(budget.remaining(), 0.5);
  budget.charge("a", 0.2);
  assert.equal(budget.remaining(), 0.3);
  budget.charge("b", 0.3);
  assert.equal(budget.remaining(), 0);
  budget.charge("c", 0.1);
  assert.equal(budget.remaining(), 0);
});
