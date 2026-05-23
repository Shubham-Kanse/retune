# Epic 03 — Secrets Management

## Summary

Remove all secrets from the git repository, migrate them to GitHub Actions secrets and Vercel environment variables, and add Zod-based startup validation that fails fast if required env vars are missing.

## Current State

- `.env.vercel` is committed to git with production secrets (being fixed in Charter 01)
- `eval-live-matrix` job already uses `${{ secrets.ANTHROPIC_API_KEY_PROD }}` and `${{ secrets.OPENAI_API_KEY_PROD }}`
- No runtime validation of environment variables — missing vars cause cryptic runtime errors
- No centralized env schema for either `apps/web` or `apps/api`

## Target State

- Zero secrets in git (`.env.vercel` removed, `.gitignore` updated)
- All production secrets stored in GitHub Actions secrets
- CI workflow references secrets via `${{ secrets.* }}`
- Both `apps/web` and `apps/api` validate env vars at startup with Zod
- Missing required vars cause immediate, clear failure with the var name listed

---

## Story 1: Remove `.env.vercel` from Repository

### User Story

As a security-conscious developer, I want production secrets removed from the git repository so that credentials are not exposed in version control history.

### Acceptance Criteria

- [ ] `.env.vercel` is deleted from the repository
- [ ] `.env.vercel` is added to `.gitignore`
- [ ] A `git filter-branch` or BFG command is documented (but not auto-run) to purge history
- [ ] The commit message references Charter 01 Epic 1 coordination
- [ ] No other `.env*` files with real secrets remain tracked

### Tasks

#### Task 1.1: Remove `.env.vercel` and update `.gitignore`

**File:** `.gitignore`

Add to the environment section:

```gitignore
# Environment files — never commit secrets
.env
.env.*
!.env.example
```

**Commands:**

```bash
git rm --cached .env.vercel
echo ".env.vercel" >> .gitignore
git add .gitignore
git commit -m "chore: remove .env.vercel from tracking (Charter 06 Epic 03 + Charter 01 Epic 01)"
```

**Subtasks:**
- Remove `.env.vercel` from git tracking — 5 min
- Update `.gitignore` with broad `.env.*` pattern — 5 min
- Verify `.env.example` is still tracked (excluded from pattern) — 5 min

#### Task 1.2: Document history purge procedure

**File:** `docs/charters/06-cicd/secrets-purge-runbook.md`

```markdown
# Secrets History Purge

## Why

`.env.vercel` was committed with production secrets. Even after deletion,
secrets remain in git history. This runbook documents how to purge them.

## Prerequisites

- All team members must be notified (force-push required)
- All open PRs must be rebased after purge
- Rotate ALL secrets that were in `.env.vercel` after purge

## Option A: BFG Repo-Cleaner (recommended)

```bash
# Install BFG
brew install bfg

# Clone a bare copy
git clone --mirror git@github.com:org/retune.git retune-bare

# Remove the file from all history
bfg --delete-files .env.vercel retune-bare

# Clean up
cd retune-bare
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Force push
git push --force
```

## Option B: git filter-repo

```bash
pip install git-filter-repo
git filter-repo --path .env.vercel --invert-paths
git push --force --all
```

## Post-Purge Checklist

- [ ] Force push completed
- [ ] All team members re-cloned or force-pulled
- [ ] All secrets rotated (new keys generated)
- [ ] Open PRs rebased
```

**Subtasks:**
- Write purge runbook — 15 min
- Coordinate timing with team (not automated) — N/A

### Tests

```bash
# Verify .env.vercel is not tracked
git ls-files --error-unmatch .env.vercel 2>&1 | grep -q "not in"

# Verify .gitignore blocks .env.vercel
echo "test" > .env.vercel
git status --porcelain .env.vercel | grep -q "^!!" || git check-ignore .env.vercel

# Verify .env.example IS still tracked
git ls-files --error-unmatch .env.example
```

---

## Story 2: Create GitHub Actions Secrets for All Production Values

### User Story

As a DevOps engineer, I want all production secrets stored in GitHub Actions secrets so that CI jobs can access them securely without committing them to the repository.

### Acceptance Criteria

- [ ] The following secrets exist in GitHub → Repository → Settings → Secrets and variables → Actions:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `RETUNE_DATABASE_URL`
  - `SMTP_PASS`
  - `JWT_SECRET`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- [ ] Existing `ANTHROPIC_API_KEY_PROD` and `OPENAI_API_KEY_PROD` are kept for backward compatibility (used by `eval-live-matrix`)
- [ ] A secrets inventory document lists all secrets, their purpose, and rotation schedule

### Tasks

#### Task 2.1: Add secrets to GitHub Actions

Navigate to GitHub → Repository → Settings → Secrets and variables → Actions → New repository secret.

| Secret Name | Source | Purpose |
|-------------|--------|---------|
| `OPENAI_API_KEY` | OpenAI Dashboard → API Keys | Generation pipeline |
| `ANTHROPIC_API_KEY` | Anthropic Console → API Keys | Generation pipeline |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API | Server-side DB access |
| `RETUNE_DATABASE_URL` | Supabase Dashboard → Settings → Database → Connection string | Direct DB connection |
| `SMTP_PASS` | Email provider credentials | Transactional email |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` | Session signing |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys | Billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Signing secret | Webhook verification |

**Subtasks:**
- Add all 8 secrets to GitHub Actions — 15 min
- Verify secrets are masked in logs (test with `echo ${{ secrets.JWT_SECRET }}`) — 5 min
- Document in secrets inventory — 10 min

#### Task 2.2: Create secrets inventory document

**File:** `docs/charters/06-cicd/secrets-inventory.md`

```markdown
# Secrets Inventory

## GitHub Actions Secrets

| Secret | Purpose | Rotation Schedule | Owner |
|--------|---------|-------------------|-------|
| `OPENAI_API_KEY` | LLM generation | Quarterly | Engineering |
| `ANTHROPIC_API_KEY` | LLM generation | Quarterly | Engineering |
| `OPENAI_API_KEY_PROD` | Eval live matrix (legacy name) | Quarterly | Engineering |
| `ANTHROPIC_API_KEY_PROD` | Eval live matrix (legacy name) | Quarterly | Engineering |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access | On rotation | Engineering |
| `RETUNE_DATABASE_URL` | Direct Postgres connection | On password change | Engineering |
| `SMTP_PASS` | Transactional email sending | Annually | Engineering |
| `JWT_SECRET` | Session token signing | On compromise | Engineering |
| `STRIPE_SECRET_KEY` | Billing API access | On rotation | Engineering |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | On endpoint change | Engineering |
| `VERCEL_TOKEN` | CI → Vercel deployment | Annually | Engineering |
| `VERCEL_ORG_ID` | Vercel org identifier | Never (not secret) | Engineering |
| `VERCEL_PROJECT_ID` | Vercel project identifier | Never (not secret) | Engineering |

## Vercel Environment Variables

Managed in Vercel Dashboard → Project → Settings → Environment Variables.
Scoped by environment: Production, Preview, Development.

## Rotation Procedure

1. Generate new secret value
2. Update in GitHub Actions secrets
3. Update in Vercel environment variables (if applicable)
4. Trigger a deployment to pick up new values
5. Verify health check passes
6. Revoke old secret value
```

**Subtasks:**
- Create secrets inventory document — 15 min
- Review with team for completeness — 10 min

### Tests

```bash
# Verify secrets are accessible in workflow (add a test step temporarily)
# In a workflow run, this should print "***" (masked):
echo "Key length: ${#OPENAI_API_KEY}"  # Should print a number > 0

# Verify all required secrets are set (run in workflow):
for secret in OPENAI_API_KEY ANTHROPIC_API_KEY SUPABASE_SERVICE_ROLE_KEY \
              RETUNE_DATABASE_URL SMTP_PASS JWT_SECRET STRIPE_SECRET_KEY \
              STRIPE_WEBHOOK_SECRET; do
  if [ -z "${!secret}" ]; then
    echo "❌ Missing secret: $secret"
    exit 1
  fi
done
echo "✅ All secrets present"
```

---

## Story 3: Update CI Workflow to Use Secrets References

### User Story

As a developer, I want the CI workflow to inject secrets from GitHub Actions secrets so that jobs requiring real API keys (like `eval-live-matrix`) work without any secrets in the codebase.

### Acceptance Criteria

- [ ] `eval-live-matrix` job uses `${{ secrets.OPENAI_API_KEY }}` and `${{ secrets.ANTHROPIC_API_KEY }}` (in addition to existing `_PROD` variants)
- [ ] No job in the workflow references hardcoded secret values
- [ ] Jobs that don't need real keys use `dummy-*` placeholder values
- [ ] A comment in the workflow documents which jobs need real secrets vs dummies

### Tasks

#### Task 3.1: Update `eval-live-matrix` job secrets

**File:** `.github/workflows/cognitive-cycle.yml`

Update the `eval-live-matrix` job env section:

```yaml
  eval-live-matrix:
    name: eval --live (${{ matrix.ai_provider }})
    runs-on: ubuntu-latest
    timeout-minutes: 45
    if: github.event_name == 'workflow_dispatch'
    strategy:
      fail-fast: false
      matrix:
        ai_provider: [anthropic, openai]
    env:
      AI_PROVIDER: ${{ matrix.ai_provider }}
      # Real API keys — required for live eval against LLM providers
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      RETUNE_DATABASE_URL: ${{ secrets.RETUNE_DATABASE_URL }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
```

**Subtasks:**
- Update `eval-live-matrix` env block — 10 min
- Remove legacy `_PROD` suffix references (or keep as fallback) — 5 min
- Verify workflow syntax: `act --list` or push to branch — 10 min

#### Task 3.2: Add secrets documentation comment to workflow

**File:** `.github/workflows/cognitive-cycle.yml`

Add at the top of the file, after the existing header comment:

```yaml
# ─── Secrets Usage ────────────────────────────────────────────────────────────
# Jobs requiring REAL secrets (workflow_dispatch only):
#   - eval-live-matrix: OPENAI_API_KEY, ANTHROPIC_API_KEY, RETUNE_DATABASE_URL
#   - staging-deploy: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
#
# All other jobs use dummy values and do NOT require real secrets.
# ──────────────────────────────────────────────────────────────────────────────
```

**Subtasks:**
- Add secrets documentation comment — 5 min

### Tests

```bash
# Verify no hardcoded secrets in workflow (no sk-ant-*, no sk-* patterns)
! grep -E "sk-ant-[a-zA-Z0-9]+" .github/workflows/cognitive-cycle.yml
! grep -E "sk-[a-zA-Z0-9]{20,}" .github/workflows/cognitive-cycle.yml

# Verify secrets references exist
grep -q 'secrets.OPENAI_API_KEY' .github/workflows/cognitive-cycle.yml
grep -q 'secrets.ANTHROPIC_API_KEY' .github/workflows/cognitive-cycle.yml

# Verify dummy values are used in non-live jobs
grep -q "dummy-not-used" .github/workflows/cognitive-cycle.yml
```

---

## Story 4: Add Zod Env Validation to `apps/web`

### User Story

As a developer, I want the web app to validate all required environment variables at startup so that missing configuration causes an immediate, clear error instead of a cryptic runtime failure.

### Acceptance Criteria

- [ ] `apps/web/src/lib/env.ts` exports a validated `env` object
- [ ] Validation uses Zod schemas with descriptive error messages
- [ ] The app fails to start if any required variable is missing
- [ ] Optional variables have defaults documented in the schema
- [ ] The validated `env` object is the single source of truth (no raw `process.env` access elsewhere)
- [ ] `E2E_AUTH_BYPASS` is validated as optional and ONLY allowed when `NODE_ENV !== 'production'`

### Tasks

#### Task 4.1: Create `apps/web/src/lib/env.ts`

**File:** `apps/web/src/lib/env.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // App URLs
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),
  NEXT_PUBLIC_API_URL: z.string().url("NEXT_PUBLIC_API_URL must be a valid URL"),

  // AI Provider
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Auth
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // Database
  RETUNE_DATABASE_URL: z.string().optional(),
  RETUNE_PERSIST: z.enum(["pglite", "postgres"]).default("pglite"),

  // ML
  RETUNE_ML_USE_STUBS: z.coerce.boolean().default(true),

  // E2E — only allowed outside production
  E2E_AUTH_BYPASS: z.string().optional(),

  // Node
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  console.error("❌ Invalid environment variables:");
  console.error(JSON.stringify(formatted, null, 2));
  throw new Error("Missing or invalid environment variables. See above for details.");
}

// Safety: E2E_AUTH_BYPASS must not be set in production
if (parsed.data.E2E_AUTH_BYPASS && parsed.data.NODE_ENV === "production") {
  throw new Error("E2E_AUTH_BYPASS must not be set in production");
}

export const env = parsed.data;
```

**Subtasks:**
- Create `env.ts` with Zod schema — 20 min
- Add production guard for `E2E_AUTH_BYPASS` — 5 min
- Verify it throws on missing required vars — 10 min
- Verify it passes with `.env.example` values filled in — 5 min

#### Task 4.2: Wire env validation into app startup

**File:** `apps/web/src/app/layout.tsx` (or `instrumentation.ts`)

Import the env module at the top of the root layout or in Next.js instrumentation:

```typescript
// apps/web/src/instrumentation.ts
export async function register() {
  // Validates env vars — throws if invalid
  await import("./lib/env");
}
```

**Subtasks:**
- Create `apps/web/src/instrumentation.ts` with env import — 10 min
- Verify Next.js calls `register()` on startup — 5 min
- Test: remove a required var and confirm startup fails — 5 min

#### Task 4.3: Add AI provider key cross-validation

**File:** `apps/web/src/lib/env.ts`

Add a refinement after the base schema:

```typescript
const envSchema = z.object({
  // ... fields above
}).refine(
  (data) => {
    if (data.AI_PROVIDER === "openai" && !data.OPENAI_API_KEY) return false;
    if (data.AI_PROVIDER === "anthropic" && !data.ANTHROPIC_API_KEY) return false;
    return true;
  },
  { message: "API key required for the configured AI_PROVIDER" }
);
```

**Subtasks:**
- Add refinement for provider-key pairing — 10 min
- Test: set `AI_PROVIDER=openai` without `OPENAI_API_KEY` → expect failure — 5 min

### Tests

```typescript
// apps/web/src/lib/env.test.ts
import { describe, it, expect, beforeEach } from "vitest";

describe("env validation", () => {
  const validEnv = {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_API_URL: "http://localhost:4000",
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test-key",
    JWT_SECRET: "test-jwt-secret-that-is-at-least-32-characters-long",
    NODE_ENV: "development",
  };

  it("passes with valid env", () => {
    // Import with mocked process.env = validEnv
    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it("fails when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    const { NEXT_PUBLIC_SUPABASE_URL, ...rest } = validEnv;
    expect(() => validateEnv(rest)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("fails when JWT_SECRET is too short", () => {
    expect(() => validateEnv({ ...validEnv, JWT_SECRET: "short" })).toThrow(/32 characters/);
  });

  it("fails when AI_PROVIDER=openai but no OPENAI_API_KEY", () => {
    const { OPENAI_API_KEY, ...rest } = validEnv;
    expect(() => validateEnv({ ...rest, AI_PROVIDER: "openai" })).toThrow(/API key/);
  });

  it("fails when E2E_AUTH_BYPASS is set in production", () => {
    expect(() => validateEnv({
      ...validEnv,
      NODE_ENV: "production",
      E2E_AUTH_BYPASS: "1",
    })).toThrow(/E2E_AUTH_BYPASS.*production/);
  });
});
```

---

## Story 5: Add Zod Env Validation to `apps/api`

### User Story

As a developer, I want the API service to validate all required environment variables at startup so that misconfigured deployments fail immediately with actionable error messages.

### Acceptance Criteria

- [ ] `apps/api/src/lib/env.ts` exports a validated `env` object
- [ ] Validation uses Zod schemas matching the API's requirements
- [ ] The API fails to start if any required variable is missing
- [ ] The validated `env` object is imported by route handlers (no raw `process.env`)
- [ ] Database URL is required when `RETUNE_PERSIST=postgres`

### Tasks

#### Task 5.1: Create `apps/api/src/lib/env.ts`

**File:** `apps/api/src/lib/env.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  // AI Provider
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Database
  RETUNE_PERSIST: z.enum(["pglite", "postgres"]).default("pglite"),
  RETUNE_DATABASE_URL: z.string().optional(),

  // Temporal (optional)
  RETUNE_TEMPORAL: z.coerce.boolean().default(false),
  RETUNE_TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  RETUNE_TEMPORAL_NAMESPACE: z.string().default("default"),

  // ML Service
  RETUNE_ML_USE_STUBS: z.coerce.boolean().default(true),
  RETUNE_ML_BASE_URL: z.string().default("http://localhost:8000"),
  RETUNE_ML_TRANSPORT: z.enum(["http", "grpc"]).default("http"),

  // CORS
  RETUNE_API_CORS: z.string().default("*"),

  // Port
  PORT: z.coerce.number().default(4000),
}).refine(
  (data) => {
    if (data.AI_PROVIDER === "openai" && !data.OPENAI_API_KEY) return false;
    if (data.AI_PROVIDER === "anthropic" && !data.ANTHROPIC_API_KEY) return false;
    return true;
  },
  { message: "API key required for the configured AI_PROVIDER" }
).refine(
  (data) => {
    if (data.RETUNE_PERSIST === "postgres" && !data.RETUNE_DATABASE_URL) return false;
    return true;
  },
  { message: "RETUNE_DATABASE_URL required when RETUNE_PERSIST=postgres" }
);

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.format();
  console.error("❌ Invalid environment variables (apps/api):");
  console.error(JSON.stringify(formatted, null, 2));
  throw new Error("Missing or invalid environment variables. See above for details.");
}

export const env = parsed.data;
```

**Subtasks:**
- Create `env.ts` with Zod schema for API — 20 min
- Add cross-field refinements (provider key, database URL) — 10 min
- Verify it throws on missing required vars — 5 min

#### Task 5.2: Wire env validation into API startup

**File:** `apps/api/src/index.ts`

Add at the top of the entry point:

```typescript
import "./lib/env"; // Validates env vars — throws if invalid
```

**Subtasks:**
- Add import to API entry point — 5 min
- Test: remove `AI_PROVIDER` and confirm startup fails with clear message — 5 min

#### Task 5.3: Replace raw `process.env` usage in API routes

Search for `process.env` in `apps/api/src/` and replace with `env` import:

```typescript
// Before
const provider = process.env.AI_PROVIDER ?? "openai";

// After
import { env } from "../lib/env";
const provider = env.AI_PROVIDER;
```

**Subtasks:**
- Find all `process.env` references in `apps/api/src/` — 10 min
- Replace with `env.*` imports — 20 min
- Verify no `process.env` remains in route handlers — 5 min

### Tests

```typescript
// apps/api/tests/env.test.ts
import { describe, it, expect } from "vitest";

describe("API env validation", () => {
  const validEnv = {
    AI_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    RETUNE_PERSIST: "pglite",
  };

  it("passes with minimal valid env", () => {
    expect(() => validateEnv(validEnv)).not.toThrow();
  });

  it("fails when RETUNE_PERSIST=postgres without DATABASE_URL", () => {
    expect(() => validateEnv({
      ...validEnv,
      RETUNE_PERSIST: "postgres",
    })).toThrow(/RETUNE_DATABASE_URL/);
  });

  it("fails when AI_PROVIDER=anthropic without ANTHROPIC_API_KEY", () => {
    expect(() => validateEnv({
      ...validEnv,
      AI_PROVIDER: "anthropic",
      OPENAI_API_KEY: undefined,
    })).toThrow(/API key/);
  });

  it("defaults PORT to 4000", () => {
    const result = validateEnv(validEnv);
    expect(result.PORT).toBe(4000);
  });

  it("defaults RETUNE_ML_USE_STUBS to true", () => {
    const result = validateEnv(validEnv);
    expect(result.RETUNE_ML_USE_STUBS).toBe(true);
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Remove `.env.vercel` | 30 min |
| Story 2: GitHub Actions secrets | 45 min |
| Story 3: Update workflow secrets references | 30 min |
| Story 4: Zod env validation (web) | 1 hour |
| Story 5: Zod env validation (api) | 1 hour |
| **Total** | **~4 hours** |

## Risks

- History purge requires force-push — coordinate with all contributors
- Rotating secrets after purge may cause brief downtime — schedule during low-traffic window
- Zod validation at startup adds ~50ms to cold start — negligible for server apps
- `E2E_AUTH_BYPASS` production guard must be tested in deployment pipeline
- Some `process.env` references may exist in dependencies — only replace in app code
