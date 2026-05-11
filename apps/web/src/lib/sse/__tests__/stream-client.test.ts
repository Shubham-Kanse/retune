import { describe, expect, it, vi } from "vitest";
import { StreamClient } from "../stream-client";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(ev: MessageEvent) => void>>();
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (ev: MessageEvent) => void) {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, payload: Record<string, unknown>) {
    const ev = { data: JSON.stringify(payload) } as MessageEvent;
    for (const cb of this.listeners.get(type) ?? []) cb(ev);
  }
}

describe("StreamClient completion semantics", () => {
  it("treats completion as authoritative terminal event", () => {
    const onEvent = vi.fn();
    const onClose = vi.fn();

    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    const client = new StreamClient({
      url: "/api/generate/x/stream",
      onEvent,
      onClose,
    });
    client.connect();

    const es = FakeEventSource.instances.at(-1);
    if (!es) throw new Error("expected EventSource instance");

    es.emit("completion", {
      id: "evt-1",
      seq: 1,
      status: "completed",
      termination: "no_open_work",
      ticks_executed: 10,
      total_cost_usd: 0.01,
      total_latency_ms: 1200,
      error_message: null,
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]?.type).toBe("completion");
    expect(es.closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("closes on failed completion terminal event", () => {
    const onEvent = vi.fn();
    const onClose = vi.fn();

    vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource);
    const client = new StreamClient({
      url: "/api/generate/x/stream",
      onEvent,
      onClose,
    });
    client.connect();

    const es = FakeEventSource.instances.at(-1);
    if (!es) throw new Error("expected EventSource instance");

    es.emit("completion", {
      id: "evt-2",
      seq: 2,
      status: "failed",
      termination: "error",
      ticks_executed: 4,
      total_cost_usd: 0.004,
      total_latency_ms: 900,
      error_message: "boom",
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]?.type).toBe("completion");
    expect(es.closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});

