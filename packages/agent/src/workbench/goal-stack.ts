/**
 * Goal stack.
 *
 * Typed, prioritized work queue that the attention scheduler reasons over.
 * Goals enter pending; the scheduler picks the highest-priority pending
 * goal, marks it in_progress, runs the chosen specialist, and then either
 * marks the goal satisfied or pushes new subgoals (e.g. on conflict).
 *
 * v003 SOTA additions:
 *   - `semantic_key` dedupe: `add()` and `push()` suppress duplicate
 *     pending/in_progress goals so seed-and-chain pipelines don't fight.
 *   - `requires` prerequisites: `peek_next()` accepts an optional
 *     blackboard accessor that filters goals whose dependencies have
 *     not been written yet.
 *   - `attempt_count` hard cap: when `max_attempts` is exceeded the
 *     goal is marked abandoned with `status_reason="max_attempts_exceeded"`.
 *
 * @brain DLPFC: working-memory goal maintenance
 */

import { randomUUID } from "node:crypto";
import {
  DEFAULT_GOAL_MAX_ATTEMPTS,
  type Goal,
  type GoalKind,
  type GoalStatus,
} from "@retune/types";

/** A read accessor over a blackboard snapshot used for prerequisite checks. */
export type BlackboardReader = (path: string) => unknown;

export interface PeekNextOptions {
  /**
   * If supplied, goals whose `requires` array contains a path the
   * accessor returns `undefined`/`null`/empty array for are excluded.
   */
  blackboard?: BlackboardReader;
}

export class GoalStack {
  private goals: Goal[] = [];

  add(input: {
    kind: GoalKind;
    priority: number;
    emitted_by: string;
    payload?: Record<string, unknown>;
    parent_goal_id?: string;
    semantic_key?: string;
    requires?: readonly string[];
    blocks?: readonly string[];
    max_attempts?: number;
    uncertainty?: number;
    expected_value?: number;
    deadline_ms?: number | null;
  }): Goal {
    // Semantic dedupe — if a pending/in_progress goal already carries
    // the same semantic_key, return that one instead of creating a new
    // row. This is what stops `compose_resume:variant=foo` from being
    // emitted twice.
    if (input.semantic_key) {
      const existing = this.goals.find(
        (g) =>
          g.semantic_key === input.semantic_key &&
          (g.status === "pending" || g.status === "in_progress" || g.status === "blocked_on_prerequisites"),
      );
      if (existing) return existing;
    }

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
      semantic_key: input.semantic_key,
      requires: input.requires ? [...input.requires] : undefined,
      blocks: input.blocks ? [...input.blocks] : undefined,
      max_attempts: input.max_attempts ?? DEFAULT_GOAL_MAX_ATTEMPTS,
      attempt_count: 0,
      uncertainty: input.uncertainty,
      expected_value: input.expected_value,
      deadline_ms: input.deadline_ms ?? null,
      status_reason: null,
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
   * diverge. Honours semantic_key dedupe so chains can re-emit safely.
   */
  push(goal: Goal): void {
    if (this.goals.some((g) => g.id === goal.id)) {
      throw new Error(`goal id ${goal.id} already in stack`);
    }
    if (goal.semantic_key) {
      const existing = this.goals.find(
        (g) =>
          g.semantic_key === goal.semantic_key &&
          (g.status === "pending" || g.status === "in_progress" || g.status === "blocked_on_prerequisites"),
      );
      if (existing) {
        // Semantic dedupe — drop the duplicate quietly. The chain
        // intent (an upstream specialist emitting a downstream goal)
        // is preserved by the existing row.
        return;
      }
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
   * Pick the highest-priority pending goal.
   *
   * Filtering rules:
   *   1. Goals with status !== "pending" are skipped.
   *   2. When `opts.blackboard` is provided, goals whose `requires`
   *      paths are unsatisfied are skipped (the orchestrator marks
   *      them `blocked_on_prerequisites` after the call).
   *   3. Goals whose `attempt_count >= max_attempts` are skipped (the
   *      orchestrator should abandon them after the call).
   *
   * Ties are broken by FIFO (earliest `created_at` wins).
   * Does NOT mutate; the orchestrator calls `mark_in_progress` once
   * it has chosen which to actually run.
   */
  peek_next(opts: PeekNextOptions = {}): Goal | undefined {
    let best: Goal | undefined;
    for (const g of this.goals) {
      if (g.status !== "pending") continue;
      if (g.attempt_count !== undefined && g.max_attempts !== undefined && g.attempt_count >= g.max_attempts) {
        continue;
      }
      if (opts.blackboard && !this.prerequisites_met(g, opts.blackboard)) continue;
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

  /**
   * Pending goals whose prerequisites are unmet against the supplied
   * blackboard. Useful for the orchestrator to flip them to
   * `blocked_on_prerequisites` for diagnostic/audit purposes.
   */
  pending_blocked_by_prerequisites(reader: BlackboardReader): Goal[] {
    return this.goals.filter(
      (g) => g.status === "pending" && !this.prerequisites_met(g, reader),
    );
  }

  private prerequisites_met(goal: Goal, reader: BlackboardReader): boolean {
    const reqs = goal.requires;
    if (!reqs || reqs.length === 0) return true;
    for (const path of reqs) {
      const v = reader(path);
      if (v === undefined || v === null) return false;
      if (Array.isArray(v) && v.length === 0) return false;
    }
    return true;
  }

  mark_in_progress(id: string): void {
    const g = this.get(id);
    if (!g) throw new Error(`goal ${id} not found`);
    this.update(id, {
      status: "in_progress",
      attempt_count: (g.attempt_count ?? 0) + 1,
    });
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

  mark_blocked_on_prerequisites(id: string, reason?: string): void {
    this.update(id, {
      status: "blocked_on_prerequisites",
      status_reason: reason ?? "prerequisites_unmet",
    });
  }

  mark_abandoned(id: string, reason?: string): void {
    this.update(id, {
      status: "abandoned",
      status_reason: reason ?? null,
    });
  }

  /** Move a blocked-on-prerequisites goal back to pending (e.g. when its dependencies get written). */
  unblock(id: string): void {
    const g = this.get(id);
    if (!g) return;
    if (g.status !== "blocked_on_prerequisites") return;
    this.update(id, { status: "pending", status_reason: null });
  }

  /** Re-evaluate all blocked goals against a fresh blackboard reader; unblock the eligible ones. */
  reconcile_prerequisites(reader: BlackboardReader): void {
    for (const g of this.goals) {
      if (g.status === "blocked_on_prerequisites" && this.prerequisites_met(g, reader)) {
        this.update(g.id, { status: "pending", status_reason: null });
      }
    }
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
    return this.goals.some(
      (g) =>
        g.status === "pending" ||
        g.status === "in_progress" ||
        g.status === "blocked_on_prerequisites",
    );
  }
}
