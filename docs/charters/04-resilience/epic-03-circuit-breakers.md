# Epic 03 — Circuit Breakers

## Summary

External service calls (OpenAI, Anthropic, ML service) have no failure isolation. A single provider outage causes cascading failures across all generations. The `_ml_reachable` flag in `workbench-runtime.ts` is set once at startup and never re-probed, meaning a transient ML outage permanently disables ML features until the API restarts. Additionally, `TraceBusRegistry` holds entries indefinitely, leaking memory.

## Goal

External service failures are isolated via circuit breakers that open on repeated failures, allow half-open probes after a timeout, and close on recovery. Memory leaks in `TraceBusRegistry` are eliminated via TTL-based eviction.

---

## Story 1: Create Circuit Breaker Utility

### User Story

As a **developer**, I want a reusable circuit breaker class so that I can wrap any external service call with failure isolation without duplicating logic.

### Acceptance Criteria

- [ ] `CircuitBreaker` class exists at `packages/agent/src/lib/circuit-breaker.ts`
- [ ] Three states: `closed` (normal), `open` (failing, reject immediately), `half-open` (probe one request)
- [ ] Opens after `threshold` consecutive failures (default: 5)
- [ ] Stays open for `timeout` ms (default: 60000) then transitions to `half-open`
- [ ] In `half-open`, one request is allowed through: success → `closed`, failure → `open`
- [ ] When open, `execute()` throws `CircuitOpenError` without calling the wrapped function
- [ ] Exposes `getState()` for observability

### Tasks

#### Task 1.1: Implement `CircuitBreaker`

**File:** `packages/agent/src/lib/circuit-breaker.ts`

```typescript
export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is open`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly name: string,
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'half-open';
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open' || this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

**Subtasks:**
- Create file with `CircuitBreaker` class — **15 min**
- Implement state transitions: closed → open → half-open → closed — **20 min**
- Create `CircuitOpenError` class — **5 min**
- Add `getState()` accessor — **2 min**
- Export from package index — **5 min**

---

## Story 2: Wrap AI Provider Calls with Circuit Breakers

### User Story

As a **system**, I want AI provider calls wrapped with circuit breakers so that one provider's outage doesn't block generations that could use the other provider.

### Acceptance Criteria

- [ ] One circuit breaker instance per AI provider (`openai-circuit`, `anthropic-circuit`)
- [ ] When a provider's circuit is open, the call fails fast with `CircuitOpenError`
- [ ] Circuit breaker is applied at the provider adapter level (wraps the actual API call)
- [ ] Existing retry logic (if any) operates inside the circuit breaker (retries count as one attempt from the breaker's perspective)
- [ ] Circuit state is logged when it transitions

### Tasks

#### Task 2.1: Create provider circuit breaker instances

**File:** `packages/agent/src/lib/provider-circuits.ts`

```typescript
import { CircuitBreaker } from './circuit-breaker';

export const openaiCircuit = new CircuitBreaker('openai', 5, 60000);
export const anthropicCircuit = new CircuitBreaker('anthropic', 5, 60000);

export function getProviderCircuit(provider: 'openai' | 'anthropic'): CircuitBreaker {
  return provider === 'openai' ? openaiCircuit : anthropicCircuit;
}
```

**Subtasks:**
- Create singleton circuit breaker instances — **5 min**
- Export accessor function — **5 min**

#### Task 2.2: Wrap provider calls

**File:** `packages/agent/src/specialists/llm-call.ts` (or equivalent provider adapter)

Locate the function that makes the actual LLM API call and wrap it:

```typescript
import { getProviderCircuit } from '../lib/provider-circuits';

export async function callLLM(provider: 'openai' | 'anthropic', messages: Message[]): Promise<LLMResponse> {
  const circuit = getProviderCircuit(provider);

  return circuit.execute(async () => {
    // Existing LLM call logic
    const response = await providerClient.chat(messages);
    return response;
  });
}
```

**Subtasks:**
- Identify the LLM call site(s) in the codebase — **10 min**
- Import and wrap with circuit breaker — **15 min**
- Add logging on state transitions — **10 min**
- Verify existing error handling still works — **10 min**

---

## Story 3: Replace `_ml_reachable` with Circuit Breaker

### User Story

As a **system**, I want the ML service reachability check to use a circuit breaker so that transient ML outages self-heal without requiring an API restart.

### Acceptance Criteria

- [ ] The `_ml_reachable` boolean in `workbench-runtime.ts` is removed
- [ ] A circuit breaker (`ml-service`) replaces it with threshold=3, timeout=60000
- [ ] ML calls go through the circuit breaker's `execute()` method
- [ ] When the circuit is open, ML features are skipped gracefully (same behavior as `_ml_reachable = false`)
- [ ] When the circuit transitions to half-open (after 60s), one ML call is attempted
- [ ] On success, ML features are re-enabled (circuit closes)

### Tasks

#### Task 3.1: Create ML circuit breaker and replace `_ml_reachable`

**File:** `apps/api/src/runtime/workbench-runtime.ts`

Remove:
```typescript
// DELETE THIS
private _ml_reachable: boolean;
// DELETE the one-time probe in constructor
```

Replace with:

```typescript
import { CircuitBreaker, CircuitOpenError } from '@retune/agent/lib/circuit-breaker';

const mlCircuit = new CircuitBreaker('ml-service', 3, 60000);

// In the method that calls ML:
async function callMLService(input: MLInput): Promise<MLOutput | null> {
  try {
    return await mlCircuit.execute(async () => {
      const response = await fetch(`${ML_BASE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(`ML service returned ${response.status}`);
      return response.json();
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // ML service is down — skip gracefully
      return null;
    }
    throw err;
  }
}
```

**Subtasks:**
- Remove `_ml_reachable` field and one-time probe — **5 min**
- Create `mlCircuit` instance with threshold=3, timeout=60000 — **5 min**
- Wrap ML calls with `mlCircuit.execute()` — **15 min**
- Handle `CircuitOpenError` gracefully (return null / skip) — **10 min**
- Verify ML-dependent code handles null return — **10 min**

---

## Story 4: Add TTL Eviction to TraceBusRegistry

### User Story

As a **platform operator**, I want `TraceBusRegistry` entries to be automatically evicted after 10 minutes so that the API server doesn't leak memory from completed generations.

### Acceptance Criteria

- [ ] Each `TraceBus` entry in the registry has a `createdAt` timestamp
- [ ] A sweep runs every 5 minutes via `setInterval`
- [ ] Entries older than 10 minutes are removed from the registry
- [ ] The sweep interval is cleaned up on process exit (no dangling timers in tests)
- [ ] Active streams are not disrupted (eviction only removes the registry entry; existing listeners continue until the stream closes)

### Tasks

#### Task 4.1: Add TTL tracking and sweep to `TraceBusRegistry`

**File:** `apps/api/src/lib/trace-bus.ts`

```typescript
interface TraceBusEntry {
  bus: TraceBus;
  createdAt: number;
}

export class TraceBusRegistry {
  private static entries = new Map<string, TraceBusEntry>();
  private static sweepInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly TTL = 10 * 60 * 1000; // 10 minutes
  private static readonly SWEEP_INTERVAL = 5 * 60 * 1000; // 5 minutes

  static {
    TraceBusRegistry.startSweep();
  }

  static create(generationId: string): TraceBus {
    const bus = new TraceBus();
    this.entries.set(generationId, { bus, createdAt: Date.now() });
    return bus;
  }

  static get(generationId: string): TraceBus | undefined {
    return this.entries.get(generationId)?.bus;
  }

  static remove(generationId: string): void {
    this.entries.delete(generationId);
  }

  private static startSweep() {
    this.sweepInterval = setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of this.entries) {
        if (now - entry.createdAt > this.TTL) {
          this.entries.delete(id);
        }
      }
    }, this.SWEEP_INTERVAL);

    // Don't prevent process exit
    this.sweepInterval.unref();
  }

  static stopSweep() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}
```

**Subtasks:**
- Add `TraceBusEntry` interface with `createdAt` — **5 min**
- Update `create()` to store timestamp — **5 min**
- Implement sweep with `setInterval` — **10 min**
- Call `.unref()` on interval to not block process exit — **2 min**
- Add `stopSweep()` for test cleanup — **5 min**

---

## Story 5: Circuit Breaker Tests

### User Story

As a **developer**, I want comprehensive tests for the circuit breaker so that I can trust its state machine behaves correctly under all conditions.

### Acceptance Criteria

- [ ] Test: circuit stays closed on successful calls
- [ ] Test: circuit opens after `threshold` consecutive failures
- [ ] Test: circuit rejects immediately when open (throws `CircuitOpenError`)
- [ ] Test: circuit transitions to half-open after `timeout` ms
- [ ] Test: circuit closes after successful call in half-open state
- [ ] Test: circuit re-opens after failed call in half-open state
- [ ] Test: successful calls between failures reset the failure count

### Tasks

#### Task 5.1: Write circuit breaker unit tests

**File:** `packages/agent/src/lib/__tests__/circuit-breaker.test.ts`

```typescript
import { describe, it, assert, mock } from 'node:test';
import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  it('stays closed on successful calls', async () => {
    const cb = new CircuitBreaker('test', 3, 1000);
    const result = await cb.execute(async () => 'ok');
    assert.strictEqual(result, 'ok');
    assert.strictEqual(cb.getState(), 'closed');
  });

  it('opens after threshold consecutive failures', async () => {
    const cb = new CircuitBreaker('test', 3, 1000);

    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    }

    assert.strictEqual(cb.getState(), 'open');
  });

  it('rejects immediately when open', async () => {
    const cb = new CircuitBreaker('test', 1, 60000);

    // Open the circuit
    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    assert.strictEqual(cb.getState(), 'open');

    // Should reject without calling fn
    const fn = mock.fn(async () => 'should not be called');
    await assert.rejects(
      () => cb.execute(fn),
      (err: Error) => err instanceof CircuitOpenError
    );
    assert.strictEqual(fn.mock.callCount(), 0);
  });

  it('transitions to half-open after timeout', async () => {
    const cb = new CircuitBreaker('test', 1, 100); // 100ms timeout for test speed

    // Open the circuit
    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    assert.strictEqual(cb.getState(), 'open');

    // Wait for timeout
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next call should be allowed (half-open)
    const result = await cb.execute(async () => 'recovered');
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(cb.getState(), 'closed');
  });

  it('closes after successful call in half-open state', async () => {
    const cb = new CircuitBreaker('test', 1, 100);

    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    await new Promise(resolve => setTimeout(resolve, 150));

    // Half-open probe succeeds
    await cb.execute(async () => 'ok');
    assert.strictEqual(cb.getState(), 'closed');

    // Subsequent calls work normally
    const result = await cb.execute(async () => 'still ok');
    assert.strictEqual(result, 'still ok');
  });

  it('re-opens after failed call in half-open state', async () => {
    const cb = new CircuitBreaker('test', 1, 100);

    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    await new Promise(resolve => setTimeout(resolve, 150));

    // Half-open probe fails
    await assert.rejects(() => cb.execute(async () => { throw new Error('still failing'); }));
    assert.strictEqual(cb.getState(), 'open');
  });

  it('resets failure count on successful call', async () => {
    const cb = new CircuitBreaker('test', 3, 1000);

    // 2 failures (below threshold)
    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));

    // 1 success resets count
    await cb.execute(async () => 'ok');
    assert.strictEqual(cb.getState(), 'closed');

    // 2 more failures should NOT open (count was reset)
    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    await assert.rejects(() => cb.execute(async () => { throw new Error('fail'); }));
    assert.strictEqual(cb.getState(), 'closed');
  });
});
```

**Subtasks:**
- Write test: stays closed on success — **5 min**
- Write test: opens after threshold — **5 min**
- Write test: rejects when open — **10 min**
- Write test: half-open after timeout — **10 min**
- Write test: closes from half-open on success — **5 min**
- Write test: re-opens from half-open on failure — **5 min**
- Write test: success resets failure count — **10 min**
- Verify all tests pass with `tsx --test` — **5 min**

#### Task 5.2: Write TraceBusRegistry TTL test

**File:** `apps/api/src/lib/__tests__/trace-bus-registry.test.ts`

```typescript
import { describe, it, after, assert } from 'node:test';
import { TraceBusRegistry } from '../trace-bus';

describe('TraceBusRegistry TTL', () => {
  after(() => {
    TraceBusRegistry.stopSweep();
  });

  it('evicts entries older than TTL', async () => {
    // Create an entry with a backdated createdAt
    const bus = TraceBusRegistry.create('old-gen');

    // Manually backdate the entry (access internal state for testing)
    const entries = (TraceBusRegistry as any).entries as Map<string, { bus: any; createdAt: number }>;
    const entry = entries.get('old-gen')!;
    entry.createdAt = Date.now() - 11 * 60 * 1000; // 11 minutes ago

    // Create a fresh entry
    TraceBusRegistry.create('new-gen');

    // Trigger sweep manually (simulate interval firing)
    const now = Date.now();
    for (const [id, e] of entries) {
      if (now - e.createdAt > 10 * 60 * 1000) {
        entries.delete(id);
      }
    }

    // Old entry should be gone
    assert.strictEqual(TraceBusRegistry.get('old-gen'), undefined);

    // New entry should remain
    assert.ok(TraceBusRegistry.get('new-gen'));

    // Cleanup
    TraceBusRegistry.remove('new-gen');
  });

  it('does not evict entries within TTL', () => {
    TraceBusRegistry.create('fresh-gen');
    assert.ok(TraceBusRegistry.get('fresh-gen'));
    TraceBusRegistry.remove('fresh-gen');
  });
});
```

**Subtasks:**
- Write TTL eviction test with backdated entry — **15 min**
- Write test confirming fresh entries survive — **5 min**
- Verify tests pass — **5 min**

### Test Assertions Summary

| Test | Assertion |
|------|-----------|
| Stays closed | `getState() === 'closed'` after success |
| Opens after threshold | `getState() === 'open'` after 3 failures |
| Rejects when open | `CircuitOpenError` thrown, fn not called |
| Half-open after timeout | Call succeeds, state becomes `closed` |
| Closes from half-open | `getState() === 'closed'` after probe success |
| Re-opens from half-open | `getState() === 'open'` after probe failure |
| Resets on success | State stays `closed` after 2+success+2 failures |
| TTL eviction | `get('old-gen') === undefined` after sweep |
| Fresh entries survive | `get('fresh-gen')` is truthy |

---

## Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: Circuit breaker utility | 0.5 day |
| Story 2: AI provider circuit breakers | 1 day |
| Story 3: ML service circuit breaker | 0.5 day |
| Story 4: TraceBusRegistry TTL | 0.5 day |
| Story 5: Tests | 1 day |
| **Total** | **3.5 days** |
