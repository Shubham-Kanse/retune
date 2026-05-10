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

import type { TraceEvent } from "./types";

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

export class TraceBus {
  private buffer: TraceFrame[] = [];
  private waiters: Array<(frame: TraceFrame | null) => void> = [];
  private closed = false;

  publish(frame: TraceFrame): void {
    if (this.closed) return;
    if (frame.kind === "done" || frame.kind === "error") {
      this.closed = true;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(frame);
    } else {
      this.buffer.push(frame);
    }
    if (this.closed) {
      // Resolve any remaining waiters with null to close their iterators.
      while (this.waiters.length > 0) {
        const w = this.waiters.shift();
        w?.(null);
      }
    }
  }

  async *subscribe(): AsyncGenerator<TraceFrame> {
    while (true) {
      if (this.buffer.length > 0) {
        const frame = this.buffer.shift();
        if (!frame) continue;
        yield frame;
        if (frame.kind === "done" || frame.kind === "error") return;
        continue;
      }
      if (this.closed) return;
      const frame = await new Promise<TraceFrame | null>((resolve) => {
        this.waiters.push(resolve);
      });
      if (frame === null) return;
      yield frame;
      if (frame.kind === "done" || frame.kind === "error") return;
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

  delete_after(generation_id: string, ms: number): void {
    setTimeout(() => this.buses.delete(generation_id), ms).unref?.();
  }
}
