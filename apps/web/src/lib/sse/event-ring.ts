/**
 * Ring buffer for pipeline events.
 *
 * Bounded in-memory store that keeps the last N events per generation.
 * Supports Last-Event-ID resume by returning events with seq > lastSeq.
 */

import type { PipelineEvent } from "./events";

const DEFAULT_CAPACITY = 512;

export class EventRing {
  private readonly buffer: PipelineEvent[];
  private readonly capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(event: PipelineEvent): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  all(): PipelineEvent[] {
    if (this.count === 0) return [];
    if (this.count < this.capacity) {
      return this.buffer.slice(0, this.count);
    }
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }

  since(lastSeq: number): PipelineEvent[] {
    return this.all().filter((e) => e.seq > lastSeq);
  }

  latest(): PipelineEvent | null {
    if (this.count === 0) return null;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[idx]!;
  }

  size(): number {
    return this.count;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }
}
