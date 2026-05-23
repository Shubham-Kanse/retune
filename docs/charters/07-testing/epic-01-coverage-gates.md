# Epic 01 — Coverage Gates

## Summary

Add code coverage measurement and enforcement to all TypeScript packages in CI. When coverage drops below thresholds, the pipeline fails. Additionally, write tests for the 5 most critical untested paths in the codebase.

## Acceptance Criteria (Epic-Level)

- `packages/agent` reports line coverage via `--experimental-test-coverage` and fails CI below 80%
- `apps/api` reports line coverage via `--experimental-test-coverage` and fails CI below 80%
- `apps/web` reports line/function/branch coverage via `@vitest/coverage-v8` and fails CI below thresholds (80/80/70)
- CI workflow `cognitive-cycle.yml` has a dedicated `coverage` job that gates merge
- 5 critical paths have full test coverage with specific assertions

---

## Story 1: Add coverage measurement to packages/agent

### User Story

As a maintainer, I want `packages/agent` test runs to report line coverage so that I can track coverage trends and enforce minimums.

### Acceptance Criteria

- [ ] `packages/agent/package.json` has a `test:coverage` script that runs tests with `--experimental-test-coverage`
- [ ] Running `pnpm --filter @retune/agent test:coverage` outputs a coverage summary to stdout
- [ ] The script exits non-zero if line coverage is below 80%

### Tasks

#### Task 1.1: Add `test:coverage` script to package.json

**File:** `packages/agent/package.json`

Add to the `"scripts"` block:

```json
"test:coverage": "find tests -name '*.test.ts' -print0 | xargs -0 tsx --test --experimental-test-coverage"
```

#### Task 1.2: Add coverage threshold enforcement wrapper

**File:** `packages/agent/scripts/check-coverage.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

OUTPUT=$(pnpm test:coverage 2>&1) || true
echo "$OUTPUT"

# Extract line coverage percentage from Node.js coverage output
LINE_COV=$(echo "$OUTPUT" | grep -E "^all files" | awk '{print $NF}' | tr -d '%')

if [ -z "$LINE_COV" ]; then
  echo "ERROR: Could not parse coverage output"
  exit 1
fi

THRESHOLD=80
if (( $(echo "$LINE_COV < $THRESHOLD" | bc -l) )); then
  echo "FAIL: Line coverage ${LINE_COV}% is below threshold ${THRESHOLD}%"
  exit 1
fi

echo "PASS: Line coverage ${LINE_COV}% meets threshold ${THRESHOLD}%"
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 1.1 | Add `test:coverage` script | 5 min |
| 1.2 | Add threshold check script | 15 min |
| 1.3 | Verify output locally | 10 min |

### Tests

```bash
# Verify the script exists and runs
pnpm --filter @retune/agent test:coverage
# Expected: coverage summary printed, exit 0 if ≥80%
```

---

## Story 2: Add coverage measurement to apps/api

### User Story

As a maintainer, I want `apps/api` test runs to report line coverage so that coverage regressions are visible.

### Acceptance Criteria

- [ ] `apps/api/package.json` has a `test:coverage` script using `--experimental-test-coverage`
- [ ] Running `pnpm --filter @retune/api test:coverage` outputs coverage summary
- [ ] The script exits non-zero if line coverage is below 80%

### Tasks

#### Task 2.1: Add `test:coverage` script to package.json

**File:** `apps/api/package.json`

Add to the `"scripts"` block:

```json
"test:coverage": "tsx --test --experimental-test-coverage tests/**/*.test.ts"
```

#### Task 2.2: Add coverage threshold enforcement wrapper

**File:** `apps/api/scripts/check-coverage.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

OUTPUT=$(pnpm test:coverage 2>&1) || true
echo "$OUTPUT"

LINE_COV=$(echo "$OUTPUT" | grep -E "^all files" | awk '{print $NF}' | tr -d '%')

if [ -z "$LINE_COV" ]; then
  echo "ERROR: Could not parse coverage output"
  exit 1
fi

THRESHOLD=80
if (( $(echo "$LINE_COV < $THRESHOLD" | bc -l) )); then
  echo "FAIL: Line coverage ${LINE_COV}% is below threshold ${THRESHOLD}%"
  exit 1
fi

echo "PASS: Line coverage ${LINE_COV}% meets threshold ${THRESHOLD}%"
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 2.1 | Add `test:coverage` script | 5 min |
| 2.2 | Add threshold check script | 10 min |
| 2.3 | Verify output locally | 10 min |

### Tests

```bash
pnpm --filter @retune/api test:coverage
# Expected: coverage summary printed, exit 0 if ≥80%
```

---

## Story 3: Add vitest coverage to apps/web

### User Story

As a maintainer, I want `apps/web` to enforce line, function, and branch coverage thresholds so that UI code quality is measurable.

### Acceptance Criteria

- [ ] `@vitest/coverage-v8` is installed as a dev dependency in `apps/web`
- [ ] `apps/web/vitest.config.ts` includes coverage configuration with thresholds
- [ ] `pnpm --filter @retune/web test -- --coverage` fails if thresholds are not met
- [ ] Thresholds: lines 80%, functions 80%, branches 70%

### Tasks

#### Task 3.1: Install coverage dependency

```bash
pnpm --filter @retune/web add -D @vitest/coverage-v8
```

#### Task 3.2: Update vitest.config.ts

**File:** `apps/web/vitest.config.ts`

```typescript
import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [".next/**", "node_modules/**", "dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@retune/db/application-status": resolve(
        __dirname,
        "../../packages/db/src/application-status.ts",
      ),
      "@retune/db/compute-completeness": resolve(
        __dirname,
        "../../packages/db/src/compute-completeness.ts",
      ),
    },
  },
});
```

#### Task 3.3: Add `test:coverage` script to package.json

**File:** `apps/web/package.json`

Add to `"scripts"`:

```json
"test:coverage": "vitest run --coverage"
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 3.1 | Install `@vitest/coverage-v8` | 2 min |
| 3.2 | Update vitest config | 10 min |
| 3.3 | Add script to package.json | 2 min |
| 3.4 | Verify thresholds trigger failure locally | 15 min |

### Tests

```bash
pnpm --filter @retune/web test:coverage
# Expected: coverage report with lines/functions/branches
# Expected: exits non-zero if any threshold is not met
```

---

## Story 4: Add coverage job to CI workflow

### User Story

As a maintainer, I want CI to fail the build when coverage drops below thresholds so that regressions cannot be merged.

### Acceptance Criteria

- [ ] `.github/workflows/cognitive-cycle.yml` has a `coverage` job
- [ ] The job runs `test:coverage` for `@retune/agent` and `@retune/api`
- [ ] The job fails if either package is below 80% line coverage
- [ ] The job runs after `test-ts` to avoid duplicate work on failure

### Tasks

#### Task 4.1: Add coverage job to cognitive-cycle.yml

**File:** `.github/workflows/cognitive-cycle.yml`

Add after the `test-ts` job:

```yaml
  coverage:
    name: coverage thresholds
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [test-ts]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - name: agent coverage
        run: |
          chmod +x packages/agent/scripts/check-coverage.sh
          cd packages/agent && bash scripts/check-coverage.sh
      - name: api coverage
        run: |
          chmod +x apps/api/scripts/check-coverage.sh
          cd apps/api && bash scripts/check-coverage.sh
```

#### Task 4.2: Add web coverage to ci-cd.yml

**File:** `.github/workflows/ci-cd.yml`

Add step after existing test step:

```yaml
      - name: Web coverage check
        run: pnpm --filter @retune/web test:coverage
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 4.1 | Add `coverage` job to cognitive-cycle.yml | 15 min |
| 4.2 | Add web coverage step to ci-cd.yml | 5 min |
| 4.3 | Verify in a PR that the job runs and reports | 20 min |

### Tests

- Open a PR touching `packages/agent/src/` — verify the `coverage` job appears and passes
- Temporarily lower a threshold to 99% — verify the job fails with a clear message
- Restore threshold — verify the job passes again

---

## Story 5: Test billing double-spend race condition

### User Story

As a developer, I want a test that proves `atomicCheckGeneration` prevents double-spend under concurrent calls so that billing integrity is verified.

### Acceptance Criteria

- [ ] Test file exists at `packages/billing/tests/atomic-check-generation.test.ts`
- [ ] Test spawns 5 concurrent calls to `atomicCheckGeneration` for a user with exactly 10 credits (enough for 1 generation)
- [ ] Asserts that exactly 1 call returns `allowed: true` and 4 return `allowed: false`
- [ ] Test uses a real database transaction (PGlite) — not mocked

### Tasks

#### Task 5.1: Create test file

**File:** `packages/billing/tests/atomic-check-generation.test.ts`

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { db, subscriptions, usageRecords } from "@retune/db";
import { eq } from "drizzle-orm";
import { atomicCheckGeneration } from "../src/index";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_APP_ID = "app-001";

test("atomicCheckGeneration prevents double-spend under concurrency", async () => {
  // Setup: user on free plan with 20 credits used out of 30 (10 remaining = 1 generation)
  await db.insert(subscriptions).values({
    userId: TEST_USER_ID,
    plan: "free",
    status: "active",
    creditsUsed: 20,
  }).onConflictDoUpdate({
    target: subscriptions.userId,
    set: { creditsUsed: 20, plan: "free" },
  });

  // Fire 5 concurrent generation checks
  const results = await Promise.all(
    Array.from({ length: 5 }, () => atomicCheckGeneration(TEST_USER_ID, TEST_APP_ID))
  );

  const allowed = results.filter((r) => r.allowed);
  const denied = results.filter((r) => !r.allowed);

  // Exactly 1 should succeed — the transaction serializes access
  assert.equal(allowed.length, 1, `Expected 1 allowed, got ${allowed.length}`);
  assert.equal(denied.length, 4, `Expected 4 denied, got ${denied.length}`);

  // All denied should cite insufficient_credits
  for (const d of denied) {
    assert.equal(d.reason, "insufficient_credits");
  }
});
```

#### Task 5.2: Add test script to packages/billing/package.json

```json
"test": "tsx --test tests/**/*.test.ts"
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 5.1 | Create test file | 30 min |
| 5.2 | Add test script | 5 min |
| 5.3 | Setup PGlite test harness (if not already present) | 20 min |
| 5.4 | Verify test passes locally | 15 min |

### Tests

```typescript
// Assertion: exactly 1 of 5 concurrent calls returns allowed: true
assert.equal(allowed.length, 1);
// Assertion: remaining 4 return allowed: false with reason
assert.equal(denied.length, 4);
for (const d of denied) {
  assert.equal(d.reason, "insufficient_credits");
}
```

---

## Story 6: Test all branches of resolveAuthenticatedIdentity

### User Story

As a developer, I want full branch coverage of the internal auth module so that authentication bypass vulnerabilities are caught by tests.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/internal-auth.test.ts`
- [ ] Tests cover all 7 branches:
  1. Dev mode (no key set) + valid UUID header → returns that UUID
  2. Dev mode (no key set) + no header → returns default user
  3. Dev mode (no key set) + invalid UUID header → returns default user
  4. Production mode + missing key header → 401
  5. Production mode + wrong key header → 401
  6. Production mode + correct key + missing user-id → 401
  7. Production mode + correct key + invalid UUID → 400
  8. Production mode + correct key + valid UUID → authenticated identity
- [ ] Each branch has an explicit assertion on the return shape

### Tasks

#### Task 6.1: Create test file

**File:** `apps/api/tests/internal-auth.test.ts`

```typescript
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { resolveAuthenticatedIdentity } from "../src/lib/internal-auth";

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const DEFAULT_USER = "00000000-0000-0000-0000-000000000000";
const INTERNAL_KEY = "test-secret-key-for-ci";

beforeEach(() => {
  delete process.env.RETUNE_INTERNAL_API_KEY;
});

afterEach(() => {
  delete process.env.RETUNE_INTERNAL_API_KEY;
});

test("dev mode: valid UUID in header returns that user", () => {
  const result = resolveAuthenticatedIdentity(
    { "x-retune-user-id": VALID_UUID },
    DEFAULT_USER,
  );
  assert.ok("identity" in result);
  assert.equal(result.identity.user_id, VALID_UUID);
  assert.equal(result.identity.authenticated_via_internal_key, false);
});

test("dev mode: no header returns default user", () => {
  const result = resolveAuthenticatedIdentity({}, DEFAULT_USER);
  assert.ok("identity" in result);
  assert.equal(result.identity.user_id, DEFAULT_USER);
  assert.equal(result.identity.authenticated_via_internal_key, false);
});

test("dev mode: invalid UUID header returns default user", () => {
  const result = resolveAuthenticatedIdentity(
    { "x-retune-user-id": "not-a-uuid" },
    DEFAULT_USER,
  );
  assert.ok("identity" in result);
  assert.equal(result.identity.user_id, DEFAULT_USER);
});

test("production mode: missing key header returns 401", () => {
  process.env.RETUNE_INTERNAL_API_KEY = INTERNAL_KEY;
  const result = resolveAuthenticatedIdentity({}, DEFAULT_USER);
  assert.ok("error" in result);
  assert.equal(result.status, 401);
  assert.equal(result.error, "missing_internal_key");
});

test("production mode: wrong key returns 401", () => {
  process.env.RETUNE_INTERNAL_API_KEY = INTERNAL_KEY;
  const result = resolveAuthenticatedIdentity(
    { "x-retune-internal-key": "wrong-key" },
    DEFAULT_USER,
  );
  assert.ok("error" in result);
  assert.equal(result.status, 401);
  assert.equal(result.error, "invalid_internal_key");
});

test("production mode: correct key but missing user-id returns 401", () => {
  process.env.RETUNE_INTERNAL_API_KEY = INTERNAL_KEY;
  const result = resolveAuthenticatedIdentity(
    { "x-retune-internal-key": INTERNAL_KEY },
    DEFAULT_USER,
  );
  assert.ok("error" in result);
  assert.equal(result.status, 401);
  assert.equal(result.error, "missing_user_id");
});

test("production mode: correct key but invalid UUID returns 400", () => {
  process.env.RETUNE_INTERNAL_API_KEY = INTERNAL_KEY;
  const result = resolveAuthenticatedIdentity(
    { "x-retune-internal-key": INTERNAL_KEY, "x-retune-user-id": "not-valid" },
    DEFAULT_USER,
  );
  assert.ok("error" in result);
  assert.equal(result.status, 400);
  assert.equal(result.error, "invalid_user_id");
});

test("production mode: correct key + valid UUID returns authenticated identity", () => {
  process.env.RETUNE_INTERNAL_API_KEY = INTERNAL_KEY;
  const result = resolveAuthenticatedIdentity(
    { "x-retune-internal-key": INTERNAL_KEY, "x-retune-user-id": VALID_UUID },
    DEFAULT_USER,
  );
  assert.ok("identity" in result);
  assert.equal(result.identity.user_id, VALID_UUID);
  assert.equal(result.identity.authenticated_via_internal_key, true);
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 6.1 | Create test file | 25 min |
| 6.2 | Run and verify all 8 assertions pass | 10 min |

### Tests

```typescript
// Each test asserts either:
assert.ok("identity" in result);  // success path
assert.ok("error" in result);     // error path with specific status code
```

---

## Story 7: Test all URL validation cases in ssrf-guard

### User Story

As a developer, I want full test coverage of the SSRF guard so that URL validation cannot be bypassed by crafted inputs.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/ssrf-guard.test.ts`
- [ ] Tests cover:
  1. Valid HTTPS URL → `ok: true` with sanitised URL
  2. Valid HTTP URL → `ok: true`
  3. Invalid URL (not parseable) → `ok: false`, reason `url_parse_failed`
  4. FTP scheme → `ok: false`, reason contains `unsupported_scheme`
  5. `localhost` hostname → `ok: false`, reason contains `blocked_hostname`
  6. `169.254.169.254` (metadata) → `ok: false`, reason contains `blocked_hostname`
  7. Private IPv4 `10.0.0.1` → `ok: false`, reason contains `blocked_private_ipv4`
  8. Private IPv4 `192.168.1.1` → `ok: false`, reason contains `blocked_private_ipv4`
  9. Private IPv4 `172.16.0.1` → `ok: false`, reason contains `blocked_private_ipv4`
  10. IPv6 loopback `::1` → `ok: false`, reason contains `blocked_private_ipv6`
  11. URL with credentials → `ok: true`, sanitised URL has no username/password
  12. Empty hostname → `ok: false`, reason `empty_hostname`

### Tasks

#### Task 7.1: Create test file

**File:** `apps/api/tests/ssrf-guard.test.ts`

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { validateExternalUrl } from "../src/lib/ssrf-guard";

test("ssrf-guard: valid HTTPS URL passes", () => {
  const result = validateExternalUrl("https://example.com/jobs/123");
  assert.equal(result.ok, true);
  assert.ok(result.sanitised);
  assert.equal(result.sanitised.hostname, "example.com");
});

test("ssrf-guard: valid HTTP URL passes", () => {
  const result = validateExternalUrl("http://example.com/page");
  assert.equal(result.ok, true);
});

test("ssrf-guard: unparseable URL fails", () => {
  const result = validateExternalUrl("not a url at all");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "url_parse_failed");
});

test("ssrf-guard: FTP scheme rejected", () => {
  const result = validateExternalUrl("ftp://files.example.com/resume.pdf");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("unsupported_scheme"));
});

test("ssrf-guard: localhost blocked", () => {
  const result = validateExternalUrl("http://localhost:3000/api");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("blocked_hostname"));
});

test("ssrf-guard: metadata endpoint 169.254.169.254 blocked", () => {
  const result = validateExternalUrl("http://169.254.169.254/latest/meta-data/");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("blocked"));
});

test("ssrf-guard: private IPv4 10.x blocked", () => {
  const result = validateExternalUrl("http://10.0.0.1/internal");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("blocked_private_ipv4"));
});

test("ssrf-guard: private IPv4 192.168.x blocked", () => {
  const result = validateExternalUrl("http://192.168.1.1/admin");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("blocked_private_ipv4"));
});

test("ssrf-guard: private IPv4 172.16.x blocked", () => {
  const result = validateExternalUrl("http://172.16.0.1/secret");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("blocked_private_ipv4"));
});

test("ssrf-guard: IPv6 loopback blocked", () => {
  const result = validateExternalUrl("http://[::1]:8080/api");
  assert.equal(result.ok, false);
  assert.ok(result.reason?.includes("blocked_private_ipv6"));
});

test("ssrf-guard: credentials stripped from sanitised URL", () => {
  const result = validateExternalUrl("https://user:pass@example.com/page");
  assert.equal(result.ok, true);
  assert.ok(result.sanitised);
  assert.equal(result.sanitised.username, "");
  assert.equal(result.sanitised.password, "");
});

test("ssrf-guard: empty hostname rejected", () => {
  const result = validateExternalUrl("http:///path");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "empty_hostname");
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 7.1 | Create test file | 20 min |
| 7.2 | Run and verify all 12 assertions pass | 10 min |

### Tests

```typescript
// Each test asserts:
assert.equal(result.ok, true/false);
// And for failures, the reason string matches expected pattern
assert.ok(result.reason?.includes("expected_substring"));
```

---

## Story 8: Test identity module error paths in apps/web

### User Story

As a developer, I want tests for `signIn`, `signUp`, and `signOut` error paths so that auth failures are handled correctly and don't leak information.

### Acceptance Criteria

- [ ] Test file exists at `apps/web/__tests__/lib/identity.test.ts`
- [ ] Tests cover:
  1. `signUp` with duplicate email → throws `ConflictError`
  2. `signUp` with invalid input (Supabase error) → throws `ValidationError`
  3. `signIn` with wrong password → throws error
  4. `signIn` with non-existent user → throws error
  5. `signOut` when no session → resolves without error
- [ ] Supabase client is mocked (no real network calls)

### Tasks

#### Task 8.1: Create test file

**File:** `apps/web/__tests__/lib/identity.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createIdentityModule } from "@/lib/identity";

// Mock the Supabase client
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mock @retune/db
vi.mock("@retune/db", () => ({
  db: { insert: vi.fn().mockReturnThis(), values: vi.fn().mockReturnThis() },
  users: {},
  subscriptions: {},
  processorConsents: {},
}));

import { createClient } from "@/lib/supabase/server";

const mockSupabase = {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (createClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
});

describe("identity.signUp", () => {
  it("throws ConflictError when email already exists", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "User already registered" },
    });

    const identity = createIdentityModule();
    await expect(
      identity.signUp({ email: "dup@test.com", password: "password123" })
    ).rejects.toThrow("An account with this email already exists");
  });

  it("throws ValidationError for other Supabase errors", async () => {
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: null },
      error: { message: "Password too short" },
    });

    const identity = createIdentityModule();
    await expect(
      identity.signUp({ email: "new@test.com", password: "x" })
    ).rejects.toThrow("Password too short");
  });
});

describe("identity.signIn", () => {
  it("throws error when password is wrong", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const identity = createIdentityModule();
    await expect(
      identity.signIn({ email: "user@test.com", password: "wrong" })
    ).rejects.toThrow();
  });

  it("throws error for non-existent user", async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const identity = createIdentityModule();
    await expect(
      identity.signIn({ email: "ghost@test.com", password: "pass" })
    ).rejects.toThrow();
  });
});

describe("identity.signOut", () => {
  it("resolves without error when no session exists", async () => {
    mockSupabase.auth.signOut.mockResolvedValue({ error: null });

    const identity = createIdentityModule();
    const result = await identity.signOut();
    expect(result).toEqual({ ok: true });
  });
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 8.1 | Create test file with mocks | 30 min |
| 8.2 | Verify mocks align with actual Supabase client shape | 15 min |
| 8.3 | Run and verify all 5 assertions pass | 10 min |

### Tests

```typescript
// signUp duplicate:
await expect(identity.signUp({...})).rejects.toThrow("An account with this email already exists");
// signUp validation:
await expect(identity.signUp({...})).rejects.toThrow("Password too short");
// signIn wrong password:
await expect(identity.signIn({...})).rejects.toThrow();
// signOut no session:
expect(result).toEqual({ ok: true });
```

---

## Story 9: Test GET /generations auth check

### User Story

As a developer, I want a test that verifies the `/generations` endpoint enforces authentication so that unauthenticated users cannot list other users' generations.

### Acceptance Criteria

- [ ] Test file exists at `apps/api/tests/generations-auth.test.ts`
- [ ] Tests cover:
  1. Request without `x-retune-internal-key` when key is configured → 401
  2. Request with wrong key → 401
  3. Request with correct key + valid user-id → 200 with array response
  4. Response shape has `generations` array with expected fields
- [ ] Tests use the actual Hono app instance (not mocked routes)

### Tasks

#### Task 9.1: Create test file

**File:** `apps/api/tests/generations-auth.test.ts`

```typescript
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { afterEach, beforeEach } from "node:test";

// Set env before importing app
const INTERNAL_KEY = "test-key-for-generations-auth";
const VALID_USER = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

beforeEach(async () => {
  process.env.RETUNE_INTERNAL_API_KEY = INTERNAL_KEY;
  process.env.RETUNE_PERSIST = "pglite";
  process.env.RETUNE_PGLITE_DATADIR = await mkdtemp(join(tmpdir(), "retune-gen-auth-"));
});

afterEach(() => {
  delete process.env.RETUNE_INTERNAL_API_KEY;
  delete process.env.RETUNE_PERSIST;
  delete process.env.RETUNE_PGLITE_DATADIR;
});

test("GET /generations without internal key returns 401", async () => {
  const { app } = await import("../src/app");
  const res = await app.request("/generate/generations", {
    headers: { "x-retune-user-id": VALID_USER },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.ok(body.error);
});

test("GET /generations with wrong key returns 401", async () => {
  const { app } = await import("../src/app");
  const res = await app.request("/generate/generations", {
    headers: {
      "x-retune-internal-key": "wrong-key",
      "x-retune-user-id": VALID_USER,
    },
  });
  assert.equal(res.status, 401);
});

test("GET /generations with correct auth returns 200", async () => {
  const { app } = await import("../src/app");
  const res = await app.request("/generate/generations", {
    headers: {
      "x-retune-internal-key": INTERNAL_KEY,
      "x-retune-user-id": VALID_USER,
    },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.generations));
});

test("GET /generations response shape has expected fields", async () => {
  const { app } = await import("../src/app");
  const res = await app.request("/generate/generations", {
    headers: {
      "x-retune-internal-key": INTERNAL_KEY,
      "x-retune-user-id": VALID_USER,
    },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok("generations" in body);
  // Empty array is valid for a new user
  assert.ok(Array.isArray(body.generations));
});
```

### Subtasks

| # | Task | Effort |
|---|------|--------|
| 9.1 | Create test file | 25 min |
| 9.2 | Verify Hono app can be imported in test context | 15 min |
| 9.3 | Run and verify all 4 assertions pass | 10 min |

### Tests

```typescript
// Auth enforcement:
assert.equal(res.status, 401);  // missing/wrong key
// Success path:
assert.equal(res.status, 200);
assert.ok(Array.isArray(body.generations));
```

---

## Implementation Order

1. Stories 1–3 (coverage measurement) — can be done in parallel
2. Story 4 (CI job) — depends on 1–3
3. Stories 5–9 (critical path tests) — can be done in parallel, independent of 1–4

## Total Effort Estimate

| Story | Effort |
|-------|--------|
| 1. Agent coverage | 30 min |
| 2. API coverage | 25 min |
| 3. Web coverage | 30 min |
| 4. CI job | 40 min |
| 5. Billing double-spend | 70 min |
| 6. Internal auth | 35 min |
| 7. SSRF guard | 30 min |
| 8. Identity error paths | 55 min |
| 9. Generations auth | 50 min |
| **Total** | **~6 hours** |
