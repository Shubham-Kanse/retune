/**
 * In-process trace bus.
 *
 * One bus per generation. The orchestrator calls `publish()` with each
 * trace event; the SSE stream subscribes via `subscribe()`. When the
 * generation completes the bus calls `close()`, which resolves any
 * pending `next()` calls with `{done: true}`.
 *
 * Commit #3 replaces this with a Redis pub/sub + Postgres-backed durable
 * log so traces survive server restarts and clients can replay from any
 * seq.
 */

import type { TraceEvent } from "@retune/agent";
import type { Blackboard } from "@retune/types";

export type TraceFrame =
  | { kind: "trace"; event: TraceEvent }
  | { kind: "done"; summary: TraceDoneSummary }
  | { kind: "error"; message: string };

export interface TraceDoneSummary {
  termination: string;
  ticks_executed: number;
  total_cost_usd: number;
  total_latency_ms: number;
}

/**
 * Per-subscriber inbox. Each call to `subscribe()` allocates a fresh
 * inbox so multiple consumers (the SSE stream + the SseNarrator) can
 * each see every frame instead of competing for them.
 */
interface Inbox {
  buffer: TraceFrame[];
  waiter: ((frame: TraceFrame | null) => void) | null;
  closed: boolean;
}

export class TraceBus {
  private inboxes: Set<Inbox> = new Set();
  private closed = false;
  /**
   * Final blackboard snapshot populated by the workbench-runtime after the
   * orchestrator returns. Read by `GET /generate/:id` when persistence is
   * not configured. Cleared when the registry GCs the bus.
   */
  private final_blackboard: Blackboard | null = null;
  /** Done summary, captured for late readers after the SSE has finished. */
  private done_summary: TraceDoneSummary | null = null;
  /** Replayable trace events (kept for late SSE replay + audit screen). */
  private trace_log: TraceEvent[] = [];
  /** All frames ever published — replayed verbatim to late subscribers. */
  private replay_log: TraceFrame[] = [];
  /** AbortController wired into the orchestrator's external_signal. */
  private readonly abort_controller = new AbortController();

  /** The signal to pass to run_generation as external_signal. */
  get signal(): AbortSignal {
    return this.abort_controller.signal;
  }

  /** Abort the running generation. Safe to call multiple times. */
  abort(): void {
    this.abort_controller.abort();
  }

  set_final_blackboard(snapshot: Blackboard): void {
    this.final_blackboard = snapshot;
  }

  get_final_blackboard(): Blackboard | null {
    return this.final_blackboard;
  }

  get_done_summary(): TraceDoneSummary | null {
    return this.done_summary;
  }

  get_trace_log(): readonly TraceEvent[] {
    return this.trace_log;
  }

  /**
   * Fan-out publish: every active subscriber inbox receives the frame
   * (either via its waiter or its private buffer). Late subscribers
   * (those that call `subscribe()` after `publish()`) are served from
   * `replay_log` so they don't miss earlier traces.
   */
  publish(frame: TraceFrame): void {
    if (this.closed) return;
    if (frame.kind === "trace") {
      this.trace_log.push(frame.event);
    } else if (frame.kind === "done") {
      this.done_summary = frame.summary;
      this.closed = true;
    } else if (frame.kind === "error") {
      this.closed = true;
    }
    this.replay_log.push(frame);
    for (const inbox of this.inboxes) {
      if (inbox.closed) continue;
      if (inbox.waiter) {
        const w = inbox.waiter;
        inbox.waiter = null;
        w(frame);
      } else {
        inbox.buffer.push(frame);
      }
    }
  }

  async *subscribe(): AsyncGenerator<TraceFrame> {
    // Snapshot the replay log before installing the inbox so a publish
    // that happens between snapshot + install can't be missed.
    const replay = [...this.replay_log];
    const inbox: Inbox = { buffer: [], waiter: null, closed: false };
    this.inboxes.add(inbox);
    try {
      // Drain replay first so this subscriber doesn't miss earlier frames.
      for (const frame of replay) {
        yield frame;
        if (frame.kind === "done" || frame.kind === "error") return;
      }
      // The bus may have closed while we were yielding the replay.
      if (this.closed && inbox.buffer.length === 0) return;

      while (true) {
        if (inbox.buffer.length > 0) {
          const frame = inbox.buffer.shift();
          if (!frame) continue;
          yield frame;
          if (frame.kind === "done" || frame.kind === "error") return;
          continue;
        }
        if (this.closed) return;
        const frame = await new Promise<TraceFrame | null>((resolve) => {
          inbox.waiter = resolve;
        });
        if (frame === null) return;
        yield frame;
        if (frame.kind === "done" || frame.kind === "error") return;
      }
    } finally {
      inbox.closed = true;
      this.inboxes.delete(inbox);
      // Defensive: if anyone happens to hold a reference to the waiter,
      // resolve it with null so they don't dangle.
      if (inbox.waiter) {
        const w = inbox.waiter;
        inbox.waiter = null;
        w(null);
      }
    }
  }
}

/**
 * Per-process registry keyed by generation_id. Commit #3 moves this
 * into Redis so SSE can fan out across multiple API instances.
 */
export class TraceBusRegistry {
  private readonly buses = new Map<string, TraceBus>();

  create(generation_id: string): TraceBus {
    if (this.buses.has(generation_id)) {
      throw new Error(`trace bus for ${generation_id} already exists`);
    }
    const bus = new TraceBus();
    this.buses.set(generation_id, bus);
    return bus;
  }

  get(generation_id: string): TraceBus | undefined {
    return this.buses.get(generation_id);
  }

  list_active(): string[] {
    return Array.from(this.buses.keys());
  }

  /** Abort the running generation and remove it from the registry. */
  abort(generation_id: string): boolean {
    const bus = this.buses.get(generation_id);
    if (!bus) return false;
    bus.abort();
    return true;
  }

  delete_after(generation_id: string, ms: number): void {
    setTimeout(() => this.buses.delete(generation_id), ms).unref?.();
  }
}
