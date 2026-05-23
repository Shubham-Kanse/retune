# Epic 02 — SSE Reconnection

## Summary

The SSE stream between `apps/web` and `apps/api` has no reconnection support. If the connection drops (network blip, Vercel cold start, client sleep/wake), the client loses all subsequent trace events with no way to recover. This epic adds event sequencing, server-side replay from a ring buffer, and client-side exponential backoff reconnection.

## Goal

SSE clients automatically reconnect after disconnects and receive all missed events without user intervention. After 5 failed attempts, the UI shows an actionable error state.

---

## Story 1: Add Event Sequence IDs to SSE Stream

### User Story

As a **frontend client**, I want every SSE event to have a unique sequential `id` field so that I can track my position in the event stream and request replay from a specific point.

### Acceptance Criteria

- [ ] Every SSE event emitted by `stream.ts` includes an `id:` field
- [ ] The `id` is a monotonically increasing integer starting from 1 per generation stream
- [ ] The `id` is derived from the trace event's sequence number (or assigned if missing)
- [ ] Events are formatted as: `id: <seq>\nevent: <type>\ndata: <json>\n\n`

### Tasks

#### Task 1.1: Update SSE event formatting in `stream.ts`

**File:** `apps/api/src/routes/stream.ts`

Update the event writing logic to include the `id` field:

```typescript
function formatSSE(event: TraceEvent, seq: number): string {
  return `id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
```

In the stream handler, maintain a sequence counter:

```typescript
let seq = 0;

traceBus.on('event', (event: TraceEvent) => {
  seq++;
  const formatted = formatSSE(event, seq);
  controller.enqueue(encoder.encode(formatted));
});
```

**Subtasks:**
- Create `formatSSE` helper function — **5 min**
- Add sequence counter to stream handler — **5 min**
- Verify existing event types still parse correctly on client — **10 min**

---

## Story 2: Add Ring Buffer to TraceBus

### User Story

As a **server**, I want to retain the last 100 events per generation in a ring buffer so that I can replay missed events to reconnecting clients.

### Acceptance Criteria

- [ ] `TraceBus` stores the last 100 events in a ring buffer
- [ ] Each stored event includes its sequence number
- [ ] `traceBus.getEventsAfter(seq)` returns all events with sequence > `seq`
- [ ] When the buffer is full, the oldest event is overwritten
- [ ] Buffer is cleared when the generation completes

### Tasks

#### Task 2.1: Add ring buffer to `TraceBus`

**File:** `apps/api/src/lib/trace-bus.ts`

```typescript
interface SequencedEvent {
  seq: number;
  event: TraceEvent;
}

export class TraceBus {
  private ringBuffer: SequencedEvent[] = [];
  private readonly bufferSize = 100;
  private seq = 0;

  emit(event: TraceEvent) {
    this.seq++;
    const entry: SequencedEvent = { seq: this.seq, event };

    if (this.ringBuffer.length >= this.bufferSize) {
      this.ringBuffer.shift();
    }
    this.ringBuffer.push(entry);

    // ... existing emit logic to listeners
  }

  getEventsAfter(lastSeq: number): SequencedEvent[] {
    return this.ringBuffer.filter(e => e.seq > lastSeq);
  }

  getCurrentSeq(): number {
    return this.seq;
  }
}
```

**Subtasks:**
- Add `SequencedEvent` interface — **2 min**
- Add `ringBuffer` array and `seq` counter to `TraceBus` — **5 min**
- Implement ring buffer push with size limit — **10 min**
- Implement `getEventsAfter(seq)` method — **10 min**
- Add `getCurrentSeq()` accessor — **2 min**

---

## Story 3: Support `Last-Event-ID` Replay on Server

### User Story

As a **reconnecting client**, I want to send `Last-Event-ID` in my reconnection request so that the server replays all events I missed.

### Acceptance Criteria

- [ ] `stream.ts` reads the `Last-Event-ID` header from the request
- [ ] When `Last-Event-ID` is present, the server replays all buffered events with seq > `Last-Event-ID` before streaming live events
- [ ] Replayed events have the same `id` field as when originally sent
- [ ] If `Last-Event-ID` is older than the ring buffer's oldest entry, the server sends a `reset` event telling the client to refetch full state
- [ ] If `Last-Event-ID` is not present, streaming starts from the current position (existing behavior)

### Tasks

#### Task 3.1: Read `Last-Event-ID` and replay from ring buffer

**File:** `apps/api/src/routes/stream.ts`

```typescript
app.get('/generate/:id/stream', async (c) => {
  const generationId = c.req.param('id');
  const lastEventId = c.req.header('Last-Event-ID');
  const traceBus = traceBusRegistry.get(generationId);

  if (!traceBus) {
    return c.json({ error: 'Generation not found' }, 404);
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Replay missed events if reconnecting
      if (lastEventId) {
        const lastSeq = parseInt(lastEventId, 10);
        const missedEvents = traceBus.getEventsAfter(lastSeq);

        if (missedEvents.length === 0 && lastSeq < traceBus.getOldestSeq()) {
          // Client is too far behind — send reset
          controller.enqueue(encoder.encode(`event: reset\ndata: {}\n\n`));
        } else {
          for (const { seq, event } of missedEvents) {
            controller.enqueue(encoder.encode(formatSSE(event, seq)));
          }
        }
      }

      // Stream live events
      const listener = (event: TraceEvent, seq: number) => {
        controller.enqueue(encoder.encode(formatSSE(event, seq)));
      };
      traceBus.on('event', listener);

      // Cleanup on close
      c.req.raw.signal.addEventListener('abort', () => {
        traceBus.off('event', listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});
```

**Subtasks:**
- Read `Last-Event-ID` header — **5 min**
- Call `traceBus.getEventsAfter()` for replay — **10 min**
- Add `getOldestSeq()` method to TraceBus — **5 min**
- Send `reset` event when client is too far behind — **10 min**
- Ensure live events don't duplicate replayed events — **10 min**

#### Task 3.2: Add `getOldestSeq()` to TraceBus

**File:** `apps/api/src/lib/trace-bus.ts`

```typescript
getOldestSeq(): number {
  return this.ringBuffer.length > 0 ? this.ringBuffer[0].seq : 0;
}
```

**Subtasks:**
- Add method — **2 min**

---

## Story 4: Client-Side Reconnection with Exponential Backoff

### User Story

As a **user**, I want the generation stream to automatically reconnect if my connection drops so that I don't lose visibility into my generation progress.

### Acceptance Criteria

- [ ] On connection close (non-terminal), the client waits then reconnects
- [ ] Backoff schedule: 1s, 2s, 4s, 8s, 16s, 30s (capped at 30s)
- [ ] Reconnection request includes `Last-Event-ID` header with the last received event ID
- [ ] On successful reconnection, backoff resets to 1s
- [ ] After 5 consecutive failed reconnection attempts, the client stops and emits an error event
- [ ] The UI shows an error state with a "Retry" button after 5 failures

### Tasks

#### Task 4.1: Add reconnection logic to `stream-client.ts`

**File:** `apps/web/src/lib/sse/stream-client.ts`

```typescript
export class StreamClient {
  private lastEventId: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private abortController: AbortController | null = null;

  async connect(generationId: string, onEvent: (event: TraceEvent) => void, onError: (error: Error) => void) {
    this.abortController = new AbortController();
    await this._connect(generationId, onEvent, onError);
  }

  private async _connect(generationId: string, onEvent: (event: TraceEvent) => void, onError: (error: Error) => void) {
    try {
      const headers: Record<string, string> = {};
      if (this.lastEventId) {
        headers['Last-Event-ID'] = this.lastEventId;
      }

      const response = await fetch(`/api/generate/${generationId}/stream`, {
        headers,
        signal: this.abortController?.signal,
      });

      if (!response.ok) throw new Error(`Stream failed: ${response.status}`);

      // Reset backoff on successful connection
      this.reconnectAttempts = 0;

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = this.parseSSE(buffer);
        buffer = events.remainder;

        for (const event of events.parsed) {
          if (event.id) this.lastEventId = event.id;
          onEvent(event.data);
        }
      }

      // Stream ended cleanly (generation complete) — don't reconnect
    } catch (err) {
      if (this.abortController?.signal.aborted) return; // Intentional disconnect

      this.reconnectAttempts++;
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        onError(new Error('Max reconnection attempts exceeded'));
        return;
      }

      const delay = Math.min(this.baseDelay * 2 ** (this.reconnectAttempts - 1), this.maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
      await this._connect(generationId, onEvent, onError);
    }
  }

  disconnect() {
    this.abortController?.abort();
  }

  private parseSSE(buffer: string): { parsed: Array<{ id: string | null; data: TraceEvent }>; remainder: string } {
    const events: Array<{ id: string | null; data: TraceEvent }> = [];
    const parts = buffer.split('\n\n');
    const remainder = parts.pop() || '';

    for (const part of parts) {
      let id: string | null = null;
      let data = '';

      for (const line of part.split('\n')) {
        if (line.startsWith('id: ')) id = line.slice(4);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }

      if (data) {
        events.push({ id, data: JSON.parse(data) });
      }
    }

    return { parsed: events, remainder };
  }
}
```

**Subtasks:**
- Add `lastEventId` tracking — **5 min**
- Add `Last-Event-ID` header to reconnection requests — **5 min**
- Implement exponential backoff with cap — **15 min**
- Add max attempts check and error emission — **10 min**
- Implement SSE parser that extracts `id` field — **15 min**
- Handle clean stream end (no reconnect) vs error (reconnect) — **10 min**

#### Task 4.2: Add error state UI

**File:** `apps/web/src/components/generation/stream-error.tsx`

```typescript
'use client';

interface StreamErrorProps {
  onRetry: () => void;
}

export function StreamError({ onRetry }: StreamErrorProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
      <p className="text-sm text-destructive font-medium">
        Connection lost. Unable to reconnect after multiple attempts.
      </p>
      <button
        onClick={onRetry}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Retry Connection
      </button>
    </div>
  );
}
```

**Subtasks:**
- Create `StreamError` component — **10 min**
- Wire into generation stream view — **10 min**
- Add `role="alert"` for accessibility — **2 min**

---

## Story 5: Integration Test — SSE Reconnection

### User Story

As a **developer**, I want a test that proves SSE reconnection works end-to-end so that I have confidence the replay mechanism is correct.

### Acceptance Criteria

- [ ] Test starts an SSE stream and receives events 1–50
- [ ] Test simulates a disconnect at event 50
- [ ] Test reconnects with `Last-Event-ID: 50`
- [ ] Test verifies events 51+ are received without gaps
- [ ] Test verifies no duplicate events are received

### Tasks

#### Task 5.1: Write SSE reconnection integration test

**File:** `apps/api/src/routes/__tests__/stream-reconnection.test.ts`

```typescript
import { describe, it, before, after, assert } from 'node:test';
import { TraceBus } from '../../lib/trace-bus';
import { TraceBusRegistry } from '../../lib/trace-bus';

describe('SSE Reconnection', () => {
  let traceBus: TraceBus;
  const generationId = 'test-gen-sse-001';

  before(() => {
    traceBus = TraceBusRegistry.create(generationId);
  });

  after(() => {
    TraceBusRegistry.remove(generationId);
  });

  it('replays missed events after reconnection', async () => {
    // Emit 100 events
    for (let i = 1; i <= 100; i++) {
      traceBus.emit({ type: 'trace', seq: i, data: { step: i } });
    }

    // Simulate reconnection at event 50
    const missedEvents = traceBus.getEventsAfter(50);

    // Verify events 51-100 are returned
    assert.strictEqual(missedEvents.length, 50);
    assert.strictEqual(missedEvents[0].seq, 51);
    assert.strictEqual(missedEvents[49].seq, 100);

    // Verify no duplicates
    const seqs = missedEvents.map(e => e.seq);
    const uniqueSeqs = [...new Set(seqs)];
    assert.strictEqual(seqs.length, uniqueSeqs.length, 'No duplicate events');
  });

  it('returns empty array when client is caught up', async () => {
    const events = traceBus.getEventsAfter(traceBus.getCurrentSeq());
    assert.strictEqual(events.length, 0);
  });

  it('ring buffer evicts oldest events beyond capacity', async () => {
    const bus = TraceBusRegistry.create('test-eviction');

    // Emit 150 events (buffer holds 100)
    for (let i = 1; i <= 150; i++) {
      bus.emit({ type: 'trace', seq: i, data: { step: i } });
    }

    // Oldest available should be 51
    assert.strictEqual(bus.getOldestSeq(), 51);

    // Requesting events after seq 30 should indicate client is too far behind
    const events = bus.getEventsAfter(30);
    // All 100 buffered events are returned (51-150)
    assert.strictEqual(events.length, 100);
    assert.strictEqual(events[0].seq, 51);

    TraceBusRegistry.remove('test-eviction');
  });
});
```

**Subtasks:**
- Write test for replay after disconnect — **15 min**
- Write test for caught-up client — **5 min**
- Write test for ring buffer eviction — **10 min**
- Verify all tests pass with `tsx --test` — **5 min**

#### Task 5.2: Write client reconnection unit test

**File:** `apps/web/src/lib/sse/__tests__/stream-client.test.ts`

```typescript
import { describe, it, mock, assert } from 'node:test';
import { StreamClient } from '../stream-client';

describe('StreamClient reconnection', () => {
  it('sends Last-Event-ID header on reconnection', async () => {
    const client = new StreamClient();
    const fetchMock = mock.fn(async (url: string, opts: RequestInit) => {
      const headers = opts.headers as Record<string, string>;

      if (!headers['Last-Event-ID']) {
        // First connection: return 3 events then close
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('id: 1\nevent: trace\ndata: {"step":1}\n\n'));
            controller.enqueue(new TextEncoder().encode('id: 2\nevent: trace\ndata: {"step":2}\n\n'));
            controller.enqueue(new TextEncoder().encode('id: 3\nevent: trace\ndata: {"step":3}\n\n'));
            // Simulate error close
            controller.error(new Error('Connection reset'));
          },
        });
        return new Response(body, { status: 200 });
      }

      // Reconnection: verify Last-Event-ID
      assert.strictEqual(headers['Last-Event-ID'], '3');

      // Return remaining events and close cleanly
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('id: 4\nevent: trace\ndata: {"step":4}\n\n'));
          controller.enqueue(new TextEncoder().encode('id: 5\nevent: trace\ndata: {"step":5}\n\n'));
          controller.close();
        },
      });
      return new Response(body, { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const events: any[] = [];
    await client.connect('gen-1', (event) => events.push(event), () => {});

    assert.strictEqual(events.length, 5);
    assert.deepStrictEqual(events.map(e => e.step), [1, 2, 3, 4, 5]);
  });

  it('stops after 5 failed reconnection attempts', async () => {
    const client = new StreamClient();
    let attempts = 0;

    globalThis.fetch = mock.fn(async () => {
      attempts++;
      throw new Error('Network error');
    });

    let errorReceived: Error | null = null;
    await client.connect('gen-1', () => {}, (err) => { errorReceived = err; });

    // 1 initial + 5 retries = 6 total attempts
    assert.strictEqual(attempts, 6);
    assert.ok(errorReceived);
    assert.ok(errorReceived!.message.includes('Max reconnection attempts'));
  });
});
```

**Subtasks:**
- Mock `fetch` for first connection and reconnection — **15 min**
- Assert `Last-Event-ID` header is sent — **5 min**
- Assert all events received without gaps — **5 min**
- Write max-attempts failure test — **10 min**
- Verify tests pass — **5 min**

### Test Assertions Summary

| Test | Assertion |
|------|-----------|
| Replay after disconnect | `missedEvents.length === 50`, first seq is 51 |
| No duplicates | `seqs.length === uniqueSeqs.length` |
| Ring buffer eviction | `getOldestSeq() === 51` after 150 events |
| Client sends Last-Event-ID | Header equals last received ID |
| Client receives all events | Events array is `[1, 2, 3, 4, 5]` in order |
| Max attempts exceeded | Error emitted after 6 total fetch calls |

---

## Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: Event sequence IDs | 0.5 day |
| Story 2: Ring buffer | 0.5 day |
| Story 3: Last-Event-ID replay | 1 day |
| Story 4: Client reconnection | 1 day |
| Story 5: Integration tests | 0.5 day |
| **Total** | **3.5 days** |


---

## Architect addendum (2026-05-22)

Verified server-side state in `apps/api/src/lib/trace-bus.ts`: the bus already keeps a `replay_log: TraceFrame[]` and an `inbox` per subscriber. On `subscribe()` (line 122), the replay log is drained verbatim before live frames. **The bug is that there is no Last-Event-ID parsing — every reconnect replays from seq 0, double-delivering early ticks.**

The fix is server-side. The intern's draft handles client-side reconnection well; the missing piece is:

### Server-side `Last-Event-ID` handling

In `apps/api/src/routes/stream.ts`, parse the `Last-Event-ID` header on the SSE request and pass it to a new `bus.subscribe(fromSeq?: number)` overload.

```typescript
// stream.ts
const lastEventId = c.req.header("last-event-id");
const fromSeq = lastEventId ? Number(lastEventId) : 0;

for await (const frame of bus.subscribe(fromSeq)) {
  // ...
}
```

```typescript
// trace-bus.ts subscribe(fromSeq?: number)
async *subscribe(fromSeq = 0): AsyncGenerator<TraceFrame> {
  const replay = this.replay_log.filter((f) =>
    f.kind === "trace" ? f.event.seq > fromSeq : true,
  );
  // existing logic, but iterate `replay` instead of `[...this.replay_log]`
}
```

Each emitted SSE event already has its `id: String(frame.event.seq)` set (verified `stream.ts:79`), so the browser's native `EventSource` populates `Last-Event-ID` on auto-reconnect for free.

### Add a TraceBus tombstone

When `delete_after(generation_id, 10*60*1000)` GCs a bus, replace it with a tombstone marker so reconnects to a stale generation_id receive a deterministic `generation_expired` SSE event instead of `404`. UX becomes "your session expired, please re-open the result page" — actionable instead of confusing.

### Verification

- Integration test: subscribe, receive seq 0–10, drop connection, reconnect with `Last-Event-ID: 7`, receive seq 8 onwards (no duplicate 0–7).
- Integration test: subscribe to a GC'd bus → receive `generation_expired` event, not 404.
