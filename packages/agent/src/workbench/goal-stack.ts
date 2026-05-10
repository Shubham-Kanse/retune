/**
 * Goal stack.
 *
 * Typed, prioritized work queue that the attention scheduler reasons over.
 * Goals enter pending; the scheduler picks the highest-priority pending
 * goal, marks it in_progress, runs the chosen specialist, and then either
 * marks the goal satisfied or pushes new subgoals (e.g. on conflict).
 *
 * @brain DLPFC: working-memory goal maintenance
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind, GoalStatus } from "@retune/types";

export class GoalStack {
  private goals: Goal[] = [];

  add(input: {
    kind: GoalKind;
    priority: number;
    emitted_by: string;
    payload?: Record<string, unknown>;
    parent_goal_id?: string;
  }): Goal {
    const now = new Date().toISOString();
    const goal: Goal = {
      id: randomUUID(),
      kind: input.kind,
      priority: input.priority,
      emitted_by: input.emitted_by,
      payload: input.payload,
      status: "pending",
      satisfied_by: [],
      parent_goal_id: input.parent_goal_id ?? null,
      created_at: now,
      updated_at: now,
    };
    this.goals.push(goal);
    return goal;
  }

  /** Replace the entire goal list (used during deserialization for replay). */
  hydrate(goals: Goal[]): void {
    this.goals = [...goals];
  }

  /**
   * Push a pre-built Goal (e.g. emitted by a specialist as a subgoal).
   * Rejects duplicate ids so the blackboard and the goal stack can't
   * diverge.
   */
  push(goal: Goal): void {
    if (this.goals.some((g) => g.id === goal.id)) {
      throw new Error(`goal id ${goal.id} already in stack`);
    }
    this.goals.push(goal);
  }

  list(filter?: { status?: GoalStatus; kind?: GoalKind }): Goal[] {
    return this.goals.filter((g) => {
      if (filter?.status && g.status !== filter.status) return false;
      if (filter?.kind && g.kind !== filter.kind) return false;
      return true;
    });
  }

  get(id: string): Goal | undefined {
    return this.goals.find((g) => g.id === id);
  }

  /**
   * Pick the highest-priority pending goal. Ties broken by FIFO (earliest
   * `created_at` wins). Does NOT mutate; the orchestrator calls
   * `mark_in_progress` once it has chosen which to actually run.
   */
  peek_next(): Goal | undefined {
    let best: Goal | undefined;
    for (const g of this.goals) {
      if (g.status !== "pending") continue;
      if (
        !best ||
        g.priority > best.priority ||
        (g.priority === best.priority && g.created_at < best.created_at)
      ) {
        best = g;
      }
    }
    return best;
  }

  mark_in_progress(id: string): void {
    this.update(id, { status: "in_progress" });
  }

  mark_satisfied(id: string, satisfied_by_specialist: string): void {
    const goal = this.get(id);
    if (!goal) throw new Error(`goal ${id} not found`);
    this.update(id, {
      status: "satisfied",
      satisfied_by: [...goal.satisfied_by, satisfied_by_specialist],
    });
  }

  mark_blocked_on_user(id: string): void {
    this.update(id, { status: "blocked_on_user" });
  }

  mark_abandoned(id: string): void {
    this.update(id, { status: "abandoned" });
  }

  private update(id: string, patch: Partial<Goal>): void {
    const idx = this.goals.findIndex((g) => g.id === id);
    if (idx < 0) throw new Error(`goal ${id} not found`);
    const existing = this.goals[idx];
    if (!existing) throw new Error(`goal ${id} disappeared`);
    this.goals[idx] = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
  }

  snapshot(): Goal[] {
    return JSON.parse(JSON.stringify(this.goals)) as Goal[];
  }

  /** Are there any pending or in_progress goals left? */
  has_open_work(): boolean {
    return this.goals.some((g) => g.status === "pending" || g.status === "in_progress");
  }
}
