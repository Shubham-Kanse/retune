# Charter 06 — CI/CD & DevOps

## Purpose

Establish a production-grade CI/CD pipeline for Retune that includes a staging environment, end-to-end testing in CI, and proper secrets management. Currently the codebase has a single CI workflow (`cognitive-cycle.yml`) with no staging deployment, E2E tests that only run locally, and production secrets committed to git.

## Current State

| Aspect | Status |
|--------|--------|
| CI workflows | **TWO files** (intern said "single") | `.github/workflows/cognitive-cycle.yml` (mature: typecheck, lint, test-ts, test-python, cross-lang-e2e, test-web, lighthouse, eval-mock, performance-gate, nightly-cron, codegen-drift) AND `.github/workflows/ci-cd.yml` (legacy: typecheck, lint, test, build, security-audit; **deploy job is `echo "Deployment would happen here"` — not real**). The legacy file should be merged-and-deleted. See new Epic 04 below. |
| Staging environment | None |
| Production deployment | `deploy.sh` — deploys directly to production Vercel |
| E2E tests | 13 Playwright specs in `apps/web/e2e/`, NOT run in CI |
| Secrets | `.env.vercel` committed to git (being remediated in Charter 01) |
| IaC | None (no Terraform, no Pulumi) |

## Goals

1. **Staging environment** — Preview deployments from `develop` branch with isolated database
2. **E2E in CI** — All 13 Playwright specs run as a blocking CI job
3. **Secrets management** — Zero secrets in git, validated at startup, injected via GitHub Actions secrets

## Epics

| # | Epic | Priority | Effort |
|---|------|----------|--------|
| 01 | [Staging Environment](./epic-01-staging-environment.md) | P0 | 3 days |
| 02 | [E2E in CI](./epic-02-e2e-in-ci.md) | P0 | 2 days |
| 03 | [Secrets Management](./epic-03-secrets-management.md) | P0 | 2 days (note: overlaps Charter 01 Epic 02 — single shared owner) |
| 04 | (NEW) Consolidate CI workflows | P0 | 1 day — Merge `ci-cd.yml` into `cognitive-cycle.yml`, then `git rm` the legacy file. Currently both run on every push, doubling CI time and creating two failure modes. |
| 05 | (NEW) Real deploy automation | P0 | 5 days — `deploy.sh` only validates `ANTHROPIC_API_KEY` (wrong if `AI_PROVIDER=openai`); the `Dockerfile` only builds `apps/web` (no api/worker/ml runtime). Decide hosting for the four apps: Vercel for web; Fly.io / Railway / Render for api+worker+ml; pin to one. |

## Success Criteria

- Every push to `develop` deploys to `https://staging.retuned.cv` after tests pass
- All 13 E2E specs pass in CI as a blocking gate before merge
- Zero secrets in the git repository; all injected via GitHub Actions secrets or Vercel environment variables
- Startup fails fast with a clear error if required env vars are missing

## Dependencies

- Charter 01 Epic 1 (`.env.vercel` removal) — coordinates with Epic 03 here
- Vercel Pro plan (required for preview environments with custom domains)
- Supabase Pro plan (required for database branching)

## Staging Environment URLs

| Service | URL |
|---------|-----|
| Web (staging) | `https://staging.retuned.cv` |
| API (staging) | `https://staging-api.retuned.cv` |
| Health check | `https://staging.retuned.cv/api/health` |
| Production | `https://retuned.cv` |
