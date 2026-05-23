# Epic 01 — API Versioning

## Summary

Add `/v1/` prefix to all API routes, keep `/health` unversioned, add deprecation headers to legacy unversioned paths that redirect to `/v1/`, and update the web client to use the new prefix.

## Stories

---

### Story 1: Mount All Routes Under /v1/

**As a** developer consuming the Retune API  
**I want** all routes versioned under `/v1/`  
**So that** I can rely on stable contracts and migrate gracefully when v2 ships  

#### Acceptance Criteria

- [ ] All generation routes are accessible at `/v1/generate`, `/v1/generate/:id/stream`, `/v1/generate/:id`, `/v1/generate/:id/*`
- [ ] `/health` remains at root (no `/v1/health`)
- [ ] `POST /v1/generate` returns `202 Accepted`
- [ ] App starts without errors after route restructuring

#### Tasks

**Task 1.1: Update main.ts to mount routes under /v1/**  
File: `apps/api/src/main.ts`  
Effort: 1 hour

```typescript
// Before:
// app.route('/', generate_routes(registry));
// app.route('/', stream_routes(registry));

// After:
app.route('/v1', generate_routes(registry));
app.route('/v1', stream_routes(registry));
// ... all other routes except health

// Health stays at root
app.get('/health', (c) => c.json({ status: 'ok' }));
```

**Task 1.2: Verify all route files use relative paths**  
Files: `apps/api/src/routes/*.ts`  
Effort: 30 minutes

Ensure route handlers define paths like `/generate` (not `/v1/generate`) so the prefix is applied by the mount point.

#### Tests

File: `apps/api/src/routes/__tests__/versioning.test.ts`  
Effort: 1 hour

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { app } from '../../main';

describe('API versioning', () => {
  it('POST /v1/generate returns 202', async () => {
    const res = await app.request('/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({ resumeId: 'test-id', jobDescription: 'test' }),
    });

    assert.strictEqual(res.status, 202);
  });

  it('GET /health returns 200 (unversioned)', async () => {
    const res = await app.request('/health');
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
  });

  it('GET /v1/health returns 404 (health is not versioned)', async () => {
    const res = await app.request('/v1/health');
    assert.strictEqual(res.status, 404);
  });
});
```

---

### Story 2: Add Deprecation Redirects for Legacy Routes

**As a** developer using the old unversioned API  
**I want** to receive a `301` redirect with `Deprecation` and `Sunset` headers  
**So that** I know to update my integration to `/v1/`  

#### Acceptance Criteria

- [ ] `POST /generate` returns `301` with `Location: /v1/generate`
- [ ] Response includes `Deprecation: true` header
- [ ] Response includes `Sunset: 2026-09-01T00:00:00Z` header (3 months from now)
- [ ] All legacy routes (`/generate`, `/generate/:id`, `/generate/:id/stream`, `/generate/:id/*`) redirect
- [ ] Redirect preserves the HTTP method context via `308` for non-GET (permanent redirect preserving method)

#### Tasks

**Task 2.1: Add legacy redirect middleware**  
File: `apps/api/src/middleware/legacy-redirect.ts`  
Effort: 1 hour

```typescript
import { Hono } from 'hono';

const SUNSET_DATE = '2026-09-01T00:00:00Z';

export function legacyRedirect(app: Hono) {
  // Redirect all non-versioned generation routes
  app.all('/generate', (c) => {
    const newUrl = `/v1/generate`;
    c.header('Deprecation', 'true');
    c.header('Sunset', SUNSET_DATE);
    c.header('Location', newUrl);
    return c.body(null, 308);
  });

  app.all('/generate/:id', (c) => {
    const id = c.req.param('id');
    c.header('Deprecation', 'true');
    c.header('Sunset', SUNSET_DATE);
    c.header('Location', `/v1/generate/${id}`);
    return c.body(null, 308);
  });

  app.all('/generate/:id/stream', (c) => {
    const id = c.req.param('id');
    c.header('Deprecation', 'true');
    c.header('Sunset', SUNSET_DATE);
    c.header('Location', `/v1/generate/${id}/stream`);
    return c.body(null, 308);
  });

  app.all('/generate/:id/*', (c) => {
    const id = c.req.param('id');
    const rest = c.req.path.split(`/generate/${id}/`)[1];
    c.header('Deprecation', 'true');
    c.header('Sunset', SUNSET_DATE);
    c.header('Location', `/v1/generate/${id}/${rest}`);
    return c.body(null, 308);
  });
}
```

**Task 2.2: Register legacy redirects in main.ts**  
File: `apps/api/src/main.ts`  
Effort: 15 minutes

```typescript
import { legacyRedirect } from './middleware/legacy-redirect';
// After mounting /v1 routes:
legacyRedirect(app);
```

#### Tests

File: `apps/api/src/routes/__tests__/versioning.test.ts` (append)  
Effort: 1 hour

```typescript
describe('Legacy route deprecation', () => {
  it('POST /generate returns 308 redirect to /v1/generate', async () => {
    const res = await app.request('/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testToken}`,
      },
      body: JSON.stringify({ resumeId: 'test-id', jobDescription: 'test' }),
      redirect: 'manual',
    });

    assert.strictEqual(res.status, 308);
    assert.strictEqual(res.headers.get('Location'), '/v1/generate');
    assert.strictEqual(res.headers.get('Deprecation'), 'true');
    assert.strictEqual(res.headers.get('Sunset'), '2026-09-01T00:00:00Z');
  });

  it('GET /generate/:id returns 308 redirect to /v1/generate/:id', async () => {
    const res = await app.request('/generate/some-id', {
      method: 'GET',
      redirect: 'manual',
    });

    assert.strictEqual(res.status, 308);
    assert.strictEqual(res.headers.get('Location'), '/v1/generate/some-id');
  });

  it('GET /generate/:id/stream returns 308 redirect', async () => {
    const res = await app.request('/generate/some-id/stream', {
      method: 'GET',
      redirect: 'manual',
    });

    assert.strictEqual(res.status, 308);
    assert.strictEqual(res.headers.get('Location'), '/v1/generate/some-id/stream');
  });
});
```

---

### Story 3: Update Web Client to Use /v1/ Prefix

**As a** frontend developer  
**I want** the API client to use `/v1/` prefix  
**So that** the web app uses the canonical versioned endpoints  

#### Acceptance Criteria

- [ ] `apps/web/src/lib/api-client.ts` prepends `/v1/` to all API calls
- [ ] All existing functionality works without regression
- [ ] No hardcoded unversioned paths remain in the web app's API layer

#### Tasks

**Task 3.1: Update api-client.ts base path**  
File: `apps/web/src/lib/api-client.ts`  
Effort: 30 minutes

```typescript
// Before:
// const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// After:
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/v1`;
```

**Task 3.2: Verify no other files use unversioned API paths**  
Effort: 15 minutes

Grep `apps/web/src/` for direct fetch calls to the API without `/v1/` prefix and update any found.

#### Tests

File: `apps/web/src/__tests__/api-client.test.ts`  
Effort: 30 minutes

```typescript
import { describe, it, expect } from 'vitest';
import { apiClient } from '../lib/api-client';

describe('API client', () => {
  it('prepends /v1/ to all requests', () => {
    // Verify the base URL includes /v1
    expect(apiClient.baseUrl).toContain('/v1');
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Mount Routes Under /v1/ | 2.5 hours |
| Story 2: Deprecation Redirects | 2.25 hours |
| Story 3: Update Web Client | 1.25 hours |
| **Total** | **~6 hours** |

## Dependencies

- All existing API route files in `apps/api/src/routes/`
- `apps/web/src/lib/api-client.ts`

## Risks

- Breaking existing integrations — mitigated by 308 redirects with 3-month sunset period
- Route ordering: legacy catch-all routes must be registered after `/v1` routes to avoid conflicts
