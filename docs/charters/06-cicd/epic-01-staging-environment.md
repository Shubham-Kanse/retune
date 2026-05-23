# Epic 01 — Staging Environment

## Summary

Create a staging environment that deploys from the `develop` branch to a Vercel preview environment with an isolated Supabase branch database. The staging deploy is triggered by CI after all tests pass, and a smoke test validates the deployment.

## Current State

- No staging environment exists
- `deploy.sh` deploys directly to production Vercel
- No preview environments configured
- No branch databases

## Target State

- Vercel preview environment named `staging` auto-deploys from `develop`
- Supabase branch database isolates staging data from production
- CI job deploys to staging after all tests pass on `develop`
- Smoke test validates staging health endpoint returns 200
- Staging URLs documented in charter README

---

## Story 1: Create Vercel Preview Environment for Staging

### User Story

As a developer, I want a Vercel preview environment that deploys from the `develop` branch so that I can validate changes before they reach production.

### Acceptance Criteria

- [ ] Vercel project has a preview environment aliased to `staging.retuned.cv`
- [ ] Pushes to `develop` branch trigger a Vercel preview deployment
- [ ] The preview environment uses staging-specific environment variables (not production)
- [ ] The staging URL `https://staging.retuned.cv` resolves and serves the app
- [ ] Production environment remains unchanged and only deploys from `main`

### Tasks

#### Task 1.1: Configure Vercel project for staging alias

**File:** `vercel.json` (create at repo root)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "git": {
    "deploymentEnabled": {
      "main": true,
      "develop": true
    }
  },
  "alias": {
    "develop": ["staging.retuned.cv"]
  }
}
```

**Subtasks:**
- Create `vercel.json` with branch-to-alias mapping — 15 min
- Configure DNS CNAME record for `staging.retuned.cv` → `cname.vercel-dns.com` — 15 min
- Add the alias domain in Vercel Dashboard → Project → Domains — 10 min

#### Task 1.2: Set staging environment variables in Vercel

Configure the following environment variables in Vercel Dashboard → Project → Settings → Environment Variables, scoped to **Preview** environment with branch filter `develop`:

| Variable | Value (staging) |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role key |
| `RETUNE_DATABASE_URL` | Staging branch database connection string |
| `NEXT_PUBLIC_APP_URL` | `https://staging.retuned.cv` |
| `NEXT_PUBLIC_API_URL` | `https://staging-api.retuned.cv` |
| `AI_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | Staging-scoped key with lower rate limits |
| `RETUNE_ML_USE_STUBS` | `true` |

**Subtasks:**
- Set all Preview-scoped env vars in Vercel Dashboard — 20 min
- Verify env vars are NOT visible in Production environment — 5 min

#### Task 1.3: Update `deploy.sh` to support environment argument

**File:** `deploy.sh`

Add environment selection at the top of the script:

```bash
#!/bin/bash
set -e

ENVIRONMENT="${1:-production}"

if [ "$ENVIRONMENT" = "staging" ]; then
    echo "🚀 Deploying to STAGING..."
    DEPLOY_URL="https://staging.retuned.cv"
elif [ "$ENVIRONMENT" = "production" ]; then
    echo "🚀 Deploying to PRODUCTION..."
    DEPLOY_URL="https://retuned.cv"
else
    echo "❌ Unknown environment: $ENVIRONMENT. Use 'staging' or 'production'."
    exit 1
fi
```

**Subtasks:**
- Add environment argument parsing to `deploy.sh` — 15 min
- Update health check URL to use `$DEPLOY_URL` — 5 min
- Test `./deploy.sh staging` locally (dry-run) — 10 min

### Tests

```bash
# Verify staging URL resolves
curl -s -o /dev/null -w "%{http_code}" https://staging.retuned.cv | grep -q "200"

# Verify staging env vars are isolated (not production DB)
curl -s https://staging.retuned.cv/api/health | jq -r '.environment' | grep -q "preview"

# Verify production is unaffected
curl -s -o /dev/null -w "%{http_code}" https://retuned.cv | grep -q "200"
```

---

## Story 2: Create Supabase Branch Database for Staging

### User Story

As a developer, I want staging to use an isolated Supabase branch database so that staging tests never corrupt production data.

### Acceptance Criteria

- [ ] A Supabase branch named `staging` exists, forked from the production project
- [ ] The branch database has the same schema as production (migrations applied)
- [ ] The staging branch connection string is configured in Vercel Preview env vars
- [ ] Staging branch database is seeded with test data (not production PII)
- [ ] Branch database can be reset without affecting production

### Tasks

#### Task 2.1: Create Supabase branch via CLI

```bash
# Install Supabase CLI if not present
brew install supabase/tap/supabase

# Link to production project
supabase link --project-ref <production-project-ref>

# Create staging branch
supabase branches create staging
```

**Subtasks:**
- Install and link Supabase CLI — 10 min
- Create `staging` branch — 5 min
- Note the branch database connection string — 5 min

#### Task 2.2: Apply migrations to staging branch

```bash
# Push migrations to the staging branch
supabase db push --linked
```

**Subtasks:**
- Run `supabase db push` against staging branch — 10 min
- Verify all tables exist: `profiles`, `generations`, `credits`, `subscriptions` — 10 min

#### Task 2.3: Create staging seed script

**File:** `packages/db/src/seeds/staging.ts`

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { profiles, credits } from "../pg/schema.js";

const DATABASE_URL = process.env.RETUNE_DATABASE_URL;
if (!DATABASE_URL) throw new Error("RETUNE_DATABASE_URL required for seeding");

const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

async function seed() {
  // Test user for E2E and staging validation
  await db.insert(profiles).values({
    id: "staging-test-user-00000000-0000-0000-0000-000000000001",
    email: "staging@retuned.cv",
    fullName: "Staging Test User",
    onboardingComplete: true,
  }).onConflictDoNothing();

  await db.insert(credits).values({
    userId: "staging-test-user-00000000-0000-0000-0000-000000000001",
    balance: 500,
    plan: "pro",
  }).onConflictDoNothing();

  console.log("✅ Staging seed complete");
  await sql.end();
}

seed();
```

**Subtasks:**
- Write seed script with test user — 20 min
- Add `"db:seed:staging": "tsx packages/db/src/seeds/staging.ts"` to root `package.json` — 5 min
- Run seed against staging branch and verify — 10 min

### Tests

```bash
# Verify staging database has correct schema
psql "$STAGING_DATABASE_URL" -c "\dt" | grep -q "profiles"
psql "$STAGING_DATABASE_URL" -c "\dt" | grep -q "generations"
psql "$STAGING_DATABASE_URL" -c "\dt" | grep -q "credits"

# Verify test user exists
psql "$STAGING_DATABASE_URL" -c "SELECT email FROM profiles WHERE email = 'staging@retuned.cv'" | grep -q "staging@retuned.cv"

# Verify production database is NOT the same connection
[ "$STAGING_DATABASE_URL" != "$PRODUCTION_DATABASE_URL" ]
```

---

## Story 3: Add Staging Deploy Job to CI Workflow

### User Story

As a developer, I want the CI pipeline to automatically deploy to staging after all tests pass on the `develop` branch so that staging always reflects the latest validated code.

### Acceptance Criteria

- [ ] A `staging-deploy` job exists in `.github/workflows/cognitive-cycle.yml`
- [ ] The job only runs on pushes to the `develop` branch
- [ ] The job runs after `test-ts`, `test-python`, `test-web`, and `lint` all pass
- [ ] The job uses `amondnet/vercel-action` to trigger a Vercel preview deployment
- [ ] The job outputs the deployment URL for downstream jobs
- [ ] Failed deployments fail the workflow (not `|| true`)

### Tasks

#### Task 3.1: Add `staging-deploy` job to workflow

**File:** `.github/workflows/cognitive-cycle.yml`

Add after the `codegen-drift` job:

```yaml
  staging-deploy:
    name: deploy to staging
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [typecheck, lint, test-ts, test-python, test-web]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    outputs:
      deployment-url: ${{ steps.deploy.outputs.preview-url }}
    steps:
      - uses: actions/checkout@v4
      - name: deploy to Vercel preview (staging)
        id: deploy
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          alias-domains: staging.retuned.cv
      - name: print deployment URL
        run: echo "Deployed to ${{ steps.deploy.outputs.preview-url }}"
```

**Subtasks:**
- Add `staging-deploy` job with correct `needs` dependencies — 20 min
- Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` to GitHub Actions secrets — 15 min
- Test workflow on a `develop` branch push — 15 min

#### Task 3.2: Add required GitHub Actions secrets for Vercel

Add the following secrets in GitHub → Repository → Settings → Secrets and variables → Actions:

| Secret | Source |
|--------|--------|
| `VERCEL_TOKEN` | Vercel Dashboard → Account Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Vercel Dashboard → Team Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | Vercel Dashboard → Project → Settings → General → Project ID |

**Subtasks:**
- Generate Vercel token with deployment scope — 5 min
- Copy org and project IDs from Vercel Dashboard — 5 min
- Add all three secrets to GitHub Actions — 10 min

### Tests

```yaml
# Assertion: job runs only on develop push
# Trigger a push to develop and verify:
- staging-deploy job appears in workflow run
- staging-deploy waits for all test jobs
- staging-deploy produces a preview URL output

# Assertion: job does NOT run on main push
# Trigger a push to main and verify:
- staging-deploy job is skipped (shows "skipped" status)

# Assertion: job does NOT run on PR
# Open a PR to main and verify:
- staging-deploy job is skipped
```

---

## Story 4: Add Smoke Test Job After Staging Deploy

### User Story

As a developer, I want an automated smoke test that validates the staging deployment is healthy so that I'm alerted immediately if a deploy breaks the app.

### Acceptance Criteria

- [ ] A `staging-smoke` job exists in `.github/workflows/cognitive-cycle.yml`
- [ ] The job runs after `staging-deploy` completes successfully
- [ ] The job curls `https://staging.retuned.cv/api/health` and asserts HTTP 200
- [ ] The job retries up to 5 times with 10-second intervals (deploy propagation)
- [ ] A non-200 response fails the workflow

### Tasks

#### Task 4.1: Add `staging-smoke` job to workflow

**File:** `.github/workflows/cognitive-cycle.yml`

Add after the `staging-deploy` job:

```yaml
  staging-smoke:
    name: staging smoke test
    runs-on: ubuntu-latest
    timeout-minutes: 5
    needs: [staging-deploy]
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    steps:
      - name: wait for deployment propagation
        run: sleep 15
      - name: smoke test staging health endpoint
        run: |
          for i in {1..5}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://staging.retuned.cv/api/health)
            if [ "$STATUS" = "200" ]; then
              echo "✅ Staging health check passed (attempt $i)"
              exit 0
            fi
            echo "⏳ Attempt $i: got HTTP $STATUS, retrying in 10s..."
            sleep 10
          done
          echo "❌ Staging health check failed after 5 attempts"
          exit 1
      - name: validate response body
        run: |
          BODY=$(curl -s https://staging.retuned.cv/api/health)
          echo "$BODY" | jq -e '.status == "ok"' || {
            echo "❌ Health response body invalid: $BODY"
            exit 1
          }
```

**Subtasks:**
- Add `staging-smoke` job with retry logic — 15 min
- Add response body validation — 10 min
- Test by pushing to `develop` and observing workflow — 10 min

#### Task 4.2: Add health endpoint to apps/web if not present

**File:** `apps/web/src/app/api/health/route.ts`

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? "development",
  });
}
```

**Subtasks:**
- Check if health endpoint exists; create if missing — 10 min
- Verify it returns `{ status: "ok" }` locally — 5 min

### Tests

```bash
# Local test: health endpoint returns expected shape
curl -s http://localhost:3000/api/health | jq -e '.status == "ok"'
curl -s http://localhost:3000/api/health | jq -e '.timestamp'
curl -s http://localhost:3000/api/health | jq -e '.environment'

# CI test: staging smoke passes after deploy
# Verified by the staging-smoke job succeeding in the workflow run

# Negative test: if staging is down, job fails
# Simulate by pointing to a non-existent URL — expect exit 1
```

---

## Story 5: Document Staging Environment

### User Story

As a developer, I want staging environment details documented so that the team knows how to access, debug, and reset the staging environment.

### Acceptance Criteria

- [ ] Charter README includes staging URLs table
- [ ] A `docs/charters/06-cicd/staging-runbook.md` documents access, reset, and debugging procedures
- [ ] The root `README.md` mentions the staging environment under "Runtime Topology"

### Tasks

#### Task 5.1: Create staging runbook

**File:** `docs/charters/06-cicd/staging-runbook.md`

```markdown
# Staging Environment Runbook

## URLs

| Service | URL |
|---------|-----|
| Web | https://staging.retuned.cv |
| API | https://staging-api.retuned.cv |
| Health | https://staging.retuned.cv/api/health |

## Access

- Vercel Dashboard: Project → Deployments → filter by "Preview"
- Supabase Dashboard: Project → Branches → `staging`
- Logs: Vercel Dashboard → Deployments → select staging → Functions tab

## Reset Staging Database

```bash
# Reset the Supabase branch (drops all data, re-applies migrations)
supabase branches reset staging

# Re-seed test data
RETUNE_DATABASE_URL="$STAGING_DATABASE_URL" pnpm db:seed:staging
```

## Debugging

1. Check deployment status: GitHub Actions → Cognitive Cycle CI → staging-deploy job
2. Check health: `curl https://staging.retuned.cv/api/health`
3. Check logs: Vercel Dashboard → Deployments → Runtime Logs
4. Check database: Supabase Dashboard → Branches → staging → SQL Editor

## When Staging Breaks

1. Check the latest workflow run on `develop` branch
2. If `staging-smoke` failed, check the deploy logs in Vercel
3. If the deploy succeeded but smoke failed, check if the health endpoint is returning errors
4. Reset the database if data corruption is suspected
```

**Subtasks:**
- Write staging runbook — 20 min
- Add staging URLs to charter README (already done) — 0 min
- Add one-line mention in root README.md under Runtime Topology — 5 min

### Tests

```bash
# Verify runbook file exists and is non-empty
[ -s docs/charters/06-cicd/staging-runbook.md ]

# Verify charter README has URLs table
grep -q "staging.retuned.cv" docs/charters/06-cicd/README.md
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Vercel Preview Environment | 1.5 hours |
| Story 2: Supabase Branch Database | 1 hour |
| Story 3: Staging Deploy Job in CI | 1 hour |
| Story 4: Smoke Test Job | 45 min |
| Story 5: Documentation | 25 min |
| **Total** | **~5 hours** |

## Risks

- Vercel Pro plan required for custom preview aliases — confirm plan level
- Supabase branching is in beta — may have limitations on branch count or uptime
- DNS propagation for `staging.retuned.cv` may take up to 48 hours
- Vercel action version (`v25`) must be pinned to avoid breaking changes
