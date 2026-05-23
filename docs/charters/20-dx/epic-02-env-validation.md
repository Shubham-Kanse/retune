# Epic 02 — Env Validation

## Goal

Replace silent runtime failures from missing or malformed environment variables with immediate, actionable error messages at application startup. Every required env var is validated with Zod schemas before any request is served.

## Current State

- `apps/web/src/lib/env.ts` (903 bytes) exists but is minimal — no Zod validation, no type safety.
- `apps/api` has no env validation module at all.
- `turbo.json` lists required env vars in `globalEnv` but provides no runtime enforcement.
- `apps/api/scripts/startup-selfcheck.mjs` and `apps/web/scripts/startup-selfcheck.mjs` exist but are never invoked.
- Developers discover missing vars only when a specific code path is hit, often minutes into debugging.

---

## Story 1: Zod-Validated Env Module for `apps/web`

### User Story

As a developer starting the web app, I want to see a clear error listing all missing or invalid environment variables at startup so that I can fix them immediately instead of discovering them one-by-one at runtime.

### Acceptance Criteria

- [ ] `apps/web/src/lib/env.ts` exports a typed `env` object validated by Zod.
- [ ] Schema validates all required vars: `NEXT_PUBLIC_SUPABASE_URL` (url), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (non-empty), `NEXT_PUBLIC_APP_URL` (url), `NEXT_PUBLIC_API_URL` (url), `SUPABASE_SERVICE_ROLE_KEY` (non-empty), `RETUNE_DATABASE_URL` (non-empty), `JWT_SECRET` (min 32 chars).
- [ ] Schema marks optional vars: `STRIPE_SECRET_KEY` (string), `SENTRY_DSN` (url).
- [ ] If validation fails, the error message lists every failing field with the reason.
- [ ] The `env` object is the single source of truth — no other code reads `process.env` directly for these vars.
- [ ] TypeScript infers correct types from the schema (e.g., `env.NEXT_PUBLIC_SUPABASE_URL` is `string`, `env.STRIPE_SECRET_KEY` is `string | undefined`).

### Tasks

#### Task 1.1: Replace `apps/web/src/lib/env.ts`

**File:** `apps/web/src/lib/env.ts`

```typescript
import { z } from 'zod';

const schema = z.object({
  // Public (available client-side)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  // Server-only
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RETUNE_DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // Optional
  STRIPE_SECRET_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

export const env = schema.parse(process.env);
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Delete existing `apps/web/src/lib/env.ts` content | 2 min |
| 1.1.2 | Write Zod schema with all required and optional vars | 15 min |
| 1.1.3 | Export typed `env` object | 5 min |
| 1.1.4 | Verify `zod` is in `apps/web/package.json` dependencies | 2 min |
| 1.1.5 | Update any existing imports of the old env module | 10 min |

### Tests

**Test file:** `apps/web/src/lib/__tests__/env.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { z } from 'zod';

// Import the schema directly to test without side effects
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RETUNE_DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
});

describe('web env schema', () => {
  it('rejects empty object', () => {
    const result = schema.safeParse({});
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.length >= 7, 'Should have at least 7 errors for required fields');
  });

  it('rejects invalid URL for NEXT_PUBLIC_SUPABASE_URL', () => {
    const result = schema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path[0] === 'NEXT_PUBLIC_SUPABASE_URL'));
  });

  it('rejects JWT_SECRET shorter than 32 chars', () => {
    const result = schema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'short',
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path[0] === 'JWT_SECRET'));
  });

  it('accepts valid env with all required fields', () => {
    const result = schema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.test',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      RETUNE_DATABASE_URL: 'postgresql://postgres:pass@localhost:5432/retune',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, true);
  });

  it('accepts valid env with optional fields', () => {
    const result = schema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'a'.repeat(32),
      STRIPE_SECRET_KEY: 'sk_test_123',
      SENTRY_DSN: 'https://abc@sentry.io/123',
    });
    assert.strictEqual(result.success, true);
  });

  it('rejects invalid SENTRY_DSN when provided', () => {
    const result = schema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'key',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      JWT_SECRET: 'a'.repeat(32),
      SENTRY_DSN: 'not-a-url',
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path[0] === 'SENTRY_DSN'));
  });
});
```

---

## Story 2: Zod-Validated Env Module for `apps/api`

### User Story

As a developer starting the API server, I want env validation to catch missing or malformed variables at boot so that I get a clear error instead of a cryptic crash when the first request hits a missing key.

### Acceptance Criteria

- [ ] `apps/api/src/lib/env.ts` exports a typed `env` object validated by Zod.
- [ ] Schema validates API-specific required vars: `RETUNE_DATABASE_URL` (non-empty), `AI_PROVIDER` (enum: `anthropic` | `openai`), `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (at least one non-empty based on provider), `RETUNE_API_CORS` (non-empty), `JWT_SECRET` (min 32 chars).
- [ ] Schema marks optional vars: `RETUNE_TEMPORAL` (string), `RETUNE_TEMPORAL_ADDRESS` (string), `RETUNE_ML_BASE_URL` (url).
- [ ] If validation fails, the error message lists every failing field.
- [ ] TypeScript infers correct types from the schema.

### Tasks

#### Task 2.1: Create `apps/api/src/lib/env.ts`

**File:** `apps/api/src/lib/env.ts`

```typescript
import { z } from 'zod';

const schema = z.object({
  // Required
  RETUNE_DATABASE_URL: z.string().min(1),
  AI_PROVIDER: z.enum(['anthropic', 'openai']),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  RETUNE_API_CORS: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  // Optional
  RETUNE_TEMPORAL: z.string().optional(),
  RETUNE_TEMPORAL_ADDRESS: z.string().optional(),
  RETUNE_TEMPORAL_NAMESPACE: z.string().optional(),
  RETUNE_ML_BASE_URL: z.string().url().optional(),
  RETUNE_ML_USE_STUBS: z.string().optional(),
}).refine(
  (data) => {
    if (data.AI_PROVIDER === 'openai') return !!data.OPENAI_API_KEY;
    if (data.AI_PROVIDER === 'anthropic') return !!data.ANTHROPIC_API_KEY;
    return true;
  },
  { message: 'API key required for the configured AI_PROVIDER' }
);

export type Env = z.infer<typeof schema>;

export const env = schema.parse(process.env);
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Create `apps/api/src/lib/` directory if it doesn't exist | 1 min |
| 2.1.2 | Write Zod schema with required and optional vars | 15 min |
| 2.1.3 | Add `.refine()` for conditional API key validation | 10 min |
| 2.1.4 | Export typed `env` object | 5 min |
| 2.1.5 | Add `zod` to `apps/api/package.json` if not present | 2 min |

### Tests

**Test file:** `apps/api/src/lib/__tests__/env.test.ts`

```typescript
import { describe, it, assert } from 'node:test';
import { z } from 'zod';

const schema = z.object({
  RETUNE_DATABASE_URL: z.string().min(1),
  AI_PROVIDER: z.enum(['anthropic', 'openai']),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  RETUNE_API_CORS: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  RETUNE_TEMPORAL: z.string().optional(),
  RETUNE_TEMPORAL_ADDRESS: z.string().optional(),
  RETUNE_TEMPORAL_NAMESPACE: z.string().optional(),
  RETUNE_ML_BASE_URL: z.string().url().optional(),
  RETUNE_ML_USE_STUBS: z.string().optional(),
}).refine(
  (data) => {
    if (data.AI_PROVIDER === 'openai') return !!data.OPENAI_API_KEY;
    if (data.AI_PROVIDER === 'anthropic') return !!data.ANTHROPIC_API_KEY;
    return true;
  },
  { message: 'API key required for the configured AI_PROVIDER' }
);

describe('api env schema', () => {
  it('rejects empty object', () => {
    const result = schema.safeParse({});
    assert.strictEqual(result.success, false);
  });

  it('rejects invalid AI_PROVIDER', () => {
    const result = schema.safeParse({
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      AI_PROVIDER: 'gemini',
      RETUNE_API_CORS: '*',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path[0] === 'AI_PROVIDER'));
  });

  it('rejects openai provider without OPENAI_API_KEY', () => {
    const result = schema.safeParse({
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      AI_PROVIDER: 'openai',
      RETUNE_API_CORS: '*',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.message.includes('API key required')));
  });

  it('rejects anthropic provider without ANTHROPIC_API_KEY', () => {
    const result = schema.safeParse({
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      AI_PROVIDER: 'anthropic',
      RETUNE_API_CORS: '*',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.message.includes('API key required')));
  });

  it('accepts valid env with openai provider', () => {
    const result = schema.safeParse({
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test-key',
      RETUNE_API_CORS: '*',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, true);
  });

  it('accepts valid env with anthropic provider', () => {
    const result = schema.safeParse({
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      AI_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      RETUNE_API_CORS: '*',
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.strictEqual(result.success, true);
  });

  it('rejects invalid RETUNE_ML_BASE_URL when provided', () => {
    const result = schema.safeParse({
      RETUNE_DATABASE_URL: 'postgresql://localhost/db',
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'sk-test',
      RETUNE_API_CORS: '*',
      JWT_SECRET: 'a'.repeat(32),
      RETUNE_ML_BASE_URL: 'not-a-url',
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.issues.some(i => i.path[0] === 'RETUNE_ML_BASE_URL'));
  });
});
```

---

## Story 3: Wire Env Validation to Startup

### User Story

As a developer, I want env validation to run automatically when the app starts so that I don't have to remember to import it manually and missing vars are caught before any request is served.

### Acceptance Criteria

- [ ] `apps/web/src/app/layout.tsx` imports `env` from `@/lib/env` at the top of the file.
- [ ] `apps/api/src/main.ts` imports `env` from `./lib/env` at the top of the file.
- [ ] If any required env var is missing, the app crashes at startup with a Zod error listing all failures.
- [ ] The import is the first non-type import in each file (before any other application code).

### Tasks

#### Task 3.1: Add env import to `apps/web/src/app/layout.tsx`

**File:** `apps/web/src/app/layout.tsx`

Add as the first import:

```typescript
import '@/lib/env'; // Validate env at startup
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Add import statement as first line after any `'use client'`/`'use server'` directive | 5 min |
| 3.1.2 | Verify app still starts with valid env | 5 min |
| 3.1.3 | Verify app crashes with clear error when env var is removed | 5 min |

#### Task 3.2: Add env import to `apps/api/src/main.ts`

**File:** `apps/api/src/main.ts`

Add as the first import:

```typescript
import './lib/env'; // Validate env at startup
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.2.1 | Add import statement as first non-type import | 5 min |
| 3.2.2 | Verify API still starts with valid env | 5 min |
| 3.2.3 | Verify API crashes with clear error when env var is removed | 5 min |

### Tests

**Test: Web app fails to start with missing env**

```bash
# Remove a required var and attempt to build/start
(
  unset NEXT_PUBLIC_SUPABASE_URL
  cd apps/web
  node -e "require('./src/lib/env')" 2>&1 | grep -q "NEXT_PUBLIC_SUPABASE_URL" \
    && echo "PASS: validation catches missing var" \
    || echo "FAIL: no validation error"
)
```

**Test: API fails to start with missing env**

```bash
(
  unset RETUNE_DATABASE_URL
  cd apps/api
  node -e "require('./src/lib/env')" 2>&1 | grep -q "RETUNE_DATABASE_URL" \
    && echo "PASS: validation catches missing var" \
    || echo "FAIL: no validation error"
)
```

---

## Summary

| Story | Files Created/Modified | Effort Estimate |
|-------|----------------------|-----------------|
| 1. Web env module | `apps/web/src/lib/env.ts`, `apps/web/src/lib/__tests__/env.test.ts` | 0.5 day |
| 2. API env module | `apps/api/src/lib/env.ts`, `apps/api/src/lib/__tests__/env.test.ts` | 0.5 day |
| 3. Startup wiring | `apps/web/src/app/layout.tsx`, `apps/api/src/main.ts` | 0.25 day |
| **Total** | | **1.25 days** |
