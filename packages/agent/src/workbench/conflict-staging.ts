/**
 * ConflictStagingQueue — architectural bridge between async listeners and
 * the transactional orchestrator tick loop.
 *
 * Problem: Trigger-bus listeners (FairnessMonitor, VoiceDriftMonitor) fire
 * asynchronously on every matching write. They cannot mutate the blackboard
 * directly because writes must be transactional (atomic per tick). They also
 * cannot push goals or conflicts because the orchestrator owns that state.
 *
 * Solution: Listeners emit concerns into this queue. The orchestrator drains
 * the queue at the START of each tick, converting staged items into proper
 * ConflictRecord rows + resolve_conflict goals.
 *
 * This pattern (commit #11) replaces the direct-to-trace-bus forwarding
 * that FairnessMonitor used in commit #8.
 *
 * Thread safety: Single-writer (listeners push), single-reader (orchestrator
 * drains). No concurrent access in the Node single-threaded model, but the
 * API is designed defensively for future worker scenarios.
 *
 * @brain anterior cingulate cortex: conflict buffering + priority routing
 */

import { randomUUID } from "node:crypto";
import type { ConflictMonitor, ConflictSeverity } from "@retune/types";

// ──────────── Staged item ────────────

export interface StagedConflict {
  id: string;
  monitor: ConflictMonitor;
  severity: ConflictSeverity;
  payload: Record<string, unknown>;
  emitted_by: string;
  staged_at: string;
}

// ──────────── Queue ────────────

export class ConflictStagingQueue {
  private readonly queue: StagedConflict[] = [];
  private readonly max_size: number;
  private total_staged = 0;
  private total_drained = 0;
  private total_dropped = 0;

  constructor(opts?: { max_size?: number }) {
    this.max_size = opts?.max_size ?? 64;
  }

  /**
   * Stage a conflict for the orchestrator to drain on the next tick.
   * Called by trigger-bus listeners (async, non-transactional context).
   *
   * Returns the staged item's ID, or null if the queue is full (back-pressure).
   */
  stage(input: {
    monitor: ConflictMonitor;
    severity: ConflictSeverity;
    payload: Record<string, unknown>;
    emitted_by: string;
  }): string | null {
    if (this.queue.length >= this.max_size) {
      this.total_dropped++;
      return null;
    }

    const item: StagedConflict = {
      id: randomUUID(),
      monitor: input.monitor,
      severity: input.severity,
      payload: input.payload,
      emitted_by: input.emitted_by,
      staged_at: new Date().toISOString(),
    };

    this.queue.push(item);
    this.total_staged++;
    return item.id;
  }

  /**
   * Drain all staged conflicts. Called by the orchestrator at tick-start.
   * Returns the items and clears the queue atomically.
   */
  drain(): StagedConflict[] {
    if (this.queue.length === 0) return [];
    const items = this.queue.splice(0);
    this.total_drained += items.length;
    return items;
  }

  /** Number of items currently waiting. */
  pending(): number {
    return this.queue.length;
  }

  /** Diagnostic statistics. */
  stats(): { total_staged: number; total_drained: number; total_dropped: number; pending: number } {
    return {
      total_staged: this.total_staged,
      total_drained: this.total_drained,
      total_dropped: this.total_dropped,
      pending: this.queue.length,
    };
  }

  /** Reset (for testing). */
  reset(): void {
    this.queue.length = 0;
    this.total_staged = 0;
    this.total_drained = 0;
    this.total_dropped = 0;
  }
}
