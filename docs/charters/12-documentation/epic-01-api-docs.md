# Epic 01 — API Documentation (OpenAPI + Swagger UI)

## Goal

Generate a machine-readable OpenAPI 3.0 specification from the Hono route definitions and serve an interactive Swagger UI, so that frontend developers, integrators, and automated tools can discover and test all API endpoints without reading source code.

---

## Story 1: Install OpenAPI Dependencies

### User Story

As a **backend developer**, I want `@hono/zod-openapi` and `@hono/swagger-ui` installed in `apps/api` so that I can define typed, self-documenting routes.

### Acceptance Criteria

- [ ] `@hono/zod-openapi` is listed in `apps/api/package.json` dependencies
- [ ] `@hono/swagger-ui` is listed in `apps/api/package.json` dependencies
- [ ] `pnpm install` completes without errors
- [ ] `pnpm typecheck` passes with no new errors

### Tasks

#### Task 1.1: Add dependencies

**File:** `apps/api/package.json`

```bash
pnpm --filter @retune/api add @hono/zod-openapi @hono/swagger-ui
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Run install command | 2 min |
| 1.1.2 | Verify `package.json` updated | 1 min |
| 1.1.3 | Run `pnpm typecheck` | 2 min |

### Tests

```bash
# Verify packages are installed
pnpm --filter @retune/api ls @hono/zod-openapi @hono/swagger-ui
# Expected: both packages listed with versions
```

---

## Story 2: Refactor Generate Route to OpenAPI Route Definitions

### User Story

As a **backend developer**, I want the `/v1/generate` route defined using `createRoute` from `@hono/zod-openapi` so that the route's request/response schemas are automatically included in the OpenAPI spec.

### Acceptance Criteria

- [ ] `apps/api/src/routes/generate.ts` uses `createRoute` from `@hono/zod-openapi`
- [ ] Request body schema is defined with Zod and referenced in the route
- [ ] Response schemas for 202, 400, 401, 429 are defined and referenced
- [ ] All existing tests for the generate endpoint continue to pass
- [ ] `pnpm typecheck` passes

### Tasks

#### Task 2.1: Create OpenAPI route definition

**File:** `apps/api/src/routes/generate.ts`

```typescript
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

const GenerateRequestSchema = z.object({
  jobDescription: z.string().min(1).openapi({ description: 'The job description text to tailor the resume for' }),
  resumeId: z.string().uuid().optional().openapi({ description: 'Existing resume ID to refine' }),
  profileId: z.string().uuid().openapi({ description: 'User profile ID' }),
}).openapi('GenerateRequest');

const GenerateResponseSchema = z.object({
  id: z.string().uuid().openapi({ description: 'Generation ID for polling/streaming' }),
  status: z.enum(['queued', 'running']).openapi({ description: 'Initial generation status' }),
}).openapi('GenerateResponse');

const ErrorSchema = z.object({
  error: z.string().openapi({ description: 'Error message' }),
  code: z.string().optional().openapi({ description: 'Machine-readable error code' }),
}).openapi('Error');

const generateRoute = createRoute({
  method: 'post',
  path: '/v1/generate',
  tags: ['Generation'],
  summary: 'Start a resume generation',
  description: 'Initiates a cognitive generation pipeline for the given job description and profile.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: GenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Generation started successfully',
      content: { 'application/json': { schema: GenerateResponseSchema } },
    },
    400: {
      description: 'Invalid request body',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    401: {
      description: 'Unauthorized — missing or invalid auth token',
      content: { 'application/json': { schema: ErrorSchema } },
    },
    429: {
      description: 'Rate limited — too many requests or insufficient credits',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
});
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Define Zod schemas with `.openapi()` annotations | 15 min |
| 2.1.2 | Create `generateRoute` using `createRoute` | 10 min |
| 2.1.3 | Refactor handler to use `app.openapi(generateRoute, handler)` | 20 min |
| 2.1.4 | Repeat for `GET /v1/generate/:id`, `GET /v1/generate/:id/stream`, `DELETE /v1/generate/:id` | 30 min |
| 2.1.5 | Run existing tests, fix any regressions | 15 min |

### Tests

```typescript
// apps/api/src/routes/generate.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../app.js';

describe('POST /v1/generate - OpenAPI route', () => {
  it('returns 400 for invalid body with structured error', async () => {
    const res = await app.request('/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('returns 401 without auth header', async () => {
    const res = await app.request('/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDescription: 'test', profileId: '00000000-0000-0000-0000-000000000000' }),
    });
    assert.strictEqual(res.status, 401);
  });
});
```

---

## Story 3: Serve OpenAPI JSON at GET /openapi.json

### User Story

As an **API consumer**, I want to fetch the full OpenAPI specification at `GET /openapi.json` so that I can import it into Postman, generate client SDKs, or validate against it in CI.

### Acceptance Criteria

- [ ] `GET /openapi.json` returns HTTP 200 with `Content-Type: application/json`
- [ ] Response body is valid OpenAPI 3.0 JSON
- [ ] All routes defined with `createRoute` appear in `paths`
- [ ] Info block contains title "Retune API", version from `package.json`

### Tasks

#### Task 3.1: Configure OpenAPI document generation

**File:** `apps/api/src/app.ts`

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';

const app = new OpenAPIHono();

// ... register all routes ...

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Retune API',
    version: '1.0.0',
    description: 'Cognitive resume generation API',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local development' },
  ],
});
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Change `new Hono()` to `new OpenAPIHono()` in `apps/api/src/app.ts` | 5 min |
| 3.1.2 | Add `app.doc('/openapi.json', {...})` configuration | 5 min |
| 3.1.3 | Verify all route registrations use `.openapi()` method | 10 min |
| 3.1.4 | Test endpoint manually with `curl` | 2 min |

### Tests

```typescript
// apps/api/src/routes/openapi.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../app.js';

describe('GET /openapi.json', () => {
  it('returns valid OpenAPI 3.0 JSON', async () => {
    const res = await app.request('/openapi.json');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'application/json');

    const spec = await res.json();
    assert.strictEqual(spec.openapi, '3.0.0');
    assert.strictEqual(spec.info.title, 'Retune API');
    assert.ok(spec.paths);
  });

  it('documents all generation routes', async () => {
    const res = await app.request('/openapi.json');
    const spec = await res.json();

    assert.ok(spec.paths['/v1/generate'], 'POST /v1/generate is documented');
    assert.ok(spec.paths['/v1/generate/{id}'], 'GET /v1/generate/:id is documented');
    assert.ok(spec.paths['/v1/generate/{id}/stream'], 'GET /v1/generate/:id/stream is documented');
  });

  it('includes request and response schemas', async () => {
    const res = await app.request('/openapi.json');
    const spec = await res.json();

    const postGenerate = spec.paths['/v1/generate'].post;
    assert.ok(postGenerate.requestBody.content['application/json'].schema);
    assert.ok(postGenerate.responses['202']);
    assert.ok(postGenerate.responses['400']);
    assert.ok(postGenerate.responses['401']);
    assert.ok(postGenerate.responses['429']);
  });
});
```

---

## Story 4: Serve Swagger UI at GET /docs

### User Story

As an **API consumer**, I want an interactive Swagger UI at `GET /docs` so that I can explore and test API endpoints directly in the browser.

### Acceptance Criteria

- [ ] `GET /docs` returns HTTP 200 with HTML content
- [ ] The HTML page renders Swagger UI pointing at `/openapi.json`
- [ ] UI is accessible without authentication

### Tasks

#### Task 4.1: Add Swagger UI middleware

**File:** `apps/api/src/app.ts`

```typescript
import { swaggerUI } from '@hono/swagger-ui';

app.get('/docs', swaggerUI({ url: '/openapi.json' }));
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 4.1.1 | Import `swaggerUI` from `@hono/swagger-ui` | 1 min |
| 4.1.2 | Register `GET /docs` route | 2 min |
| 4.1.3 | Verify in browser at `http://localhost:4000/docs` | 2 min |

### Tests

```typescript
// apps/api/src/routes/docs.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert';
import app from '../app.js';

describe('GET /docs', () => {
  it('returns Swagger UI HTML', async () => {
    const res = await app.request('/docs');
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type');
    assert.ok(contentType?.includes('text/html'));
    const body = await res.text();
    assert.ok(body.includes('swagger-ui'));
  });
});
```

---

## Story 5: CI Validation of OpenAPI Spec

### User Story

As a **maintainer**, I want CI to validate that the OpenAPI spec is complete and valid on every PR so that documentation never drifts from the implementation.

### Acceptance Criteria

- [ ] CI runs a test that fetches `/openapi.json` and validates it against OpenAPI 3.0 schema
- [ ] Test fails if any route registered with `createRoute` is missing from the spec
- [ ] Test is included in the standard `pnpm test` run for `apps/api`

### Tasks

#### Task 5.1: Add OpenAPI validation test

**File:** `apps/api/src/routes/openapi.test.ts` (extend from Story 3)

```typescript
it('spec contains no empty paths', async () => {
  const res = await app.request('/openapi.json');
  const spec = await res.json();
  const paths = Object.keys(spec.paths);
  assert.ok(paths.length > 0, 'OpenAPI spec must have at least one path');

  for (const path of paths) {
    const methods = Object.keys(spec.paths[path]);
    assert.ok(methods.length > 0, `Path ${path} must have at least one method`);
  }
});
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 5.1.1 | Add completeness assertions to existing test file | 10 min |
| 5.1.2 | Run `pnpm --filter @retune/api test` and verify pass | 2 min |

### Tests

```bash
# CI command (already part of pnpm test)
pnpm --filter @retune/api test
# Expected: all OpenAPI tests pass, exit 0
```

---

## Total Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: Install dependencies | 5 min |
| Story 2: Refactor generate route | 1.5 hr |
| Story 3: OpenAPI JSON endpoint | 30 min |
| Story 4: Swagger UI | 10 min |
| Story 5: CI validation | 15 min |
| **Total** | **~2.5 hr** |
