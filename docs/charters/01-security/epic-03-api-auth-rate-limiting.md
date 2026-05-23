# Epic 03: API Authentication & Rate Limiting

**Charter:** Security  
**Priority:** P0 — Week 1  
**Complexity:** L  
**Owner:** Backend Engineer

---

## Goal

Every route on `apps/api` requires authentication. The `/generate` endpoint has per-user and per-IP rate limiting. The `RETUNE_INTERNAL_API_KEY` absence in dev mode cannot be exploited in production.

## Definition of Done

- [ ] `GET /generations` requires a valid `x-retune-internal-key` header — returns 401 without it
- [ ] `POST /generate` has per-user rate limiting: max 10 requests/minute, returns 429 with `Retry-After` header
- [ ] `POST /generate` has per-IP rate limiting: max 20 requests/minute per IP
- [ ] `RETUNE_INTERNAL_API_KEY` absence in production causes startup to fail with a clear error message
- [ ] All rate limit state is stored in Redis (not in-memory) so it works across multiple API instances
- [ ] Integration tests cover: 401 on missing key, 429 on rate limit exceeded, 200 on valid request

---

## Context: Current State

**File: `apps/api/src/routes/generate.ts` lines 40–72**

The `GET /generations` route currently has no auth check:
```typescript
app.get("/generations", async (c) => {
  const durability = await acquire_durability();
  // NO AUTH CHECK HERE — any caller gets all generations
  if (durability) {
    const rows = await durability.db.select(...).from(generations)...
    return c.json(rows);
  }
  ...
});
```

**File: `apps/api/src/lib/internal-auth.ts` lines 40–52**

Dev mode fallback allows unauthenticated user impersonation:
```typescript
if (!internalKey) {
  // Dev mode: no key configured, accept anonymous calls
  if (headerUid && UUID_RE.test(headerUid)) {
    return { identity: { user_id: headerUid, authenticated_via_internal_key: false } };
  }
  return { identity: { user_id: defaultUserId, authenticated_via_internal_key: false } };
}
```

**File: `apps/api/src/main.ts`**

No rate limiting middleware exists anywhere.

---

## Story 3.1: Add Auth Check to GET /generations

**As a** security engineer,  
**I want** `GET /generations` to require a valid internal API key,  
**so that** unauthenticated callers cannot enumerate all generation IDs and metadata.

**Acceptance Criteria:**
- [ ] `GET /generations` without `x-retune-internal-key` header returns `{ "error": "missing_internal_key" }` with HTTP 401
- [ ] `GET /generations` with wrong key returns `{ "error": "invalid_internal_key" }` with HTTP 401
- [ ] `GET /generations` with correct key returns the generations list as before
- [ ] In dev mode (no `RETUNE_INTERNAL_API_KEY` set), `GET /generations` still requires a valid UUID in `x-retune-user-id` — it does NOT return all users' generations
- [ ] Unit test covers all three cases above

### Task 3.1.1: Add auth check to GET /generations route
**Owner:** Backend Engineer  
**Deliverable:** `GET /generations` returns 401 without valid auth  
**Dependencies:** None — `resolveAuthenticatedIdentity` already exists in `apps/api/src/lib/internal-auth.ts`

##### Subtask: Add auth call to GET /generations handler
Open `apps/api/src/routes/generate.ts`. In the `app.get("/generations", ...)` handler, add the auth check immediately after the opening brace, before any database call:

```typescript
app.get("/generations", async (c) => {
  // ADD THIS BLOCK:
  const durability = await acquire_durability();
  const default_user_id = durability?.default_user_id ?? "00000000-0000-4000-8000-000000000000";
  const auth = resolveAuthenticatedIdentity(c.req.raw.headers, default_user_id);
  if ("error" in auth) return c.json({ error: auth.error }, auth.status as 401 | 400);
  // END ADDED BLOCK

  if (durability) {
    const rows = await durability.db
      .select(...)
      .from(generations)
      .where(
        // ADD: filter by authenticated user
        and(
          eq(generations.user_id, auth.identity.user_id),
          isNull(generations.deleted_at)
        )
      )
      ...
  }
  ...
});
```

Note: also add `user_id` filter to the query so users only see their own generations.  
**Output:** `GET /generations` returns 401 without auth, and only returns the authenticated user's generations  
**Effort:** half day

##### Subtask: Write unit tests for GET /generations auth
Create/update `apps/api/tests/generation-access-control.test.ts`. Add:

```typescript
describe("GET /generations auth", () => {
  it("returns 401 when x-retune-internal-key is missing and RETUNE_INTERNAL_API_KEY is set", async () => {
    process.env.RETUNE_INTERNAL_API_KEY = "test-key";
    const res = await app.request("/generations", { method: "GET" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("missing_internal_key");
  });

  it("returns 401 when x-retune-internal-key is wrong", async () => {
    process.env.RETUNE_INTERNAL_API_KEY = "test-key";
    const res = await app.request("/generations", {
      method: "GET",
      headers: { "x-retune-internal-key": "wrong-key", "x-retune-user-id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with correct key", async () => {
    process.env.RETUNE_INTERNAL_API_KEY = "test-key";
    const res = await app.request("/generations", {
      method: "GET",
      headers: { "x-retune-internal-key": "test-key", "x-retune-user-id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(200);
  });
});
```
**Output:** 3 passing tests in `generation-access-control.test.ts`  
**Effort:** half day

---

## Story 3.2: Enforce RETUNE_INTERNAL_API_KEY in Production

**As a** security engineer,  
**I want** the API to refuse to start if `RETUNE_INTERNAL_API_KEY` is not set in production,  
**so that** a misconfigured production deployment cannot be exploited via the dev-mode fallback.

**Acceptance Criteria:**
- [ ] When `NODE_ENV=production` and `RETUNE_INTERNAL_API_KEY` is unset, `apps/api` exits with code 1 and logs: `[startup] RETUNE_INTERNAL_API_KEY must be set in production`
- [ ] When `NODE_ENV=development` and `RETUNE_INTERNAL_API_KEY` is unset, the API starts normally with a warning log: `[startup] RETUNE_INTERNAL_API_KEY not set — running in dev mode (unauthenticated)`
- [ ] The startup selfcheck script (`apps/api/scripts/startup-selfcheck.mjs`) checks for this variable
- [ ] Unit test verifies the startup check logic

### Task 3.2.1: Add production startup guard
**Owner:** Backend Engineer  
**Deliverable:** API refuses to start in production without the key  
**Dependencies:** None

##### Subtask: Add startup validation to apps/api/src/main.ts
Open `apps/api/src/main.ts`. Before the `serve(...)` call, add:

```typescript
// Production guard: RETUNE_INTERNAL_API_KEY must be set
if (process.env.NODE_ENV === "production" && !process.env.RETUNE_INTERNAL_API_KEY) {
  console.error("[startup] FATAL: RETUNE_INTERNAL_API_KEY must be set in production");
  process.exit(1);
}
if (process.env.NODE_ENV !== "production" && !process.env.RETUNE_INTERNAL_API_KEY) {
  console.warn("[startup] WARNING: RETUNE_INTERNAL_API_KEY not set — running in dev mode (unauthenticated)");
}
```
**Output:** API exits 1 in production without the key  
**Effort:** < 2 hours

##### Subtask: Update startup-selfcheck.mjs
Open `apps/api/scripts/startup-selfcheck.mjs`. Add a check:
```javascript
if (process.env.NODE_ENV === "production" && !process.env.RETUNE_INTERNAL_API_KEY) {
  console.error("FAIL: RETUNE_INTERNAL_API_KEY is required in production");
  process.exit(1);
}
```
**Output:** Selfcheck script validates the key  
**Effort:** < 2 hours

##### Subtask: Add to .env.example
Open `/Users/shubhamkanse/retune/.env.example`. Add:
```
# ─── Internal API Security (REQUIRED in production) ──────────────────────────
# Generate with: openssl rand -hex 32
RETUNE_INTERNAL_API_KEY=
```
**Output:** `.env.example` documents the required variable  
**Effort:** < 2 hours

---

## Story 3.3: Implement Per-User and Per-IP Rate Limiting on POST /generate

**As a** security engineer,  
**I want** `POST /generate` to enforce rate limits per user and per IP,  
**so that** a single user or IP cannot trigger unlimited LLM calls and exhaust AI provider quotas.

**Acceptance Criteria:**
- [ ] A single user ID can make at most 10 `POST /generate` requests per 60-second window; the 11th returns HTTP 429 with header `Retry-After: <seconds>`
- [ ] A single IP address can make at most 20 `POST /generate` requests per 60-second window; the 21st returns HTTP 429
- [ ] Rate limit counters are stored in Redis (not in-memory) — verified by running two API instances and confirming the limit is shared
- [ ] Rate limit headers are returned on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] When Redis is unavailable, the API falls back to in-memory rate limiting with a warning log (does not fail open with no limiting)
- [ ] Integration test: 11 sequential requests from the same user returns 429 on the 11th

### Task 3.3.1: Add Redis dependency
**Owner:** Backend Engineer  
**Deliverable:** `ioredis` installed in `apps/api`  
**Dependencies:** Redis instance provisioned (see Charter 05 Epic 2 for Redis setup)

##### Subtask: Install ioredis
```bash
pnpm --filter @retune/api add ioredis
pnpm --filter @retune/api add -D @types/ioredis
```
**Output:** `ioredis` in `apps/api/package.json` dependencies  
**Effort:** < 2 hours

##### Subtask: Create Redis client module
Create `apps/api/src/lib/redis-client.ts`:
```typescript
import Redis from "ioredis";

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  client.on("error", (err) => {
    console.error("[redis] connection error:", err.message);
  });
  return client;
}
```
**Output:** `apps/api/src/lib/redis-client.ts` created  
**Effort:** < 2 hours

### Task 3.3.2: Implement sliding window rate limiter
**Owner:** Backend Engineer  
**Deliverable:** `apps/api/src/lib/rate-limiter.ts` with Redis-backed sliding window  
**Dependencies:** Task 3.3.1

##### Subtask: Create rate limiter module
Create `apps/api/src/lib/rate-limiter.ts`:
```typescript
import type Redis from "ioredis";
import { getRedisClient } from "./redis-client";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp seconds
}

// Sliding window using Redis sorted sets
// Key: `rl:<namespace>:<identifier>`
// Members: request timestamps (as score and value)
export async function checkRateLimit(
  namespace: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const key = `rl:${namespace}:${identifier}`;

  if (!redis) {
    // Fallback: in-memory (single instance only, not shared)
    return inMemoryRateLimit(key, limit, windowSeconds);
  }

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds * 2);
  const results = await pipeline.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;
  const allowed = count <= limit;
  const resetAt = Math.ceil((now + windowSeconds * 1000) / 1000);

  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

// In-memory fallback (single process only)
const _inMemory = new Map<string, number[]>();
function inMemoryRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const timestamps = (_inMemory.get(key) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  _inMemory.set(key, timestamps);
  const count = timestamps.length;
  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    resetAt: Math.ceil((now + windowSeconds * 1000) / 1000),
  };
}
```
**Output:** `apps/api/src/lib/rate-limiter.ts` created  
**Effort:** full day

### Task 3.3.3: Add rate limiting middleware to POST /generate
**Owner:** Backend Engineer  
**Deliverable:** `POST /generate` enforces rate limits  
**Dependencies:** Task 3.3.2

##### Subtask: Add rate limit check to POST /generate handler
Open `apps/api/src/routes/generate.ts`. In the `app.post("/generate", ...)` handler, after the auth check and before `createAndStartGeneration`, add:

```typescript
// Rate limiting: per-user (10/min) and per-IP (20/min)
const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  ?? c.req.header("x-real-ip")
  ?? "unknown";

const [userLimit, ipLimit] = await Promise.all([
  checkRateLimit("generate:user", auth.identity.user_id, 10, 60),
  checkRateLimit("generate:ip", clientIp, 20, 60),
]);

const binding = !userLimit.allowed ? userLimit : !ipLimit.allowed ? ipLimit : null;
if (binding) {
  c.header("X-RateLimit-Limit", String(binding.limit));
  c.header("X-RateLimit-Remaining", "0");
  c.header("X-RateLimit-Reset", String(binding.resetAt));
  c.header("Retry-After", String(binding.resetAt - Math.floor(Date.now() / 1000)));
  return c.json({ error: "rate_limit_exceeded" }, 429);
}

c.header("X-RateLimit-Limit", String(userLimit.limit));
c.header("X-RateLimit-Remaining", String(userLimit.remaining));
c.header("X-RateLimit-Reset", String(userLimit.resetAt));
```

Import `checkRateLimit` at the top of the file:
```typescript
import { checkRateLimit } from "../lib/rate-limiter";
```
**Output:** Rate limiting active on `POST /generate`  
**Effort:** half day

##### Subtask: Add REDIS_URL to .env.example
```
# ─── Redis (required for rate limiting in production) ─────────────────────────
REDIS_URL=redis://localhost:6379
```
**Output:** `.env.example` documents Redis requirement  
**Effort:** < 2 hours

### Task 3.3.4: Write integration tests for rate limiting
**Owner:** Backend Engineer  
**Deliverable:** Tests in `apps/api/tests/` verifying rate limit behaviour  
**Dependencies:** Task 3.3.3

##### Subtask: Write rate limit integration test
Create `apps/api/tests/rate-limiting.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Redis to use in-memory fallback for tests
vi.mock("../src/lib/redis-client", () => ({ getRedisClient: () => null }));

describe("POST /generate rate limiting", () => {
  const VALID_HEADERS = {
    "content-type": "application/json",
    "x-retune-internal-key": "test-key",
    "x-retune-user-id": "00000000-0000-4000-8000-000000000001",
  };

  beforeEach(() => {
    process.env.RETUNE_INTERNAL_API_KEY = "test-key";
    // Reset in-memory rate limit state between tests
    vi.resetModules();
  });

  it("allows first 10 requests from same user", async () => {
    const { app } = await import("../src/main");
    for (let i = 0; i < 10; i++) {
      const res = await app.request("/generate", {
        method: "POST",
        headers: VALID_HEADERS,
        body: JSON.stringify({ jd_title: "Engineer", company: "Acme" }),
      });
      expect(res.status).not.toBe(429);
    }
  });

  it("returns 429 on 11th request from same user within 60 seconds", async () => {
    const { app } = await import("../src/main");
    for (let i = 0; i < 10; i++) {
      await app.request("/generate", {
        method: "POST",
        headers: VALID_HEADERS,
        body: JSON.stringify({ jd_title: "Engineer", company: "Acme" }),
      });
    }
    const res = await app.request("/generate", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({ jd_title: "Engineer", company: "Acme" }),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limit_exceeded");
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns X-RateLimit headers on every response", async () => {
    const { app } = await import("../src/main");
    const res = await app.request("/generate", {
      method: "POST",
      headers: VALID_HEADERS,
      body: JSON.stringify({ jd_title: "Engineer", company: "Acme" }),
    });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
  });
});
```
**Output:** `apps/api/tests/rate-limiting.test.ts` with 3 passing tests  
**Effort:** full day


---

## Architect addendum (2026-05-22)

This epic was reviewed against the verified codebase and needs three refinements before implementation.

### Split the three auth surfaces — they have different threat models

The intern's draft conflates them. They must be specified independently:

1. **Public web routes** (Supabase SSR session cookie). Threat: stolen browser session. Mitigation: short JWT TTL, refresh rotation, `httpOnly` + `Secure` + `SameSite=Lax` cookies, IP-fingerprint anomaly detection. Owner: Supabase Auth + `apps/web/src/middleware.ts`.
2. **Web → API internal calls** (`apps/api/src/lib/internal-auth.ts` HMAC + UUID validation). Threat: internal service spoofing. Mitigation: production fail-closed when `RETUNE_INTERNAL_API_KEY` is unset (currently falls back to anonymous — verified line 43); rotate the key quarterly per Charter 01 Epic 02 Story 2.4.
3. **SSE streams** (`apps/api/src/lib/generation-access-token.ts` HMAC). Threat: cross-tenant SSE access. Mitigation: token TTL 15 min (already enforced); user-id claim must match generation owner (verified `routes/stream.ts:30-43`); add Last-Event-ID validation to prevent replay (Charter 04 Epic 02).

Each gets its own threat model, its own rate limit, its own monitoring panel.

### Consolidate the 4 duplicate rate limiters BEFORE adding new ones

Verified four rate-limit implementations in `apps/web`:

- `apps/web/src/lib/rate-limit.ts` — IP-based, used by `api-handler.ts`
- `apps/web/src/lib/rate-limiter.ts` — user+endpoint-based, used by some routes directly. **Has a bare `setInterval` at module scope** — side-effect on import.
- `apps/web/src/lib/career-understanding/rate-limit.ts` — career-understanding specific
- `apps/web/src/lib/onboarding-v2/llm/calls.ts` — embedded session-level LLM rate limiting

All four must be merged into one `RateLimiter` class with pluggable strategies (per-IP, per-user, per-endpoint, per-token-bucket). The `setInterval`-on-import in `rate-limiter.ts` is a foot-gun — replace with explicit `start()`/`stop()`.

### `apps/api` global rate limiter is missing entirely

`apps/api/src/main.ts` registers no rate-limit middleware. Per-route auth happens inside route handlers only. Add a Hono middleware that enforces a per-IP token bucket on every route, with route-specific overrides (e.g. `/generate` POST: 10/min/user; `/generate/:id/stream` GET: 1 concurrent/user; `/health`: unlimited).

Use the same `RateLimiter` class from the web side so behaviour is consistent.

### Verification

- Integration test: spam `/generate` 100×/min from one IP → expect 429 after 10.
- Integration test: spam `/health` 1000×/min → expect 200 (excluded from limiter).
- Integration test: omit `RETUNE_INTERNAL_API_KEY` in `NODE_ENV=production` → process exits with non-zero code.
