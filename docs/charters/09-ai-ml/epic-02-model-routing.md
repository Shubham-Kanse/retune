# Epic 02: Model Routing & Fallback

**Charter:** AI/ML Excellence  
**Priority:** P1 — Sprint 2  
**Complexity:** M  
**Owner:** AI Platform Engineer

---

## Goal

Add automatic provider fallback to the AI provider abstraction so that when the primary provider returns a rate-limit or overload error, the system transparently retries with a secondary provider. This eliminates user-visible failures during provider outages.

## Definition of Done

- [ ] `packages/agent/src/lib/ai-provider.ts` supports a `ProviderConfig` with `primary`, `fallback`, and `fallbackOnErrors` fields
- [ ] When the primary provider throws a matching error, the call is automatically retried with the fallback provider
- [ ] `AGENT_MODEL_FALLBACK_PROVIDER` env var added to `.env.example`
- [ ] Fallback is logged (structured log entry with original error and fallback provider used)
- [ ] Unit test: mock primary to throw `rate_limit_exceeded`, verify fallback provider is called and returns successfully
- [ ] All existing agent tests pass (212/212)

---

## Context: Current Problem

### Single Provider, No Fallback

**File: `packages/agent/src/lib/ai-provider.ts` (9440 bytes)**

```typescript
// CURRENT — provider is selected at startup, no fallback:
// AI_PROVIDER=openai → only OpenAI is used
// AI_PROVIDER=anthropic → only Anthropic is used
// If the active provider rate-limits or goes down, all generations fail.
```

**File: `packages/agent/src/lib/providers/openai/index.ts` (21KB)**
**File: `packages/agent/src/lib/providers/anthropic/index.ts` (15KB)**

Both providers implement the same abstract interface (`AIProvider`), making fallback mechanically straightforward — the challenge is wiring the retry logic cleanly.

### Impact

- OpenAI rate limits during peak hours cause 100% generation failure for all users.
- Anthropic overload errors during model launches cause the same.
- No automatic recovery — requires manual env var change and redeploy.

---

## Story 2.1: Define ProviderConfig Interface and Fallback Chain

**As a** platform engineer,  
**I want** a `ProviderConfig` interface that declares primary and fallback providers with error triggers,  
**so that** the system knows when and how to failover.

**Acceptance Criteria:**
- [ ] `ProviderConfig` interface exported from `packages/agent/src/lib/ai-provider.ts`
- [ ] `primary` field: `'openai' | 'anthropic'` (required)
- [ ] `fallback` field: `'openai' | 'anthropic'` (optional)
- [ ] `fallbackOnErrors` field: `string[]` — error codes/messages that trigger fallback (default: `['rate_limit_exceeded', 'overloaded', '429', '529']`)
- [ ] `getProviderConfig()` function reads from env vars and returns a `ProviderConfig`
- [ ] When `AGENT_MODEL_FALLBACK_PROVIDER` is not set, `fallback` is `undefined` (no fallback, current behavior preserved)

### Task 2.1.1: Add ProviderConfig interface

**Owner:** AI Platform Engineer  
**Deliverable:** Modified `packages/agent/src/lib/ai-provider.ts`  
**Effort:** 1h

##### Subtask: Define the interface

Add to `packages/agent/src/lib/ai-provider.ts`:

```typescript
export type ProviderName = "openai" | "anthropic";

export interface ProviderConfig {
  primary: ProviderName;
  fallback?: ProviderName;
  fallbackOnErrors: string[];
}

const DEFAULT_FALLBACK_ERRORS = [
  "rate_limit_exceeded",
  "overloaded",
  "429",
  "529",
  "capacity",
  "too_many_requests",
];

export function getProviderConfig(): ProviderConfig {
  const primary = (process.env.AI_PROVIDER ?? "openai") as ProviderName;
  const fallback = process.env.AGENT_MODEL_FALLBACK_PROVIDER as ProviderName | undefined;

  return {
    primary,
    fallback: fallback && fallback !== primary ? fallback : undefined,
    fallbackOnErrors: DEFAULT_FALLBACK_ERRORS,
  };
}
```

**Effort:** 45 min

##### Subtask: Add env var to .env.example

Add to `.env.example`:

```bash
# ─── AI Fallback (OPTIONAL) ──────────────────────────────────────────────────
# Secondary provider for automatic failover on rate-limit/overload errors
# AGENT_MODEL_FALLBACK_PROVIDER=anthropic
```

**Effort:** 5 min

### Task 2.1.2: Write ProviderConfig unit tests

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/lib/ai-provider.test.ts`  
**Effort:** 1h

##### Subtask: Write config tests

Create or extend `packages/agent/src/lib/ai-provider.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getProviderConfig } from "./ai-provider";

describe("getProviderConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns openai as primary when AI_PROVIDER=openai", () => {
    process.env.AI_PROVIDER = "openai";
    delete process.env.AGENT_MODEL_FALLBACK_PROVIDER;
    const config = getProviderConfig();
    assert.equal(config.primary, "openai");
    assert.equal(config.fallback, undefined);
  });

  it("returns anthropic as fallback when AGENT_MODEL_FALLBACK_PROVIDER=anthropic", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AGENT_MODEL_FALLBACK_PROVIDER = "anthropic";
    const config = getProviderConfig();
    assert.equal(config.primary, "openai");
    assert.equal(config.fallback, "anthropic");
  });

  it("ignores fallback when same as primary", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AGENT_MODEL_FALLBACK_PROVIDER = "openai";
    const config = getProviderConfig();
    assert.equal(config.fallback, undefined);
  });

  it("includes default fallback error codes", () => {
    const config = getProviderConfig();
    assert.ok(config.fallbackOnErrors.includes("rate_limit_exceeded"));
    assert.ok(config.fallbackOnErrors.includes("429"));
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | Primary reads from `AI_PROVIDER` | `config.primary === "openai"` |
| 2 | Fallback reads from `AGENT_MODEL_FALLBACK_PROVIDER` | `config.fallback === "anthropic"` |
| 3 | Fallback is undefined when same as primary | `config.fallback === undefined` |
| 4 | Default error codes include `rate_limit_exceeded` and `429` | `includes(...)` |

**Effort:** 1h

---

## Story 2.2: Implement Fallback Retry Logic

**As a** platform engineer,  
**I want** the AI provider layer to automatically retry with the fallback provider when the primary throws a matching error,  
**so that** users experience zero downtime during provider rate-limits or outages.

**Acceptance Criteria:**
- [ ] A new `FallbackAIProvider` class wraps the primary and fallback providers
- [ ] `createMessage` and `createMessageWithTool` catch errors from the primary provider
- [ ] If the error message or code matches any entry in `fallbackOnErrors`, the call is retried with the fallback provider
- [ ] If no fallback is configured, the original error is re-thrown
- [ ] Maximum 1 fallback attempt (no infinite retry loops)
- [ ] Fallback invocation is logged with: original error, fallback provider name, latency

### Task 2.2.1: Implement FallbackAIProvider

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/lib/fallback-provider.ts`  
**Effort:** 2.5h

##### Subtask: Write the fallback wrapper

Create `packages/agent/src/lib/fallback-provider.ts`:

```typescript
import type { AIProvider, Message, ToolDefinition, ProviderConfig, ProviderName } from "./ai-provider";

export interface FallbackEvent {
  originalError: string;
  originalProvider: ProviderName;
  fallbackProvider: ProviderName;
  method: string;
  latencyMs: number;
}

export type FallbackListener = (event: FallbackEvent) => void;

export class FallbackAIProvider {
  private readonly primary: AIProvider;
  private readonly fallback: AIProvider | undefined;
  private readonly config: ProviderConfig;
  private readonly onFallback?: FallbackListener;

  constructor(
    primary: AIProvider,
    fallback: AIProvider | undefined,
    config: ProviderConfig,
    onFallback?: FallbackListener,
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.config = config;
    this.onFallback = onFallback;
  }

  async createMessage(
    system: string,
    messages: Message[],
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<string> {
    try {
      return await this.primary.createMessage(system, messages, options);
    } catch (error) {
      return this.handleFallback(error, "createMessage", () =>
        this.fallback!.createMessage(system, messages, options),
      );
    }
  }

  async createMessageWithTool(
    system: string,
    messages: Message[],
    tools: ToolDefinition[],
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<unknown> {
    try {
      return await this.primary.createMessageWithTool(system, messages, tools, options);
    } catch (error) {
      return this.handleFallback(error, "createMessageWithTool", () =>
        this.fallback!.createMessageWithTool(system, messages, tools, options),
      );
    }
  }

  private async handleFallback<T>(
    error: unknown,
    method: string,
    fallbackCall: () => Promise<T>,
  ): Promise<T> {
    if (!this.fallback || !this.shouldFallback(error)) {
      throw error;
    }

    const start = Date.now();
    const result = await fallbackCall();
    const latencyMs = Date.now() - start;

    this.onFallback?.({
      originalError: error instanceof Error ? error.message : String(error),
      originalProvider: this.config.primary,
      fallbackProvider: this.config.fallback!,
      method,
      latencyMs,
    });

    return result;
  }

  private shouldFallback(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code ?? "";
    const status = (error as { status?: number })?.status;

    return this.config.fallbackOnErrors.some(
      (trigger) =>
        message.toLowerCase().includes(trigger.toLowerCase()) ||
        code.toLowerCase().includes(trigger.toLowerCase()) ||
        (status !== undefined && String(status) === trigger),
    );
  }
}
```

**Effort:** 2h

##### Subtask: Wire FallbackAIProvider into provider factory

Update the provider factory (the function that reads `AI_PROVIDER` and instantiates the provider) to wrap with `FallbackAIProvider` when a fallback is configured:

In `packages/agent/src/lib/ai-provider.ts` (or the factory file that creates the provider instance):

```typescript
import { FallbackAIProvider } from "./fallback-provider";
import { getProviderConfig } from "./ai-provider";
import { createOpenAIProvider } from "./providers/openai";
import { createAnthropicProvider } from "./providers/anthropic";

export function createAIProviderWithFallback(): FallbackAIProvider {
  const config = getProviderConfig();

  const primary = config.primary === "openai"
    ? createOpenAIProvider()
    : createAnthropicProvider();

  const fallback = config.fallback
    ? config.fallback === "openai"
      ? createOpenAIProvider()
      : createAnthropicProvider()
    : undefined;

  return new FallbackAIProvider(primary, fallback, config, (event) => {
    console.warn(
      `[ai-fallback] ${event.originalProvider} → ${event.fallbackProvider} ` +
      `(${event.method}, error: ${event.originalError}, latency: ${event.latencyMs}ms)`,
    );
  });
}
```

**Effort:** 30 min

### Task 2.2.2: Write fallback retry unit tests

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/lib/fallback-provider.test.ts`  
**Effort:** 2h

##### Subtask: Write comprehensive fallback tests

Create `packages/agent/src/lib/fallback-provider.test.ts`:

```typescript
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { FallbackAIProvider } from "./fallback-provider";
import type { AIProvider, ProviderConfig } from "./ai-provider";

function createMockProvider(overrides?: Partial<AIProvider>): AIProvider {
  return {
    createMessage: mock.fn(async () => "mock response"),
    createMessageWithTool: mock.fn(async () => ({ result: "mock" })),
    ...overrides,
  } as unknown as AIProvider;
}

const defaultConfig: ProviderConfig = {
  primary: "openai",
  fallback: "anthropic",
  fallbackOnErrors: ["rate_limit_exceeded", "overloaded", "429"],
};

describe("FallbackAIProvider", () => {
  it("uses primary provider when it succeeds", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => "primary response"),
    });
    const fallback = createMockProvider();
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig);

    const result = await provider.createMessage("system", []);
    assert.equal(result, "primary response");
  });

  it("falls back to secondary when primary throws rate_limit_exceeded", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => {
        throw new Error("rate_limit_exceeded");
      }),
    });
    const fallback = createMockProvider({
      createMessage: mock.fn(async () => "fallback response"),
    });
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig);

    const result = await provider.createMessage("system", []);
    assert.equal(result, "fallback response");
  });

  it("falls back on 429 status code error", async () => {
    const error = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const primary = createMockProvider({
      createMessage: mock.fn(async () => { throw error; }),
    });
    const fallback = createMockProvider({
      createMessage: mock.fn(async () => "fallback response"),
    });
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig);

    const result = await provider.createMessage("system", []);
    assert.equal(result, "fallback response");
  });

  it("falls back on overloaded error", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => {
        throw new Error("The model is overloaded");
      }),
    });
    const fallback = createMockProvider({
      createMessage: mock.fn(async () => "fallback response"),
    });
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig);

    const result = await provider.createMessage("system", []);
    assert.equal(result, "fallback response");
  });

  it("re-throws non-matching errors without fallback attempt", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => {
        throw new Error("invalid_api_key");
      }),
    });
    const fallback = createMockProvider();
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig);

    await assert.rejects(
      () => provider.createMessage("system", []),
      { message: "invalid_api_key" },
    );
  });

  it("re-throws when no fallback provider is configured", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => {
        throw new Error("rate_limit_exceeded");
      }),
    });
    const configNoFallback: ProviderConfig = {
      primary: "openai",
      fallback: undefined,
      fallbackOnErrors: ["rate_limit_exceeded"],
    };
    const provider = new FallbackAIProvider(primary, undefined, configNoFallback);

    await assert.rejects(
      () => provider.createMessage("system", []),
      { message: "rate_limit_exceeded" },
    );
  });

  it("invokes onFallback listener with event details", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => {
        throw new Error("rate_limit_exceeded");
      }),
    });
    const fallback = createMockProvider({
      createMessage: mock.fn(async () => "fallback response"),
    });
    const events: unknown[] = [];
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig, (e) => {
      events.push(e);
    });

    await provider.createMessage("system", []);

    assert.equal(events.length, 1);
    const event = events[0] as { originalProvider: string; fallbackProvider: string; originalError: string };
    assert.equal(event.originalProvider, "openai");
    assert.equal(event.fallbackProvider, "anthropic");
    assert.ok(event.originalError.includes("rate_limit_exceeded"));
  });

  it("fallback works for createMessageWithTool", async () => {
    const primary = createMockProvider({
      createMessageWithTool: mock.fn(async () => {
        throw new Error("overloaded");
      }),
    });
    const fallback = createMockProvider({
      createMessageWithTool: mock.fn(async () => ({ tool: "result" })),
    });
    const provider = new FallbackAIProvider(primary, fallback, defaultConfig);

    const result = await provider.createMessageWithTool("system", [], []);
    assert.deepEqual(result, { tool: "result" });
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | Primary succeeds → returns primary response | `result === "primary response"` |
| 2 | Primary throws `rate_limit_exceeded` → fallback called, returns fallback response | `result === "fallback response"` |
| 3 | Primary throws 429 status → fallback called | `result === "fallback response"` |
| 4 | Primary throws `overloaded` → fallback called | `result === "fallback response"` |
| 5 | Non-matching error → re-thrown, no fallback | `rejects with "invalid_api_key"` |
| 6 | No fallback configured → re-thrown | `rejects with "rate_limit_exceeded"` |
| 7 | `onFallback` listener receives event with correct fields | `event.originalProvider === "openai"` |
| 8 | `createMessageWithTool` also falls back | `result === { tool: "result" }` |

**Effort:** 2h

---

## Story 2.3: Verify Backward Compatibility

**As a** platform engineer,  
**I want** the fallback feature to be fully backward-compatible when `AGENT_MODEL_FALLBACK_PROVIDER` is not set,  
**so that** existing deployments continue working without any configuration changes.

**Acceptance Criteria:**
- [ ] When `AGENT_MODEL_FALLBACK_PROVIDER` is unset, behavior is identical to current (single provider, errors propagate)
- [ ] All 212 existing agent tests pass without modification
- [ ] No new required environment variables introduced (fallback is opt-in)

### Task 2.3.1: Run full agent test suite

**Owner:** AI Platform Engineer  
**Deliverable:** Green test run  
**Effort:** 30 min

##### Subtask: Execute and verify

```bash
unset AGENT_MODEL_FALLBACK_PROVIDER
pnpm --filter @retune/agent test
```

Expected output: `212 pass, 0 fail`

**Effort:** 30 min

### Task 2.3.2: Write backward-compatibility test

**Owner:** AI Platform Engineer  
**Deliverable:** Test assertion in `packages/agent/src/lib/fallback-provider.test.ts`  
**Effort:** 30 min

##### Subtask: Add compatibility assertion

```typescript
describe("backward compatibility", () => {
  it("without AGENT_MODEL_FALLBACK_PROVIDER, errors propagate unchanged", async () => {
    const primary = createMockProvider({
      createMessage: mock.fn(async () => {
        throw new Error("rate_limit_exceeded");
      }),
    });
    const configNoFallback: ProviderConfig = {
      primary: "openai",
      fallback: undefined,
      fallbackOnErrors: ["rate_limit_exceeded"],
    };
    const provider = new FallbackAIProvider(primary, undefined, configNoFallback);

    await assert.rejects(
      () => provider.createMessage("system", []),
      (err: Error) => {
        assert.equal(err.message, "rate_limit_exceeded");
        return true;
      },
    );
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | No fallback configured + matching error → error propagates | `rejects with original error` |

**Effort:** 30 min

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 2.1: Define ProviderConfig Interface | 2h |
| 2.2: Implement Fallback Retry Logic | 4.5h |
| 2.3: Verify Backward Compatibility | 1h |
| **Total** | **7.5h** |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Fallback provider also rate-limited | Only 1 retry attempt; if fallback also fails, error propagates to caller. Future: add circuit breaker. |
| Model capability mismatch between providers | Both providers implement the same `AIProvider` interface; structured output schemas are provider-agnostic. |
| Latency increase on fallback path | Fallback adds one additional LLM call latency (~2–5s). Acceptable vs. total failure. Logged for monitoring. |
| Fallback hides persistent primary failures | `onFallback` listener logs every fallback event; alerting can be wired to detect sustained fallback usage. |
