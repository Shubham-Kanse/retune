# Epic 03 — Error Tracking

## Goal

Implement production error tracking via Sentry in both apps/web (Next.js) and apps/api (Hono) so that unhandled exceptions, React rendering errors, and API failures are captured with full context, source maps, and user attribution.

---

## Story 1: Install and Configure Sentry in apps/web

**As a** frontend engineer, **I want** Sentry integrated into the Next.js app **so that** client-side errors, server-side errors, and edge errors are automatically captured with source maps and user context.

### Acceptance Criteria

- [ ] `@sentry/nextjs` is listed in `apps/web/package.json` dependencies.
- [ ] `apps/web/sentry.client.config.ts` exists and initializes Sentry for the browser.
- [ ] `apps/web/sentry.server.config.ts` exists and initializes Sentry for Node.js server.
- [ ] `apps/web/sentry.edge.config.ts` exists and initializes Sentry for edge runtime.
- [ ] DSN is read from `NEXT_PUBLIC_SENTRY_DSN` env var.
- [ ] When DSN is not set, Sentry is disabled (no errors thrown).
- [ ] Source maps are uploaded during build via `withSentryConfig`.
- [ ] Environment is set from `NEXT_PUBLIC_VERCEL_ENV` or `NODE_ENV`.

### Tasks

#### Task 1.1: Install @sentry/nextjs

```bash
pnpm --filter @retune/web add @sentry/nextjs
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.1.1 | Run install command | 5 min |
| 1.1.2 | Verify in `apps/web/package.json` | 2 min |

#### Task 1.2: Create sentry.client.config.ts

**File:** `apps/web/sentry.client.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.2.1 | Create file with Sentry.init call | 10 min |
| 1.2.2 | Configure replay and tracing integrations | 5 min |
| 1.2.3 | Set enabled flag based on DSN presence | 5 min |

#### Task 1.3: Create sentry.server.config.ts

**File:** `apps/web/sentry.server.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.3.1 | Create file with server-side Sentry.init | 10 min |

#### Task 1.4: Create sentry.edge.config.ts

**File:** `apps/web/sentry.edge.config.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.4.1 | Create file with edge Sentry.init | 10 min |

#### Task 1.5: Write unit tests

**File:** `apps/web/src/lib/sentry.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('Sentry configuration files', () => {
  it('sentry.client.config.ts should exist', async () => {
    const fs = await import('node:fs');
    const exists = fs.existsSync('sentry.client.config.ts');
    expect(exists).toBe(true);
  });

  it('sentry.server.config.ts should exist', async () => {
    const fs = await import('node:fs');
    const exists = fs.existsSync('sentry.server.config.ts');
    expect(exists).toBe(true);
  });

  it('sentry.edge.config.ts should exist', async () => {
    const fs = await import('node:fs');
    const exists = fs.existsSync('sentry.edge.config.ts');
    expect(exists).toBe(true);
  });

  it('client config should not throw when DSN is undefined', async () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    await expect(
      import('../../sentry.client.config')
    ).resolves.not.toThrow();
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 1.5.1 | Write test: config files exist | 10 min |
| 1.5.2 | Write test: no throw without DSN | 10 min |

---

## Story 2: Wrap Next.js Config with Sentry

**As a** frontend engineer, **I want** `next.config.ts` wrapped with `withSentryConfig` **so that** source maps are uploaded to Sentry during builds and errors are properly symbolicated.

### Acceptance Criteria

- [ ] `apps/web/next.config.ts` exports the config wrapped with `withSentryConfig`.
- [ ] Source maps are uploaded only when `SENTRY_AUTH_TOKEN` is set.
- [ ] `widenClientFileUpload` is enabled for better stack traces.
- [ ] `hideSourceMaps` is `true` in production (source maps not served to clients).
- [ ] Build succeeds without `SENTRY_AUTH_TOKEN` (skips upload).

### Tasks

#### Task 2.1: Update next.config.ts

**File:** `apps/web/next.config.ts`

```typescript
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  // ...existing config
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.1.1 | Import `withSentryConfig` | 5 min |
| 2.1.2 | Wrap existing config export | 10 min |
| 2.1.3 | Configure source map options | 5 min |
| 2.1.4 | Verify build succeeds without SENTRY_AUTH_TOKEN | 10 min |

#### Task 2.2: Write build verification test

**File:** `apps/web/src/lib/next-config.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('next.config.ts Sentry integration', () => {
  it('should contain withSentryConfig wrapper', () => {
    const content = fs.readFileSync('next.config.ts', 'utf-8');
    expect(content).toContain('withSentryConfig');
  });

  it('should set hideSourceMaps to true', () => {
    const content = fs.readFileSync('next.config.ts', 'utf-8');
    expect(content).toContain('hideSourceMaps: true');
  });

  it('should read authToken from environment', () => {
    const content = fs.readFileSync('next.config.ts', 'utf-8');
    expect(content).toContain('process.env.SENTRY_AUTH_TOKEN');
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 2.2.1 | Write test: withSentryConfig present | 5 min |
| 2.2.2 | Write test: hideSourceMaps enabled | 5 min |
| 2.2.3 | Write test: authToken from env | 5 min |

---

## Story 3: Replace Error Tracker Stub with Sentry Calls

**As a** frontend engineer, **I want** the `error-tracker.ts` stub replaced with real Sentry calls **so that** all error reporting in the app goes through Sentry instead of console.log.

### Acceptance Criteria

- [ ] `apps/web/src/lib/error-tracker.ts` calls `Sentry.captureException()` for errors.
- [ ] `apps/web/src/lib/error-tracker.ts` calls `Sentry.captureMessage()` for warnings.
- [ ] User context is set via `Sentry.setUser()` when available.
- [ ] The exported API surface remains the same (no breaking changes to callers).
- [ ] Zero `console.log` calls remain in the file.
- [ ] `apps/web/src/app/global-error.tsx` reports to Sentry.

### Tasks

#### Task 3.1: Rewrite error-tracker.ts

**File:** `apps/web/src/lib/error-tracker.ts`

```typescript
import * as Sentry from '@sentry/nextjs';

export function captureError(error: Error, context?: Record<string, unknown>): void {
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string } | null): void {
  Sentry.setUser(user);
}

export function addBreadcrumb(message: string, category?: string): void {
  Sentry.addBreadcrumb({ message, category, level: 'info' });
}
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.1.1 | Replace file contents with Sentry calls | 15 min |
| 3.1.2 | Maintain same export names for backward compatibility | 5 min |
| 3.1.3 | Remove all `console.log` calls | 5 min |

#### Task 3.2: Update global-error.tsx

**File:** `apps/web/src/app/global-error.tsx`

```typescript
'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <h2>Something went wrong!</h2>
        <button onClick={() => reset()}>Try again</button>
      </body>
    </html>
  );
}
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.2.1 | Add Sentry.captureException in useEffect | 10 min |
| 3.2.2 | Keep existing UI rendering | 5 min |

#### Task 3.3: Write unit tests

**File:** `apps/web/src/lib/error-tracker.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { captureError, captureMessage, setUser, addBreadcrumb } from './error-tracker';

describe('error-tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captureError should call Sentry.captureException', () => {
    const error = new Error('test error');
    captureError(error, { page: '/home' });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: { page: '/home' },
    });
  });

  it('captureMessage should call Sentry.captureMessage', () => {
    captureMessage('test warning', 'warning');
    expect(Sentry.captureMessage).toHaveBeenCalledWith('test warning', 'warning');
  });

  it('setUser should call Sentry.setUser', () => {
    setUser({ id: 'user-1', email: 'test@example.com' });
    expect(Sentry.setUser).toHaveBeenCalledWith({
      id: 'user-1',
      email: 'test@example.com',
    });
  });

  it('setUser(null) should clear user context', () => {
    setUser(null);
    expect(Sentry.setUser).toHaveBeenCalledWith(null);
  });

  it('addBreadcrumb should call Sentry.addBreadcrumb', () => {
    addBreadcrumb('clicked button', 'ui');
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      message: 'clicked button',
      category: 'ui',
      level: 'info',
    });
  });

  it('should not contain console.log', async () => {
    const fs = await import('node:fs');
    const content = fs.readFileSync(
      new URL('./error-tracker.ts', import.meta.url),
      'utf-8'
    );
    expect(content).not.toContain('console.log');
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 3.3.1 | Write test: captureError calls Sentry.captureException | 10 min |
| 3.3.2 | Write test: captureMessage calls Sentry.captureMessage | 5 min |
| 3.3.3 | Write test: setUser calls Sentry.setUser | 5 min |
| 3.3.4 | Write test: setUser(null) clears context | 5 min |
| 3.3.5 | Write test: addBreadcrumb calls Sentry.addBreadcrumb | 5 min |
| 3.3.6 | Write test: no console.log in file | 5 min |

---

## Story 4: Install and Configure Sentry in apps/api

**As a** backend engineer, **I want** Sentry integrated into the Hono API service **so that** unhandled exceptions and API errors are captured with request context and user attribution.

### Acceptance Criteria

- [ ] `@sentry/node` is listed in `apps/api/package.json` dependencies.
- [ ] Sentry is initialized in `apps/api/src/main.ts` before route registration.
- [ ] DSN is read from `SENTRY_DSN` env var.
- [ ] When DSN is not set, Sentry is disabled.
- [ ] Unhandled exceptions in route handlers are captured by Sentry.
- [ ] Sentry events include `requestId` and `userId` context.
- [ ] Sentry is flushed on graceful shutdown.

### Tasks

#### Task 4.1: Install @sentry/node

```bash
pnpm --filter @retune/api add @sentry/node
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.1.1 | Run install command | 5 min |
| 4.1.2 | Verify in `apps/api/package.json` | 2 min |

#### Task 4.2: Initialize Sentry in main.ts

**File:** `apps/api/src/main.ts`

Add after telemetry init, before Hono app creation:

```typescript
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 1.0,
  });
}
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.2.1 | Import Sentry | 2 min |
| 4.2.2 | Add conditional init block | 10 min |
| 4.2.3 | Configure environment and sample rate | 5 min |

#### Task 4.3: Add Sentry error handler middleware

**File:** `apps/api/src/middleware/sentry-error-handler.ts`

```typescript
import { createMiddleware } from 'hono/factory';
import * as Sentry from '@sentry/node';

export const sentryErrorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setExtra('requestId', c.get('requestId'));
      scope.setUser({ id: c.get('userId') || 'anonymous' });
      scope.setExtra('method', c.req.method);
      scope.setExtra('path', c.req.path);
      Sentry.captureException(error);
    });
    throw error; // Re-throw so Hono's error handler still runs
  }
});
```

Register in `apps/api/src/main.ts`:

```typescript
import { sentryErrorHandler } from './middleware/sentry-error-handler.js';

app.use('*', sentryErrorHandler);
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.3.1 | Create error handler middleware | 15 min |
| 4.3.2 | Set request context (requestId, userId, path) | 10 min |
| 4.3.3 | Register middleware in main.ts | 5 min |
| 4.3.4 | Ensure error is re-thrown after capture | 5 min |

#### Task 4.4: Add Sentry flush on shutdown

**File:** `apps/api/src/main.ts`

Update the SIGTERM handler:

```typescript
process.on('SIGTERM', async () => {
  await Sentry.close(2000);
  await shutdownTelemetry();
  process.exit(0);
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.4.1 | Add `Sentry.close()` to shutdown handler | 5 min |

#### Task 4.5: Write unit tests

**File:** `apps/api/src/middleware/sentry-error-handler.test.ts`

```typescript
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';

describe('sentryErrorHandler', () => {
  it('should capture exception and re-throw', async () => {
    const mockCaptureException = mock.fn();
    const mockWithScope = mock.fn((cb) => cb({ setExtra: mock.fn(), setUser: mock.fn() }));

    // Mock Sentry module
    mock.module('@sentry/node', {
      namedExports: {
        captureException: mockCaptureException,
        withScope: mockWithScope,
      },
    });

    const { sentryErrorHandler } = await import('./sentry-error-handler.js');

    const app = new Hono();
    app.use('*', sentryErrorHandler);
    app.get('/fail', () => {
      throw new Error('test error');
    });

    const res = await app.request('/fail');
    assert.equal(res.status, 500);
    assert.equal(mockWithScope.mock.calls.length, 1);
  });

  it('should not interfere with successful requests', async () => {
    const { sentryErrorHandler } = await import('./sentry-error-handler.js');

    const app = new Hono();
    app.use('*', sentryErrorHandler);
    app.get('/ok', (c) => c.json({ status: 'ok' }));

    const res = await app.request('/ok');
    assert.equal(res.status, 200);
  });

  it('should set requestId in Sentry scope', async () => {
    let capturedExtras: Record<string, unknown> = {};
    mock.module('@sentry/node', {
      namedExports: {
        captureException: mock.fn(),
        withScope: mock.fn((cb) =>
          cb({
            setExtra: (key: string, val: unknown) => { capturedExtras[key] = val; },
            setUser: mock.fn(),
          })
        ),
      },
    });

    const { sentryErrorHandler } = await import('./sentry-error-handler.js');
    const { requestIdMiddleware } = await import('./request-id.js');

    const app = new Hono();
    app.use('*', requestIdMiddleware);
    app.use('*', sentryErrorHandler);
    app.get('/fail', () => { throw new Error('boom'); });

    await app.request('/fail', {
      headers: { 'X-Request-ID': 'req-abc-123' },
    });

    assert.equal(capturedExtras.requestId, 'req-abc-123');
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 4.5.1 | Write test: captures exception and re-throws | 15 min |
| 4.5.2 | Write test: does not interfere with success | 10 min |
| 4.5.3 | Write test: sets requestId in scope | 15 min |

---

## Story 5: Add SENTRY_DSN to Environment Configuration

**As a** DevOps engineer, **I want** `SENTRY_DSN` documented in `.env.example` **so that** all engineers know how to configure error tracking for their environment.

### Acceptance Criteria

- [ ] `SENTRY_DSN` is documented in `.env.example` with a comment explaining its purpose.
- [ ] `NEXT_PUBLIC_SENTRY_DSN` is documented for apps/web.
- [ ] `SENTRY_AUTH_TOKEN` is documented for CI source map uploads.
- [ ] `SENTRY_ORG` and `SENTRY_PROJECT` are documented.
- [ ] All Sentry env vars are in an "Error Tracking" section.

### Tasks

#### Task 5.1: Update .env.example

**File:** `.env.example`

Add:

```env
# ─── Error Tracking (OPTIONAL) ───────────────────────────────────────────────
# Sentry DSN for apps/api (server-side)
# SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
# Sentry DSN for apps/web (client + server)
# NEXT_PUBLIC_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0
# Sentry auth token for source map uploads (CI only)
# SENTRY_AUTH_TOKEN=sntrys_...
# SENTRY_ORG=your-org
# SENTRY_PROJECT=retune-web
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.1.1 | Add Error Tracking section to .env.example | 5 min |
| 5.1.2 | Document each variable with comment | 5 min |

#### Task 5.2: Write verification test

**File:** `apps/api/src/lib/sentry-config.test.ts`

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('.env.example Sentry configuration', () => {
  const envExample = readFileSync(
    resolve(process.cwd(), '../../.env.example'),
    'utf-8'
  );

  it('should document SENTRY_DSN', () => {
    assert.ok(envExample.includes('SENTRY_DSN'));
  });

  it('should document NEXT_PUBLIC_SENTRY_DSN', () => {
    assert.ok(envExample.includes('NEXT_PUBLIC_SENTRY_DSN'));
  });

  it('should document SENTRY_AUTH_TOKEN', () => {
    assert.ok(envExample.includes('SENTRY_AUTH_TOKEN'));
  });

  it('should document SENTRY_ORG', () => {
    assert.ok(envExample.includes('SENTRY_ORG'));
  });

  it('should document SENTRY_PROJECT', () => {
    assert.ok(envExample.includes('SENTRY_PROJECT'));
  });
});
```

##### Subtasks

| # | Subtask | Estimate |
|---|---------|----------|
| 5.2.1 | Write test: all Sentry env vars documented | 10 min |

---

## Summary

| Story | Effort Estimate |
|-------|----------------|
| 1. Install and Configure Sentry in apps/web | 1 day |
| 2. Wrap Next.js Config with Sentry | 0.5 day |
| 3. Replace Error Tracker Stub | 1 day |
| 4. Install and Configure Sentry in apps/api | 1.5 days |
| 5. Add SENTRY_DSN to Environment Configuration | 0.25 day |
| **Total** | **4.25 days** |
