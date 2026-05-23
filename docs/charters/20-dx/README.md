# Charter 20 — Developer Experience

## Mission

Reduce time-to-first-run for any new contributor from "read the README, guess what's missing, debug env vars for an hour" to a single command that validates prerequisites, provisions infrastructure, seeds data, and starts all services.

## Problem Statement

The Retune codebase has accumulated several DX friction points:

| Issue | Impact |
|-------|--------|
| No one-command setup — `pnpm dev` skips prerequisite checks, DB provisioning, and seeding | New contributors spend 30–60 min debugging before first successful run |
| `.env` files committed to git with local dev values (`apps/web/.env`, `apps/api/.env`) | Security risk; merge conflicts on every clone |
| No runtime env validation — `apps/web/src/lib/env.ts` is minimal, no Zod schema | Cryptic runtime errors when vars are missing or malformed |
| No pre-commit hooks — `.git/hooks/` contains only `.sample` files | Secrets, lint failures, and broken formatting reach the remote |
| `.gitignore` gaps — `apps/web/data/`, `**/*.bak`, `**/.tmp-*`, `keys/`, `.env.vercel` not excluded | Accidental commits of generated data and backup files |
| `scripts/seed.ts` undocumented and not automated | Fresh clones have empty databases |
| Startup self-checks (`apps/api/scripts/startup-selfcheck.mjs`, `apps/web/scripts/startup-selfcheck.mjs`) exist but are never invoked | Wasted prior work; silent failures |

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Time from `git clone` to running app (new machine) | ~45 min | < 3 min |
| Secrets committed to git (last 30 days) | 2 `.env` files | 0 |
| Startup crashes from missing env vars | ~1/week | 0 |
| Lint/format issues reaching CI | ~15% of PRs | < 2% |

## Epics

| # | Epic | Scope |
|---|------|-------|
| 01 | [One-Command Setup](./epic-01-one-command-setup.md) | Devcontainer, `scripts/setup.sh`, README update |
| 02 | [Env Validation](./epic-02-env-validation.md) | Zod schemas for web + API, startup imports, tests |
| 03 | [Pre-Commit Hooks](./epic-03-pre-commit-hooks.md) | Husky, lint-staged, secret scanning, `.gitignore` hardening |

## Dependencies

- Zod already in `apps/web` dependencies
- Biome already configured as the project linter/formatter
- Docker required for `pnpm db:up` (Postgres container)

## Out of Scope

- CI/CD pipeline changes (separate charter)
- Production deployment configuration
- IDE-specific settings beyond devcontainer

## Owner

DX / Platform team

## Timeline

Target: 1 sprint (2 weeks). Epics are independent and can be parallelized.


## Architect addenda (2026-05-22)

- **`apps/web/src/lib/env.ts` is the single source of truth target** — Epic 02 (Env Validation) co-owns this file with Charter 02-Codebase-Quality Epic 06. Single PR, single owner. Don't ship two competing env-validation systems. Replace the existing broken file (validates wrong vars + `process.exit(1)`) with a Zod schema for the actual env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `RETUNE_INTERNAL_API_KEY`, `RETUNE_INTERNAL_GENERATION_ACCESS_SECRET`, `JWT_SECRET`, `RETUNE_DATABASE_URL`, `RETUNE_DB_KIND`, `RETUNE_PERSIST`, `RETUNE_TEMPORAL`, `RETUNE_API_CORS`, `SMTP_*`.
- **Pre-commit hook overlap with Charter 01 Epic 02** — both charters specify gitleaks pre-commit. Single owner: Charter 01 Epic 02 (since security drives the requirement). Charter 20 Epic 03 references and integrates, doesn't duplicate.
- **Existing `startup-selfcheck.mjs` files are unused** — `apps/web/scripts/startup-selfcheck.mjs` (921 B), `apps/api/scripts/startup-selfcheck.mjs` (1310 B), `apps/worker/scripts/startup-selfcheck.mjs` (1199 B). All three exist; none are invoked by `pnpm dev`. Epic 01 (one-command setup) must wire `pnpm verify:env` to invoke all three before the dev servers start.
- **`infra/compose/dev.yml` IS the actual full dev stack** (Postgres+pgvector, Redis, Temporal, ML), but `pnpm dev` does NOT start it. The root `docker-compose.yml` is wrong (single `retune` service, no api/worker/ml/Redis/Temporal). Epic 01 must reconcile: either delete the root `docker-compose.yml` or fix it to match `infra/compose/dev.yml`. Recommend delete + alias `pnpm db:up` to `pnpm dev:infra`.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 20.
