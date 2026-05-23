# Epic 01 — Database Performance

## Overview

Harden the database layer with proper connection pooling and wire the existing prompt cache into AI provider calls to eliminate redundant LLM requests.

---

## Story 1: Configure Connection Pooling

### User Story

As a platform operator, I want the Postgres connection pool to have explicit limits and timeouts so that the application handles load spikes without exhausting database connections.

### Acceptance Criteria

- [ ] `packages/db/src/pg/client.ts` creates the postgres client with explicit `max`, `idle_timeout`, `connect_timeout`, and `prepare` options
- [ ] `DB_POOL_MAX` environment variable controls the pool size with a default of 10
- [ ] `.env.example` documents `DB_POOL_MAX` with its default value
- [ ] `prepare: false` is set to support Supabase transaction pooler / PgBouncer
- [ ] Existing tests continue to pass with the new configuration

### Tasks

#### Task 1.1: Update Postgres client configuration

**File:** `packages/db/src/pg/client.ts`

Replace the current `postgres(url)` call with:

```typescript
const sql = postgres(url, {
  max: Number(process.env.DB_POOL_MAX ?? '10'),
  idle_timeout: 20, // seconds
  connect_timeout: 10, // seconds
  prepare: false, // required for PgBouncer/Supabase transaction pooler
});
```

**Subtasks:**
- Locate the existing `postgres(url)` instantiation — **10 min**
- Add the options object with pool configuration — **10 min**
- Verify TypeScript compilation passes — **5 min**

**Effort:** 25 minutes

#### Task 1.2: Add `DB_POOL_MAX` to `.env.example`

**File:** `.env.example`

Add under the Database section:

```bash
# ─── Connection Pool (OPTIONAL — defaults shown) ─────────────────────────────
# DB_POOL_MAX=10
```

**Subtasks:**
- Add the variable with comment explaining its purpose — **5 min**

**Effort:** 5 minutes

#### Task 1.3: Write integration test for pool configuration

**File:** `packages/db/src/pg/__tests__/client.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { sql } from '../client.js';

describe('Postgres client configuration', () => {
  it('respects DB_POOL_MAX environment variable', () => {
    // The postgres.js client exposes options on the instance
    assert.strictEqual(sql.options.max, Number(process.env.DB_POOL_MAX ?? '10'));
  });

  it('sets idle_timeout to 20 seconds', () => {
    assert.strictEqual(sql.options.idle_timeout, 20);
  });

  it('sets connect_timeout to 10 seconds', () => {
    assert.strictEqual(sql.options.connect_timeout, 10);
  });

  it('disables prepared statements for PgBouncer compatibility', () => {
    assert.strictEqual(sql.options.prepare, false);
  });
});
```

**Subtasks:**
- Create test file with pool config assertions — **15 min**
- Run tests and verify pass — **5 min**

**Effort:** 20 minutes

---

## Story 2: Wire Prompt Cache into AI Provider Calls

### User Story

As a cost-conscious operator, I want identical LLM prompts to return cached results within a 1-hour window so that duplicate API calls are eliminated, reducing latency and token spend.

### Acceptance Criteria

- [ ] Cache key is computed as `sha256(model + prompt + temperature)`
- [ ] Cache TTL is 1 hour for identical prompts
- [ ] Cache storage is in-memory LRU with max 100 entries (no Redis dependency)
- [ ] `packages/agent/src/lib/providers/openai/index.ts` checks the cache before making API calls
- [ ] `packages/agent/src/lib/providers/anthropic/index.ts` checks the cache before making API calls
- [ ] Cache hit returns the stored result without network call
- [ ] Cache miss proceeds with normal API call and stores the result
- [ ] Test proves second identical call returns cached result without hitting the API

### Tasks

#### Task 2.1: Update prompt cache module with LRU and SHA-256 key

**File:** `packages/agent/src/caching/prompt-cache.ts`

Ensure the cache module exports:

```typescript
import { createHash } from 'node:crypto';

interface CacheEntry {
  result: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 100;
const TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = new Map<string, CacheEntry>();

export function getCacheKey(model: string, prompt: string, temperature: number): string {
  return createHash('sha256')
    .update(`${model}:${prompt}:${temperature}`)
    .digest('hex');
}

export function getFromCache(key: string): unknown | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.result;
}

export function setInCache(key: string, result: unknown): void {
  // Evict oldest entry if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { result, expiresAt: Date.now() + TTL_MS });
}
```

**Subtasks:**
- Review existing `prompt-cache.ts` implementation — **10 min**
- Implement/update with LRU eviction and SHA-256 keying — **20 min**
- Export `getCacheKey`, `getFromCache`, `setInCache` — **5 min**

**Effort:** 35 minutes

#### Task 2.2: Wire cache into OpenAI provider

**File:** `packages/agent/src/lib/providers/openai/index.ts`

Wrap the API call function:

```typescript
import { getCacheKey, getFromCache, setInCache } from '../../../caching/prompt-cache.js';

// Inside the function that calls the OpenAI API:
const cacheKey = getCacheKey(model, prompt, temperature);
const cached = getFromCache(cacheKey);
if (cached) return cached;

// ... existing API call ...
const result = await openai.chat.completions.create({ ... });

setInCache(cacheKey, result);
return result;
```

**Subtasks:**
- Identify the call site in the OpenAI provider — **10 min**
- Add cache check before the API call — **10 min**
- Add cache store after successful response — **10 min**
- Verify TypeScript compilation — **5 min**

**Effort:** 35 minutes

#### Task 2.3: Wire cache into Anthropic provider

**File:** `packages/agent/src/lib/providers/anthropic/index.ts`

Same pattern as OpenAI:

```typescript
import { getCacheKey, getFromCache, setInCache } from '../../../caching/prompt-cache.js';

// Inside the function that calls the Anthropic API:
const cacheKey = getCacheKey(model, prompt, temperature);
const cached = getFromCache(cacheKey);
if (cached) return cached;

// ... existing API call ...
const result = await anthropic.messages.create({ ... });

setInCache(cacheKey, result);
return result;
```

**Subtasks:**
- Identify the call site in the Anthropic provider — **10 min**
- Add cache check before the API call — **10 min**
- Add cache store after successful response — **10 min**
- Verify TypeScript compilation — **5 min**

**Effort:** 35 minutes

#### Task 2.4: Write test — cached prompt skips API call

**File:** `packages/agent/src/caching/__tests__/prompt-cache.test.ts`

```typescript
import { describe, it, mock, beforeEach, assert } from 'node:test';
import { getCacheKey, getFromCache, setInCache } from '../prompt-cache.js';

describe('prompt-cache', () => {
  beforeEach(() => {
    // Clear cache between tests by re-importing or exposing a clear function
  });

  it('generates consistent SHA-256 cache keys', () => {
    const key1 = getCacheKey('gpt-4o', 'hello world', 0.7);
    const key2 = getCacheKey('gpt-4o', 'hello world', 0.7);
    assert.strictEqual(key1, key2);
    assert.strictEqual(key1.length, 64); // SHA-256 hex length
  });

  it('generates different keys for different inputs', () => {
    const key1 = getCacheKey('gpt-4o', 'hello world', 0.7);
    const key2 = getCacheKey('gpt-4o', 'hello world', 0.8);
    assert.notStrictEqual(key1, key2);
  });

  it('returns undefined for cache miss', () => {
    const result = getFromCache('nonexistent-key');
    assert.strictEqual(result, undefined);
  });

  it('returns cached result on cache hit', () => {
    const key = getCacheKey('gpt-4o', 'test prompt', 0.5);
    const mockResult = { choices: [{ message: { content: 'cached response' } }] };
    setInCache(key, mockResult);
    const cached = getFromCache(key);
    assert.deepStrictEqual(cached, mockResult);
  });

  it('same prompt called twice — second call returns cached result without hitting API', async () => {
    const mockApiCall = mock.fn(async (model: string, prompt: string, temperature: number) => {
      return { choices: [{ message: { content: 'api response' } }] };
    });

    async function callWithCache(model: string, prompt: string, temperature: number) {
      const cacheKey = getCacheKey(model, prompt, temperature);
      const cached = getFromCache(cacheKey);
      if (cached) return cached;
      const result = await mockApiCall(model, prompt, temperature);
      setInCache(cacheKey, result);
      return result;
    }

    const result1 = await callWithCache('gpt-4o', 'duplicate prompt', 0.7);
    const result2 = await callWithCache('gpt-4o', 'duplicate prompt', 0.7);

    assert.deepStrictEqual(result1, result2);
    assert.strictEqual(mockApiCall.mock.callCount(), 1); // API called only once
  });

  it('evicts oldest entry when cache exceeds 100 entries', () => {
    const firstKey = getCacheKey('model', 'prompt-0', 0);
    setInCache(firstKey, { id: 0 });

    for (let i = 1; i <= 100; i++) {
      const key = getCacheKey('model', `prompt-${i}`, 0);
      setInCache(key, { id: i });
    }

    // First entry should be evicted
    assert.strictEqual(getFromCache(firstKey), undefined);
  });

  it('expires entries after TTL', () => {
    const key = getCacheKey('gpt-4o', 'expiring prompt', 0.5);
    setInCache(key, { content: 'will expire' });

    // Manually verify TTL logic — in production, mock Date.now()
    const result = getFromCache(key);
    assert.notStrictEqual(result, undefined); // Still valid immediately
  });
});
```

**Subtasks:**
- Create test file with cache key consistency tests — **10 min**
- Add cache hit/miss tests — **10 min**
- Add the "second call skips API" integration test with mock — **15 min**
- Add eviction and TTL tests — **10 min**
- Run full test suite and verify pass — **5 min**

**Effort:** 50 minutes

---

## Story 3: Add Pool Monitoring Logging

### User Story

As a platform operator, I want connection pool utilisation logged at startup and on saturation so that I can detect capacity issues before they cause failures.

### Acceptance Criteria

- [ ] On application startup, log the configured pool size
- [ ] When pool reaches 80% utilisation, emit a warning log
- [ ] Log format is structured JSON compatible with existing logging

### Tasks

#### Task 3.1: Add pool startup log

**File:** `packages/db/src/pg/client.ts`

```typescript
console.info(JSON.stringify({
  level: 'info',
  msg: 'Postgres pool configured',
  max: Number(process.env.DB_POOL_MAX ?? '10'),
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
}));
```

**Subtasks:**
- Add structured log after client creation — **10 min**

**Effort:** 10 minutes

#### Task 3.2: Add pool saturation warning via `onnotice` or periodic check

**File:** `packages/db/src/pg/client.ts`

```typescript
// postgres.js exposes connection count via sql.CLOSE event or internal tracking
// Log warning when active connections exceed 80% of max
const poolMax = Number(process.env.DB_POOL_MAX ?? '10');
const SATURATION_THRESHOLD = 0.8;

// If postgres.js supports onconnect/ondisconnect hooks, wire them here.
// Otherwise, expose a health-check function:
export function getPoolHealth() {
  return {
    max: poolMax,
    threshold: Math.floor(poolMax * SATURATION_THRESHOLD),
  };
}
```

**Subtasks:**
- Implement pool health export — **15 min**
- Add saturation warning logic — **15 min**

**Effort:** 30 minutes

---

## Total Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Connection Pooling | 50 min |
| Story 2: Prompt Cache Wiring | 2 hr 35 min |
| Story 3: Pool Monitoring | 40 min |
| **Total** | **~4 hours** |

## Definition of Done

- All acceptance criteria checked off
- Tests pass in CI (`pnpm test --filter @retune/db --filter @retune/agent`)
- No TypeScript compilation errors
- `.env.example` updated
- PR description includes before/after metrics (connection count under load, cache hit rate)


---

## Architect addendum (2026-05-22)

Two findings from the verified codebase that must be folded into Story 1.

### `prepare: false` is REQUIRED for Supabase transaction pooler

Verified in `packages/db/src/pg/client.ts`: `postgres_drizzle()` instantiates `postgres(url)` with default options. The Supabase transaction pooler at port 6543 (verified in `.env.vercel` `RETUNE_DATABASE_URL`) does NOT support prepared statements. Without `prepare: false` the production process hits errors like `prepared statement "s_1" already exists` under load.

This is a single-line fix:

```typescript
// packages/db/src/pg/client.ts
export function postgres_drizzle(url: string): { db: PgDb; sql: postgres.Sql } {
  const sql = postgres(url, {
    prepare: false, // REQUIRED for Supabase pooler at port 6543
    max: 10, // explicit, instead of relying on default 10
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return { db: drizzle(sql), sql };
}
```

It is the highest value-per-line change in the entire performance charter. Make it Story 1.0 (smaller than Story 1.1).

### Wire `prompt-cache.ts`

Verified `packages/agent/src/caching/prompt-cache.ts` exists (4885 B) but is not imported by `packages/agent/src/lib/provider.ts` or any specialist. The cache is built; nothing flushes data into it.

Spec:

1. In `packages/agent/src/lib/provider.ts`, wrap every `createMessage*` call with a `PromptCache.lookup(key)` where `key = sha256(model + agent_name + JSON.stringify(messages) + temperature)`.
2. Cache entry = `{ response, recorded_at }`. TTL = 1 hour by default (env var `RETUNE_PROMPT_CACHE_TTL_S`).
3. Do NOT cache responses that include `tool_use` blocks (mutations) or that came from `runBackground` (long-running frontier).
4. Cache hit logged with `cached=true` in `ModelCallTelemetry` (so cost analysis is honest).

Expected hit rate on the same generation tick: 0% (each LLM call has unique context). Expected hit rate across redrives of the same job (e.g. retry with same JD + same profile): 30-60%, mostly comprehension specialists.

### Verification

- Integration test: with `prepare: false` set, run 1000 concurrent queries through PGlite-with-pooler-shim → no errors.
- Integration test: run the same generation twice with `RETUNE_PROMPT_CACHE_TTL_S=3600` → second run shows `cached=true` on at least 30% of model calls.
