# Epic 02 — Contract Testing

## Summary

Establish HTTP contract tests between `apps/web` (consumer via `ApiClient`) and `apps/api` (provider via Hono routes). Tests verify that request schemas accepted by the API match what the web client sends, and response shapes match what the web client expects. All tests use the real Hono app with PGlite persistence — no mocks.

## Contract Boundary

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web/src/lib/api-client.ts (Consumer)                  │
│  - POST /applications → { generation_id, runtime }          │
│  - GET /generate/:id/stream → SSE { kind, ... }            │
│  - GET /generate/:id → { resume, cover_letter, strategy }  │
│  - GET /health → { status, timestamp }                      │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼──────────────────────────────┐
│  apps/api/src/routes/ (Provider)                            │
│  - generate.ts: POST /generate, GET /generations,           │
│    GET /generate/:id, GET /generate/:id/stream              │
│  - health.ts: GET /health                                   │
└─────────────────────────────────────────────────────────────┘
```

## Acceptance Criteria (Epic-Level)

- [ ] `apps/api/tests/contract/` directory exists with contract test files
- [ ] Each route has request validation tests (invalid → 400) and response shape tests (valid → correct schema)
- [ ] Tests use the actual Hono app with PGlite (no HTTP mocking)
- [ ] Contract tests run in the `test-ts` CI job
- [ ] Breaking a response shape in the API causes a test failure

---

## Story 1: Contract test for POST /generate

### User Story

As a frontend developer, I want a contract test that verifies `POST /generate` accepts the request shape my `ApiClient` sends and returns `{ generation_id: string, status: string }` so that API changes don't silently break the web app.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/contract/generate-post.contract.test.ts`
- [ ] Tests verify:
  1. Valid request with `jd_text` → 200/201 with `{ generation_id: string, status: string }`
  2. Valid request with `jd_url` → 200/201 with same shape
  3. Empty body → 400 with error message
  4. `jd_text` exceeding 50,000 chars → 400
  5. Invalid `market` value → 400
  6. Response `generation_id` is a non-empty string
  7. Response `status` is one of expected values
- [ ] Uses real Hono app with PGlite persistence

### Tasks

#### Task 1.1: Create contract test directory

```bash
mkdir -p apps/api/tests/contract
```

#### Task 1.2: Create shared test setup

**File:** `apps/api/tests/contract/setup.ts`

```typescript
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function setupContractEnv() {
  process.env.RETUNE_PERSIST = "pglite";
  process.env.RETUNE_PGLITE_DATADIR = await mkdtemp(join(tmpdir(), "retune-contract-"));
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-dummy";
  // Dev mode: no internal key required
  delete process.env.RETUNE_INTERNAL_API_KEY;
}

export function teardownContractEnv() {
  delete process.env.RETUNE_PERSIST;
  delete process.env.RETUNE_PGLITE_DATADIR;
}
```

#### Task 1.3: Create POST /generate contract test

**File:** `apps/api/tests/contract/generate-post.contract.test.ts`

```typescript
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { setupContractEnv, teardownContractEnv } from "./setup";

let app: Awaited<ReturnType<typeof import("../../src/app")>>["app"];

before(async () => {
  await setupContractEnv();
  const mod = await import("../../src/app");
  app = mod.app;
});

after(() => {
  teardownContractEnv();
});

test("contract: POST /generate with valid jd_text returns generation_id and status", async () => {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jd_text: "Software Engineer at Acme Corp. Requirements: 3+ years TypeScript.",
      market: "US",
    }),
  });

  assert.ok([200, 201, 202].includes(res.status), `Expected 2xx, got ${res.status}`);
  const body = await res.json();
  assert.ok(typeof body.generation_id === "string", "generation_id must be a string");
  assert.ok(body.generation_id.length > 0, "generation_id must be non-empty");
  assert.ok(typeof body.status === "string", "status must be a string");
});

test("contract: POST /generate with valid jd_url returns generation_id and status", async () => {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jd_url: "https://example.com/jobs/senior-engineer",
      market: "UK",
    }),
  });

  assert.ok([200, 201, 202].includes(res.status), `Expected 2xx, got ${res.status}`);
  const body = await res.json();
  assert.ok(typeof body.generation_id === "string");
  assert.ok(typeof body.status === "string");
});

test("contract: POST /generate with empty body returns 400", async () => {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error || body.message, "Error response must have error or message field");
});

test("contract: POST /generate with jd_text > 50000 chars returns 400", async () => {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jd_text: "x".repeat(50_001),
      market: "US",
    }),
  });

  assert.equal(res.status, 400);
});

test("contract: POST /generate with invalid market returns 400", async () => {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jd_text: "Valid job description text here.",
      market: "INVALID",
    }),
  });

  assert.equal(res.status, 400);
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 1.1 | Create directory | 1 min |
| 1.2 | Create shared setup | 10 min |
| 1.3 | Write POST contract tests | 30 min |
| 1.4 | Verify tests pass with PGlite | 20 min |

### Tests

```typescript
// Valid request assertions:
assert.ok([200, 201, 202].includes(res.status));
assert.ok(typeof body.generation_id === "string");
assert.ok(typeof body.status === "string");

// Invalid request assertions:
assert.equal(res.status, 400);
assert.ok(body.error || body.message);
```

---

## Story 2: Contract test for GET /generate/:id/stream (SSE)

### User Story

As a frontend developer, I want a contract test that verifies the SSE stream emits events with the expected `{ kind: 'trace' | 'done' | 'error', ... }` shape so that my event parser doesn't break silently.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/contract/generate-stream.contract.test.ts`
- [ ] Tests verify:
  1. Valid generation ID → response is `text/event-stream` content type
  2. SSE events have `data:` prefix with JSON payload
  3. Each parsed event has a `kind` field with value `'trace'`, `'done'`, or `'error'`
  4. `trace` events have a `payload` field
  5. `done` event has `generation_id` field
  6. Non-existent generation ID → stream emits an `error` event or returns 404
- [ ] Uses real Hono app with PGlite persistence

### Tasks

#### Task 2.1: Create SSE stream contract test

**File:** `apps/api/tests/contract/generate-stream.contract.test.ts`

```typescript
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { setupContractEnv, teardownContractEnv } from "./setup";

let app: Awaited<ReturnType<typeof import("../../src/app")>>["app"];

before(async () => {
  await setupContractEnv();
  const mod = await import("../../src/app");
  app = mod.app;
});

after(() => {
  teardownContractEnv();
});

async function createGeneration(): Promise<string> {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jd_text: "Software Engineer role requiring TypeScript and Node.js experience.",
      market: "US",
    }),
  });
  const body = await res.json();
  return body.generation_id;
}

function parseSSEEvents(text: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data:")) {
      try {
        const json = JSON.parse(line.slice(5).trim());
        events.push(json);
      } catch {
        // Skip non-JSON data lines
      }
    }
  }
  return events;
}

test("contract: GET /generate/:id/stream returns text/event-stream", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}/stream`);

  const contentType = res.headers.get("content-type") ?? "";
  assert.ok(
    contentType.includes("text/event-stream"),
    `Expected text/event-stream, got ${contentType}`,
  );
});

test("contract: SSE events have valid kind field", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}/stream`);
  const text = await res.text();
  const events = parseSSEEvents(text);

  const validKinds = new Set(["trace", "done", "error"]);
  for (const event of events) {
    assert.ok(
      typeof event.kind === "string" && validKinds.has(event.kind),
      `Event kind must be trace|done|error, got: ${event.kind}`,
    );
  }
});

test("contract: trace events have payload field", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}/stream`);
  const text = await res.text();
  const events = parseSSEEvents(text);

  const traceEvents = events.filter((e) => e.kind === "trace");
  for (const event of traceEvents) {
    assert.ok("payload" in event, "trace event must have payload field");
  }
});

test("contract: done event has generation_id field", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}/stream`);
  const text = await res.text();
  const events = parseSSEEvents(text);

  const doneEvents = events.filter((e) => e.kind === "done");
  for (const event of doneEvents) {
    assert.ok(
      typeof event.generation_id === "string",
      "done event must have generation_id string",
    );
  }
});

test("contract: non-existent generation returns error or 404", async () => {
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const res = await app.request(`/generate/${fakeId}/stream`);

  if (res.status === 404) {
    assert.equal(res.status, 404);
  } else {
    // Stream may emit an error event instead
    const text = await res.text();
    const events = parseSSEEvents(text);
    const errorEvents = events.filter((e) => e.kind === "error");
    assert.ok(errorEvents.length > 0, "Expected error event for non-existent generation");
  }
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 2.1 | Write SSE contract tests | 40 min |
| 2.2 | Handle async stream consumption in test | 20 min |
| 2.3 | Verify tests pass with real generation | 15 min |

### Tests

```typescript
// Content type:
assert.ok(contentType.includes("text/event-stream"));
// Event shape:
assert.ok(validKinds.has(event.kind));
// Trace payload:
assert.ok("payload" in event);
// Done generation_id:
assert.ok(typeof event.generation_id === "string");
```

---

## Story 3: Contract test for GET /generate/:id

### User Story

As a frontend developer, I want a contract test that verifies `GET /generate/:id` returns the expected result shape `{ resume, cover_letter, strategy }` so that the results page renders correctly.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/contract/generate-get.contract.test.ts`
- [ ] Tests verify:
  1. Valid generation ID → 200 with `{ resume: string | null, cover_letter: string | null, strategy: string | null }`
  2. Response has `generation_id` field matching the requested ID
  3. Response has `status` field
  4. Non-existent generation ID → 404
  5. Invalid ID format (not UUID) → 400 or 404
- [ ] Uses real Hono app with PGlite persistence

### Tasks

#### Task 3.1: Create GET /generate/:id contract test

**File:** `apps/api/tests/contract/generate-get.contract.test.ts`

```typescript
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { setupContractEnv, teardownContractEnv } from "./setup";

let app: Awaited<ReturnType<typeof import("../../src/app")>>["app"];

before(async () => {
  await setupContractEnv();
  const mod = await import("../../src/app");
  app = mod.app;
});

after(() => {
  teardownContractEnv();
});

async function createGeneration(): Promise<string> {
  const res = await app.request("/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jd_text: "Product Manager at TechCo. 5+ years experience required.",
      market: "US",
    }),
  });
  const body = await res.json();
  return body.generation_id;
}

test("contract: GET /generate/:id returns result shape", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}`);

  assert.equal(res.status, 200);
  const body = await res.json();

  // resume, cover_letter, strategy must exist as keys (nullable)
  assert.ok("resume" in body, "response must have resume field");
  assert.ok("cover_letter" in body, "response must have cover_letter field");
  assert.ok("strategy" in body, "response must have strategy field");

  // Each is string or null
  assert.ok(
    body.resume === null || typeof body.resume === "string",
    "resume must be string | null",
  );
  assert.ok(
    body.cover_letter === null || typeof body.cover_letter === "string",
    "cover_letter must be string | null",
  );
  assert.ok(
    body.strategy === null || typeof body.strategy === "string",
    "strategy must be string | null",
  );
});

test("contract: GET /generate/:id has generation_id matching request", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.generation_id, generationId);
});

test("contract: GET /generate/:id has status field", async () => {
  const generationId = await createGeneration();
  const res = await app.request(`/generate/${generationId}`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.status === "string", "status must be a string");
});

test("contract: GET /generate/:id with non-existent ID returns 404", async () => {
  const fakeId = "99999999-aaaa-bbbb-cccc-dddddddddddd";
  const res = await app.request(`/generate/${fakeId}`);
  assert.equal(res.status, 404);
});

test("contract: GET /generate/:id with invalid format returns 400 or 404", async () => {
  const res = await app.request("/generate/not-a-valid-uuid");
  assert.ok([400, 404].includes(res.status), `Expected 400 or 404, got ${res.status}`);
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 3.1 | Write GET contract tests | 25 min |
| 3.2 | Verify response shape matches ApiClient expectations | 10 min |
| 3.3 | Run and verify all 5 assertions pass | 10 min |

### Tests

```typescript
// Shape assertions:
assert.ok("resume" in body);
assert.ok("cover_letter" in body);
assert.ok("strategy" in body);
assert.ok(body.resume === null || typeof body.resume === "string");

// ID match:
assert.equal(body.generation_id, generationId);

// Not found:
assert.equal(res.status, 404);
```

---

## Story 4: Contract test for GET /health

### User Story

As a frontend developer, I want a contract test that verifies `GET /health` returns `{ status: 'ok', timestamp: string }` so that my health check polling works reliably.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/contract/health.contract.test.ts`
- [ ] Tests verify:
  1. `GET /health` → 200
  2. Response has `status` field equal to `'ok'`
  3. Response has `timestamp` field that is a valid ISO 8601 string
  4. No authentication required (no headers needed)
- [ ] Uses real Hono app

### Tasks

#### Task 4.1: Create health contract test

**File:** `apps/api/tests/contract/health.contract.test.ts`

```typescript
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { setupContractEnv, teardownContractEnv } from "./setup";

let app: Awaited<ReturnType<typeof import("../../src/app")>>["app"];

before(async () => {
  await setupContractEnv();
  const mod = await import("../../src/app");
  app = mod.app;
});

after(() => {
  teardownContractEnv();
});

test("contract: GET /health returns 200", async () => {
  const res = await app.request("/health");
  assert.equal(res.status, 200);
});

test("contract: GET /health has status 'ok'", async () => {
  const res = await app.request("/health");
  const body = await res.json();
  assert.equal(body.status, "ok");
});

test("contract: GET /health has valid ISO timestamp", async () => {
  const res = await app.request("/health");
  const body = await res.json();

  assert.ok(typeof body.timestamp === "string", "timestamp must be a string");
  const parsed = new Date(body.timestamp);
  assert.ok(!Number.isNaN(parsed.getTime()), "timestamp must be valid ISO 8601");
});

test("contract: GET /health requires no authentication", async () => {
  // No headers at all — should still work
  const res = await app.request("/health", { headers: {} });
  assert.equal(res.status, 200);
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 4.1 | Write health contract tests | 10 min |
| 4.2 | Verify tests pass | 5 min |

### Tests

```typescript
assert.equal(res.status, 200);
assert.equal(body.status, "ok");
assert.ok(typeof body.timestamp === "string");
assert.ok(!Number.isNaN(new Date(body.timestamp).getTime()));
```

---

## Story 5: Add contract tests to CI

### User Story

As a maintainer, I want contract tests to run in the `test-ts` CI job so that breaking API changes are caught before merge.

### Acceptance Criteria

- [ ] Contract tests are included in the `test-ts` job in `cognitive-cycle.yml`
- [ ] A breaking change to a response shape (e.g., renaming `generation_id` to `id`) causes CI failure
- [ ] Contract tests run after the existing API smoke tests

### Tasks

#### Task 5.1: Add contract test step to cognitive-cycle.yml

**File:** `.github/workflows/cognitive-cycle.yml`

Add after the `api smoke` step in the `test-ts` job:

```yaml
      - name: api contract tests
        run: pnpm --filter @retune/api exec tsx --test tests/contract/*.contract.test.ts
```

#### Task 5.2: Update apps/api/package.json with contract test script

**File:** `apps/api/package.json`

Add to `"scripts"`:

```json
"test:contract": "tsx --test tests/contract/*.contract.test.ts"
```

#### Task 5.3: Verify CI integration

- Push a branch with the contract tests
- Verify the `test-ts` job runs contract tests
- Temporarily break a response shape → verify CI fails
- Revert → verify CI passes

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 5.1 | Add CI step | 5 min |
| 5.2 | Add package.json script | 2 min |
| 5.3 | Verify in a real PR | 20 min |

### Tests

- CI `test-ts` job includes contract test step
- Breaking change to response shape → CI red
- Correct response shape → CI green

---

## Implementation Order

1. Story 1 (POST /generate) — establishes shared setup and pattern
2. Stories 2–4 (remaining routes) — follow the same pattern, can be parallelized
3. Story 5 (CI integration) — depends on all contract tests existing

## Total Effort Estimate

| Story | Effort |
|-------|--------|
| 1. POST /generate contract | 1h 10min |
| 2. SSE stream contract | 1h 15min |
| 3. GET /generate/:id contract | 45 min |
| 4. GET /health contract | 15 min |
| 5. CI integration | 30 min |
| **Total** | **~4 hours** |

## Design Decisions

1. **Real Hono app, not mocked routes** — Contract tests must exercise the actual middleware stack (CORS, auth, validation) to catch real integration issues. Mocking routes would only test our assumptions.

2. **PGlite for persistence** — Avoids requiring a running Postgres instance in CI. PGlite is already proven in the existing `schema-contract.test.ts` and API smoke tests.

3. **No HTTP server needed** — Hono's `app.request()` method allows testing without binding to a port, eliminating port conflicts and startup latency in CI.

4. **Consumer-driven shape assertions** — Tests assert the exact fields that `apps/web/src/lib/api-client.ts` reads. If the API adds fields, tests still pass. If the API removes or renames fields the client uses, tests fail.

5. **Separate from unit tests** — Contract tests live in `tests/contract/` to distinguish them from unit/integration tests. They can be run independently via `pnpm test:contract`.
