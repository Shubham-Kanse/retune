# Epic 02 — E2E in CI

## Summary

Add a blocking `test-e2e` job to the CI workflow that runs all 13 Playwright specs against the Next.js dev server with auth bypass. E2E failures must block merges — no `|| true` allowed.

## Current State

- 13 Playwright spec files exist in `apps/web/e2e/`
- `apps/web/playwright.config.ts` exists (534 bytes), configured for `http://127.0.0.1:3100`
- E2E tests are NOT run in CI — only locally
- The config already uses `E2E_AUTH_BYPASS=1` in its `webServer.command`
- No auth fixture exists for test user session setup

## Target State

- `test-e2e` job runs in CI after `test-web` passes
- All 13 specs execute against a real Next.js dev server in the CI runner
- Auth is bypassed via `E2E_AUTH_BYPASS=1` with a seeded test user
- Test results (traces, screenshots) uploaded as artifacts
- Failures block the workflow

---

## Story 1: Add `test-e2e` Job to CI Workflow

### User Story

As a developer, I want E2E tests to run automatically in CI so that UI regressions are caught before code is merged.

### Acceptance Criteria

- [ ] A `test-e2e` job exists in `.github/workflows/cognitive-cycle.yml`
- [ ] The job depends on `test-web` (runs after it passes)
- [ ] The job installs Playwright browsers: `npx playwright install --with-deps chromium`
- [ ] The job starts the Next.js dev server: `pnpm --filter @retune/web dev &`
- [ ] The job waits for the server: `npx wait-on http://localhost:3000`
- [ ] The job runs: `pnpm --filter @retune/web exec playwright test`
- [ ] The job uploads test results as artifacts (traces, screenshots, HTML report)
- [ ] The job is blocking — failures fail the workflow (no `|| true`)
- [ ] The job sets `E2E_AUTH_BYPASS=1` environment variable
- [ ] The job uses PGlite for database (no external Postgres required)

### Tasks

#### Task 1.1: Add `test-e2e` job to workflow

**File:** `.github/workflows/cognitive-cycle.yml`

Add after the `test-web` job:

```yaml
  test-e2e:
    name: test (E2E Playwright)
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: [test-web]
    env:
      E2E_AUTH_BYPASS: "1"
      RETUNE_PERSIST: pglite
      AI_PROVIDER: openai
      OPENAI_API_KEY: dummy-not-used-e2e-only
      ANTHROPIC_API_KEY: dummy-not-used-e2e-only
      JWT_SECRET: e2e-test-jwt-secret-thirty-two-chars-minimum
      NEXT_PUBLIC_SUPABASE_URL: http://localhost:54321
      NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-anon-key-for-e2e
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      NEXT_PUBLIC_API_URL: http://localhost:4000
      RETUNE_ML_USE_STUBS: "true"
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
      - name: install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: start Next.js dev server
        run: pnpm --filter @retune/web dev &
      - name: wait for server
        run: npx wait-on http://localhost:3000 --timeout 60000
      - name: seed test user
        run: pnpm --filter @retune/web exec tsx e2e/fixtures/seed-test-user.ts
      - name: run Playwright tests
        run: pnpm --filter @retune/web exec playwright test
      - name: upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            apps/web/playwright-report/
            apps/web/test-results/
          retention-days: 7
```

**Subtasks:**
- Add `test-e2e` job with all environment variables — 20 min
- Verify `needs: [test-web]` dependency is correct — 5 min
- Verify artifact upload path matches Playwright config output — 5 min
- Push to branch and verify job appears in workflow — 10 min

#### Task 1.2: Update Playwright config for CI compatibility

**File:** `apps/web/playwright.config.ts`

Replace the existing config to support both local and CI execution:

```typescript
import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: isCI ? 2 : 1,
  reporter: isCI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: isCI
    ? undefined
    : {
        command: "E2E_AUTH_BYPASS=1 pnpm --filter @retune/web dev --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: true,
        timeout: 120000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

**Subtasks:**
- Update config to detect CI environment — 10 min
- Add `github` reporter for inline annotations — 5 min
- Set `webServer` to `undefined` in CI (server started separately) — 5 min
- Add screenshot on failure — 5 min
- Test locally with `CI=1 npx playwright test` — 10 min

### Tests

```bash
# Verify Playwright config is valid
cd apps/web && npx playwright test --list

# Verify CI reporter is set when CI=1
CI=1 node -e "
  process.env.CI = '1';
  const config = require('./playwright.config.ts');
  // Should not throw
"

# Verify job blocks on failure (no || true in workflow)
grep -c "|| true" .github/workflows/cognitive-cycle.yml | grep -q "0" || \
  ! grep "playwright test.*|| true" .github/workflows/cognitive-cycle.yml
```

---

## Story 2: Create Auth Bypass Fixture for E2E

### User Story

As a developer, I want E2E tests to authenticate using a bypass mechanism so that tests don't depend on external auth providers and run deterministically.

### Acceptance Criteria

- [ ] `apps/web/e2e/fixtures/auth.ts` exports a custom Playwright `test` fixture with pre-authenticated session
- [ ] The fixture sets up a test user session when `E2E_AUTH_BYPASS=1` is set
- [ ] The test user has a known ID: `e2e-test-user-00000000-0000-0000-0000-000000000001`
- [ ] The test user has email `e2e@retuned.cv` and completed onboarding
- [ ] Existing specs can import from `./fixtures/auth` to get authenticated context
- [ ] The fixture works with PGlite (no external database required)

### Tasks

#### Task 2.1: Create auth fixture

**File:** `apps/web/e2e/fixtures/auth.ts`

```typescript
import { test as base, type Page } from "@playwright/test";

const TEST_USER = {
  id: "e2e-test-user-00000000-0000-0000-0000-000000000001",
  email: "e2e@retuned.cv",
  name: "E2E Test User",
};

/**
 * Custom test fixture that injects an authenticated session.
 * Requires E2E_AUTH_BYPASS=1 on the server side.
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Set the auth bypass cookie that the middleware recognizes
    await page.context().addCookies([
      {
        name: "e2e-auth-bypass",
        value: JSON.stringify({
          userId: TEST_USER.id,
          email: TEST_USER.email,
          name: TEST_USER.name,
        }),
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await use(page);
  },
});

export { expect } from "@playwright/test";
export { TEST_USER };
```

**Subtasks:**
- Create `apps/web/e2e/fixtures/auth.ts` with test fixture — 20 min
- Verify fixture exports `test`, `expect`, and `TEST_USER` — 5 min
- Test fixture locally with one spec — 10 min

#### Task 2.2: Create test user seed script

**File:** `apps/web/e2e/fixtures/seed-test-user.ts`

```typescript
import { create_pglite, pglite_drizzle, run_migrations } from "@retune/db/pg";
import { profiles, credits } from "@retune/db/pg/schema";

const TEST_USER_ID = "e2e-test-user-00000000-0000-0000-0000-000000000001";

async function seed() {
  const client = await create_pglite();
  await run_migrations({ kind: "pglite", client });
  const db = pglite_drizzle(client);

  await db
    .insert(profiles)
    .values({
      id: TEST_USER_ID,
      email: "e2e@retuned.cv",
      fullName: "E2E Test User",
      onboardingComplete: true,
    })
    .onConflictDoNothing();

  await db
    .insert(credits)
    .values({
      userId: TEST_USER_ID,
      balance: 999,
      plan: "pro",
    })
    .onConflictDoNothing();

  console.log("✅ E2E test user seeded");
  await client.close();
}

seed();
```

**Subtasks:**
- Create seed script — 15 min
- Verify it runs without errors: `tsx e2e/fixtures/seed-test-user.ts` — 10 min
- Verify test user exists in PGlite after seeding — 5 min

#### Task 2.3: Add auth bypass middleware support

**File:** `apps/web/src/middleware.ts`

Add at the top of the middleware function (before any auth checks):

```typescript
// E2E auth bypass — only active when E2E_AUTH_BYPASS=1
if (process.env.E2E_AUTH_BYPASS === "1") {
  const bypassCookie = request.cookies.get("e2e-auth-bypass");
  if (bypassCookie?.value) {
    try {
      const user = JSON.parse(bypassCookie.value);
      // Set the session headers that downstream code expects
      const response = NextResponse.next();
      response.headers.set("x-user-id", user.userId);
      response.headers.set("x-user-email", user.email);
      return response;
    } catch {
      // Invalid cookie, fall through to normal auth
    }
  }
}
```

**Subtasks:**
- Add bypass logic to middleware — 15 min
- Ensure bypass is gated behind `E2E_AUTH_BYPASS=1` (never active in production) — 5 min
- Test locally: set cookie, verify middleware passes through — 10 min

### Tests

```typescript
// apps/web/e2e/fixtures/auth.spec.ts — verify fixture works
import { test, expect, TEST_USER } from "./auth";

test("authenticated page has bypass cookie", async ({ authenticatedPage }) => {
  const cookies = await authenticatedPage.context().cookies();
  const bypassCookie = cookies.find((c) => c.name === "e2e-auth-bypass");
  expect(bypassCookie).toBeDefined();
  const value = JSON.parse(bypassCookie!.value);
  expect(value.userId).toBe(TEST_USER.id);
  expect(value.email).toBe(TEST_USER.email);
});

test("authenticated page can access protected route", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/dashboard");
  // Should NOT redirect to /login
  await expect(authenticatedPage).not.toHaveURL(/login/);
});
```

```bash
# Verify bypass is NOT active without env var
unset E2E_AUTH_BYPASS
curl -s -b "e2e-auth-bypass={}" http://localhost:3000/dashboard -o /dev/null -w "%{http_code}" | grep -q "307"

# Verify bypass IS active with env var
E2E_AUTH_BYPASS=1 pnpm --filter @retune/web dev &
curl -s -b 'e2e-auth-bypass={"userId":"test","email":"test@test.com","name":"Test"}' \
  http://localhost:3000/dashboard -o /dev/null -w "%{http_code}" | grep -q "200"
```

---

## Story 3: Upload Test Artifacts and Configure Reporting

### User Story

As a developer, I want E2E test results (traces, screenshots, HTML report) uploaded as CI artifacts so that I can debug failures without reproducing them locally.

### Acceptance Criteria

- [ ] Playwright HTML report is generated in CI
- [ ] Test traces (`.zip` files) are uploaded on failure
- [ ] Screenshots on failure are uploaded
- [ ] Artifacts are retained for 7 days
- [ ] The GitHub Actions summary includes a link to the artifact

### Tasks

#### Task 3.1: Configure Playwright output directories

**File:** `apps/web/playwright.config.ts`

Add output configuration (already included in Story 1 Task 1.2 config):

```typescript
export default defineConfig({
  // ... existing config
  outputDir: "./test-results",
  reporter: isCI ? [["html", { open: "never", outputFolder: "playwright-report" }], ["github"]] : "list",
});
```

**Subtasks:**
- Verify `outputDir` and `reporter` are set — 5 min
- Add `playwright-report/` and `test-results/` to `.gitignore` — 5 min

#### Task 3.2: Add `.gitignore` entries

**File:** `apps/web/.gitignore`

Append:

```
# Playwright
playwright-report/
test-results/
```

**Subtasks:**
- Add gitignore entries — 5 min
- Verify no test artifacts are tracked — 5 min

#### Task 3.3: Add summary step to workflow

**File:** `.github/workflows/cognitive-cycle.yml`

Add after the artifact upload step in `test-e2e`:

```yaml
      - name: add summary
        if: always()
        run: |
          echo "## 🎭 Playwright E2E Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          if [ -f apps/web/playwright-report/index.html ]; then
            echo "📊 HTML report uploaded as artifact: **playwright-report**" >> $GITHUB_STEP_SUMMARY
          fi
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "Test artifacts retained for 7 days." >> $GITHUB_STEP_SUMMARY
```

**Subtasks:**
- Add summary step — 10 min
- Verify summary appears in GitHub Actions run — 5 min

### Tests

```bash
# Verify .gitignore has entries
grep -q "playwright-report" apps/web/.gitignore
grep -q "test-results" apps/web/.gitignore

# Verify artifacts are uploaded (check in GitHub Actions UI after a run)
# The upload-artifact step should show:
#   - playwright-report/ directory
#   - test-results/ directory (if any failures)

# Verify HTML report is generated
cd apps/web && CI=1 npx playwright test || true
[ -f playwright-report/index.html ]
```

---

## Story 4: Ensure All 13 Specs Pass in CI Environment

### User Story

As a developer, I want all existing E2E specs to pass in the CI environment so that the `test-e2e` job is green from day one.

### Acceptance Criteria

- [ ] All 13 spec files pass with `E2E_AUTH_BYPASS=1` and PGlite
- [ ] Specs that require authentication use the auth fixture
- [ ] Specs that test public pages work without authentication
- [ ] No spec has a hardcoded `localhost:3100` (use `baseURL` from config)
- [ ] Flaky tests are identified and given `test.fixme()` or increased retries (max 2 specs)

### Tasks

#### Task 4.1: Audit specs for CI compatibility

Review each spec file for:
- Hardcoded ports (must use `baseURL`)
- External service dependencies (must be stubbed)
- Auth requirements (must use fixture or test public routes)

**Files to audit:**
- `apps/web/e2e/onboarding-v2.spec.ts`
- `apps/web/e2e/onboarding-sota.spec.ts`
- `apps/web/e2e/auth-wiring.spec.ts`
- `apps/web/e2e/auth-smoke.spec.ts`
- `apps/web/e2e/middleware-guards.spec.ts`
- `apps/web/e2e/results-download.spec.ts`
- `apps/web/e2e/pipeline-controls.spec.ts`
- `apps/web/e2e/public-pages.spec.ts`
- `apps/web/e2e/public-auth.spec.ts`
- `apps/web/e2e/authenticated-flow.spec.ts`
- `apps/web/e2e/navigation-guards.spec.ts`
- `apps/web/e2e/onboarding.spec.ts`

**Subtasks:**
- Audit all 13 specs for hardcoded URLs — 30 min
- Replace any `localhost:3100` with relative paths (uses `baseURL`) — 15 min
- Identify specs needing auth fixture vs public-only — 15 min
- Fix any external dependencies (mock or stub) — 30 min

#### Task 4.2: Run full suite locally in CI-like mode

```bash
# Simulate CI environment locally
export CI=1
export E2E_AUTH_BYPASS=1
export RETUNE_PERSIST=pglite
export RETUNE_ML_USE_STUBS=true
export AI_PROVIDER=openai
export OPENAI_API_KEY=dummy
export JWT_SECRET=e2e-test-jwt-secret-thirty-two-chars-minimum

# Start server
pnpm --filter @retune/web dev &
npx wait-on http://localhost:3000

# Seed test user
pnpm --filter @retune/web exec tsx e2e/fixtures/seed-test-user.ts

# Run all specs
pnpm --filter @retune/web exec playwright test

# Check results
echo "Exit code: $?"
```

**Subtasks:**
- Run full suite in CI-like mode locally — 20 min
- Fix any failures — 30 min (variable)
- Document any specs marked `test.fixme()` with reason — 10 min

### Tests

```bash
# All 13 specs must be listed
cd apps/web && npx playwright test --list | wc -l  # Should be >= 13

# Full run must exit 0
cd apps/web && CI=1 E2E_AUTH_BYPASS=1 npx playwright test
echo "Exit code: $?"  # Must be 0

# No hardcoded ports in specs
! grep -r "localhost:3100" apps/web/e2e/*.spec.ts
! grep -r "127.0.0.1:3100" apps/web/e2e/*.spec.ts
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Add `test-e2e` job to CI | 1.5 hours |
| Story 2: Auth bypass fixture | 1.5 hours |
| Story 3: Artifact upload and reporting | 30 min |
| Story 4: Ensure all specs pass | 2 hours |
| **Total** | **~5.5 hours** |

## Risks

- Playwright browser install adds ~2 min to CI time — acceptable
- PGlite in CI may behave differently than Postgres — mitigated by existing test-ts job using PGlite
- Some specs may be flaky due to timing — mitigated by `retries: 2` in CI config
- `E2E_AUTH_BYPASS` must NEVER be set in production — enforced by env validation in Epic 03
