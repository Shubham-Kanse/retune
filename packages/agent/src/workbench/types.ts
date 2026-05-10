/**
 * Workbench-internal types not exposed via @retune/types.
 *
 * Anything used cross-package goes in @retune/types; anything that's
 * implementation detail of the workbench engine itself lives here.
 *
 * @brain DLPFC + thalamus: orchestration internals
 */

import type { AuditEntry, Blackboard, BlackboardEvent, ConflictRecord, Goal } from "@retune/types";

/**
 * SpecialistResult — what a specialist returns after one tick.
 *
 * Specialists do not mutate the blackboard directly. They produce a
 * SpecialistResult which the orchestrator commits transactionally.
 * This keeps writes atomic, audit-trailed, and replayable.
 */
export interface SpecialistResult {
  /**
   * Patches to apply to the blackboard. JSON-Pointer-like dot paths,
   * matching `BlackboardEvent.path`.
   */
  writes: Array<{
    path: string;
    value: unknown;
  }>;
  /** New conflicts raised by this specialist. */
  conflicts?: ConflictRecord[];
  /** New subgoals to push onto the goal stack. */
  new_goals?: Goal[];
  /** Goals this specialist satisfied (by id). */
  satisfied_goal_ids?: string[];
  /**
   * Audit entry — required. The orchestrator stamps `seq` and `timestamp`,
   * but the specialist must populate everything else.
   */
  audit: Omit<AuditEntry, "seq" | "timestamp">;
  /**
   * Free-form justification for the reasoning trace UI. Optional.
   * If provided, also persisted into the audit entry.
   */
  justification?: string;
}

/**
 * SpecialistContext — read-only view of the current blackboard state
 * passed into every specialist invocation, plus dependencies for ML
 * calls, KG reads, etc.
 *
 * Specialists must NOT close over their context across ticks; the
 * orchestrator passes a fresh snapshot each call.
 */
export interface SpecialistContext {
  readonly blackboard: Readonly<Blackboard>;
  readonly tick: number;
  readonly trace_id: string;
  /**
   * Cooperative cancellation. Specialists must check `signal.aborted`
   * at any point that can take longer than 250ms.
   */
  readonly signal: AbortSignal;
}

/**
 * Specialist — the unit of work. Every cognitive function is a specialist.
 *
 * Specialists are pure (modulo network I/O for ML calls): same context →
 * same result, modulo non-determinism in the underlying models which is
 * controlled via seeding where supported.
 */
export interface Specialist {
  readonly id: string;
  /** Human-readable. Used in audit trails and traces. */
  readonly display_name: string;
  /**
   * Brain-region tag — see PRD §2.1.
   * @example "DLPFC", "Wernicke's", "ACC"
   */
  readonly brain_region: string;
  /**
   * Goal kinds this specialist is competent for. The attention scheduler
   * uses this to filter candidate specialists per goal.
   */
  readonly handles_goal_kinds: readonly string[];
  /**
   * Estimated cost (USD) for one invocation. Used by the EV ranker.
   * Real cost is recorded after the call.
   */
  readonly estimated_cost_usd: number;
  /** Estimated wall-clock for one invocation, milliseconds. */
  readonly estimated_latency_ms: number;
  /**
   * One tick. Returns the patch to apply, or throws on irrecoverable error.
   * Cooperative cancellation via `ctx.signal`.
   */
  run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult>;
}

/**
 * EventListener — subscribed monitor or specialist that reacts to writes.
 *
 * Listeners filter by `path_glob` (a simple `*`-glob over dot-paths).
 * Multiple listeners may match the same write; ordering is undefined.
 */
export interface EventListener {
  readonly id: string;
  readonly path_glob: string;
  readonly listener_kind: "monitor" | "specialist_trigger" | "telemetry";
  on_event(event: BlackboardEvent): Promise<void> | void;
}

/**
 * Trace event surfaced to the user-facing reasoning trace UI.
 * A subset of internal audit data, suitable for streaming over SSE.
 */
export interface TraceEvent {
  seq: number;
  timestamp: string;
  specialist: string;
  brain_region: string;
  micro_stage?: string;
  justification?: string;
  cost_usd: number;
  latency_ms: number;
  writes_count: number;
  conflicts_count: number;
}
