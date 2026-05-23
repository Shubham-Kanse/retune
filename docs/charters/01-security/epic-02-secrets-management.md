# Epic 02 — Secrets Management Infrastructure

**Charter:** 01-Security
**Priority:** P0 — Week 1 (immediately after Phase −1 secret rotation)
**Complexity:** M
**Owner:** Staff Engineer + DevOps Engineer
**Status:** Created in architect rewrite (2026-05-22). The README references this file; it did not previously exist.

---

## Goal

Establish the infrastructure that makes `.env.vercel`-style accidents impossible to repeat. After Epic 01 rotated the leaked credentials, the work here defines **how secrets are stored, injected, rotated, and verified going forward** — across local dev, CI, staging, and production.

This epic is the *control plane*. The runbook from Epic 01 is the *one-time response*. Without this control plane, the next leak is a question of when, not if.

## Definition of Done

- [ ] Zero secrets committed to git in any branch, verified by `gitleaks detect --log-opts="--all"` exiting 0 in CI on every PR.
- [ ] All production secrets stored in Vercel Project Environment Variables (web) and the chosen runtime host's secret manager (api/worker/ml — see Charter 06 Epic 05 for runtime selection).
- [ ] All staging secrets stored separately from production with no human-readable overlap (e.g., `STAGING_OPENAI_API_KEY` vs `OPENAI_API_KEY`).
- [ ] All CI secrets in GitHub Actions Encrypted Secrets, scoped to Environment (`staging`, `production`).
- [ ] A single `.env.example` documents every required variable with type and example. No other `.env*` files committed.
- [ ] Quarterly key-rotation drill runs as a scheduled GitHub Actions workflow that succeeds without human intervention except for the rotation step itself (see Story 2.4).
- [ ] Local-dev secret bootstrap goes through `pnpm setup` (Charter 20 Epic 01) and pulls from the developer's personal `.env.local` — never from the repo.

---

## Code grounding (verified)

- `apps/web/src/lib/env.ts` is structurally broken — validates `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DATABASE_URL=file:./data/retune.db`, calls `process.exit(1)`. It is currently NOT imported in any hot path, but its existence is a foot-gun. Replaced by the env-validation work in Charter 20 Epic 02.
- `turbo.json` `globalEnv` declares 26 env vars, including the seven exposed in `.env.vercel`. Turbo will refuse to cache builds when these change — that's good — but it does NOT enforce their presence.
- `apps/api/src/lib/internal-auth.ts:43` uses `RETUNE_INTERNAL_API_KEY`. If unset, dev mode is silently accepted. Production must fail-closed.
- `apps/api/src/lib/generation-access-token.ts:15` requires `RETUNE_INTERNAL_GENERATION_ACCESS_SECRET >= 16 chars`, throws on missing — correct fail-fast pattern.
- `.gitignore` was updated to ignore `.env*`, `keys/`, `*.json.key`, `*.pem`, `*-service-account*.json`, `*credentials*.json`. Verified.
- No `.husky/` directory exists. Pre-commit hooks are not installed.

---

## Story 2.1 — Centralise secret storage per environment

**As a** DevOps engineer,
**I want** every secret to have one and only one storage location per environment,
**so that** rotation requires a single update.

### Acceptance criteria

- [ ] Secret inventory document (`docs/secrets-inventory.md`) lists every secret name, its purpose, the services that consume it, the environments it exists in, and its rotation cadence.
- [ ] Production secrets live only in Vercel Project Environment Variables for `apps/web` and (per Charter 06 Epic 05) the chosen long-lived runtime's secret manager for `apps/api`/`apps/worker`/`apps/ml`.
- [ ] No production secret value is duplicated across more than one storage location.
- [ ] Reading `.env.vercel` from local dev (if anyone re-creates it) is rejected by a `.gitignore` entry AND a pre-commit hook (Story 2.3).

### Tasks

- **2.1.1** Inventory every consumer of every secret. Anchor: `grep -rE "process\.env\.(OPENAI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|RETUNE_INTERNAL_API_KEY|RETUNE_INTERNAL_GENERATION_ACCESS_SECRET|RETUNE_DATABASE_URL|SMTP_PASS)" apps packages` → produce a CSV.
- **2.1.2** For each secret, decide: production storage / staging storage / local-dev source / rotation cadence. Capture in `docs/secrets-inventory.md`.
- **2.1.3** Create the staging environment in Vercel + the chosen long-lived runtime host with separate secret namespaces (`STAGING_*` prefix or distinct project IDs). Coordinate with Charter 06 Epic 01.

---

## Story 2.2 — Fail-fast startup env validation

**As a** platform engineer,
**I want** every service to fail-fast at startup when a required env var is missing or invalid,
**so that** misconfigured deploys are caught before any user request reaches them.

### Acceptance criteria

- [ ] `apps/web` validates env vars via Zod at the first server-side render. Failure logs the missing/invalid var names and returns 500 to all routes (with a generic message) until corrected.
- [ ] `apps/api` validates env vars in `apps/api/src/main.ts` before `serve()` is called. Failure logs and `process.exit(1)`.
- [ ] `apps/worker` validates the same in `apps/worker/src/main.ts` before any Temporal activity is registered.
- [ ] `apps/ml` validates via Pydantic Settings (already in place via `apps/ml/src/retune_ml/settings.py:Settings`); add explicit assertions for required values that today have defaults that are unsafe in production (`use_stubs`).
- [ ] Test: `apps/web/scripts/startup-selfcheck.mjs` is invoked from `pnpm dev` (currently exists at 921 B but never called automatically) — likewise for api and worker.

### Tasks

- **2.2.1** Replace `apps/web/src/lib/env.ts` with the architect-correct schema (see Charter 20 Epic 02 for full schema). Single source of truth.
- **2.2.2** Add `assertProductionEnv()` to `apps/api/src/main.ts` that hard-requires `RETUNE_INTERNAL_API_KEY` and `RETUNE_INTERNAL_GENERATION_ACCESS_SECRET` when `NODE_ENV !== 'development'`. Today `internal-auth.ts:43` falls back to dev mode silently.
- **2.2.3** Add the same assertion to `apps/worker/src/main.ts`. Worker today silently disables itself when `RETUNE_TEMPORAL` is unset (`apps/worker/src/main.ts:79-86`) — keep the disable for dev, but make it an explicit error in production.
- **2.2.4** Add a `pnpm verify:env` script that runs all four selfchecks against the local environment.

---

## Story 2.3 — Pre-commit secret-leak prevention

**As a** developer,
**I want** any commit that contains a secret to be rejected locally before it reaches the remote,
**so that** Phase −1 incidents become impossible to recreate.

### Acceptance criteria

- [ ] `.husky/pre-commit` runs `gitleaks protect --staged` and rejects the commit on any finding.
- [ ] `.husky/pre-commit` runs `lint-staged` (biome check on staged files).
- [ ] Pre-commit hook is installed automatically by `pnpm install` via the `prepare` script in root `package.json`.
- [ ] CI runs `gitleaks detect --log-opts="--all"` on every PR and blocks merge on any finding.
- [ ] CI publishes a SBOM via `cyclonedx` on every release tag (input for Epic 06 dependency scanning).

### Tasks

- **2.3.1** `pnpm add -DW husky lint-staged @cyclonedx/cdxgen` and configure `prepare` script.
- **2.3.2** Add `.husky/pre-commit` and `.gitleaksignore` (template-only, no real secrets).
- **2.3.3** Add a CI job to `.github/workflows/cognitive-cycle.yml` named `gitleaks-history` that scans `--log-opts="--all"`. Block on any finding.
- **2.3.4** Add a separate workflow `release-sbom.yml` triggered on tag push that produces a CycloneDX SBOM and uploads it as a release asset.

---

## Story 2.4 — Quarterly rotation drill

**As a** security engineer,
**I want** a scheduled, automated rotation drill,
**so that** "rotate a key" is a rehearsed motion not a panic motion.

### Acceptance criteria

- [ ] A GitHub Actions workflow `rotate-keys-staging.yml` runs on the 1st of each quarter against the staging environment.
- [ ] The workflow generates new credentials for OpenAI, Anthropic, Supabase service role, JWT secret, and rotates them in the staging Vercel + runtime hosts.
- [ ] Post-rotation, the workflow runs the staging E2E test suite and asserts all critical paths pass.
- [ ] The workflow files a GitHub issue summarising the rotation, total time, any failures.
- [ ] Mean time to rotate a single credential in production (with the runbook): under 15 minutes, drilled.

### Tasks

- **2.4.1** Define which credentials have automatable rotation (Supabase service role: yes via Supabase API; OpenAI key: yes via OpenAI API if available, otherwise manual; Anthropic: manual today).
- **2.4.2** Build the rotation script as a single `scripts/rotate-keys.ts` invocable per-environment.
- **2.4.3** Write the on-call runbook `docs/runbooks/secret-rotation.md` (separate from this charter) that names the engineer-on-duty, the order, and the verification commands.

---

## Out of scope

- KMS-based at-rest encryption of the database (Charter 08 future work).
- Per-customer secret stores (Charter 19 enterprise — when organisations land).
- Hardware-backed keys (deferred to enterprise tier).

---

## Hard dependencies

- Epic 01 (rotation + history rewrite) must complete before Story 2.3 can be enforced — pre-commit hook fails on the existing committed secrets otherwise.
- Charter 20 Epic 02 (env validation) co-owns the `apps/web/src/lib/env.ts` rewrite. Single PR shared between the two charters.
- Charter 06 Epic 05 (runtime hosting decision) determines where api/worker/ml secrets live.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Pre-commit hook annoys developers and gets bypassed via `--no-verify` | CI also runs gitleaks on history; bypass detected within 1 PR |
| Quarterly drill fails due to rate limits on provider APIs | Run during low-traffic window; provider-staff escalation contacts pre-arranged |
| Staging rotation fails and leaves staging broken | Drill includes automatic rollback; staging is non-production by definition |
| Two competing env-validation systems (this epic + Charter 20 E2) | Single PR, single owner per file; cross-charter integration test |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| No secrets in working tree | `gitleaks detect --no-git` exits 0 | CI |
| No secrets in history | `gitleaks detect --log-opts="--all"` exits 0 | CI nightly |
| Pre-commit blocks secret commit | Local: `echo "OPENAI_API_KEY=sk-xxx" > /tmp/leak && git add /tmp/leak && git commit` rejected | Manual + CI smoke |
| Production fail-fast on missing env | Spin up `apps/api` without `RETUNE_INTERNAL_API_KEY` and `NODE_ENV=production` → process exits | CI integration |
| Quarterly drill runs and passes | GH Actions workflow run history shows green | Reviewed by security on-call quarterly |
