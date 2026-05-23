# Priority Execution Order

**Status:** Architect-revised (2026-05-22). Replaces the intern-generated version.
**Authority:** Every entry below is anchored to a verified file path or commit. No claim survives without code grounding.

This document sequences all charters under `docs/charters/` against the verified codebase. Read it together with `_VALIDATION-MATRIX.md`, which contains per-charter validity scoring.

---

## Sequencing principles

1. **Containment before construction.** Live credentials in the working tree (`.env.vercel`, `keys/retune-495722-8e3d69d74ce1.json`) are an active incident. Nothing else matters until they are rotated.
2. **Hard dependencies, not preferences.** A charter is sequenced before another only when the second cannot be implemented correctly without the first. Convenience is not a dependency.
3. **One source of truth per cross-cutting concern.** Where two charters overlap (e.g. secrets management appears in 01-Security, 06-CI/CD, and 20-DX), one is named primary and the others reference it.
4. **Code anchors.** Every "Why" cell points to a file, line, or commit. If the file does not exist, the charter is wrong.

---

## Phase −1 — Active Incident Containment (T+0, blocking everything)

**Owner:** Staff Engineer (named on-call) + DevOps Engineer
**Maximum clock time:** 4 hours from incident kickoff.

The committed `.env.vercel` and `keys/` files are an active credential leak. Every action in this phase has an SLA.

| T+ | Action | Charter source | Verification |
|----|--------|----------------|--------------|
| T+15m | Revoke OpenAI key `sk-proj-MMlfjpZ9b03BW7…` | 01-Sec / Epic 01 / Story 1.1 / Task 1.1.1 | curl with old key returns 401 |
| T+15m | Revoke Anthropic key `sk-ant-api03-0qdvgfrvcR_4Yx…` | 01-Sec / E1 / S1.1 / T1.1.2 | console.anthropic.com shows key absent |
| T+30m | Reset Supabase service role key | 01-Sec / E1 / S1.1 / T1.1.3 | Old JWT returns 401 from PostgREST |
| T+30m | Reset Supabase database password | 01-Sec / E1 / S1.1 / T1.1.4 | psql with old password rejected |
| T+45m | Rotate `SMTP_PASS` (currently `LuffyTaro@123`) | 01-Sec / E1 / S1.1 / T1.1.5 | SMTP AUTH with old password rejected |
| T+45m | Generate new `JWT_SECRET` (`openssl rand -base64 32`) | 01-Sec / E1 / S1.1 / T1.1.5 | All sessions logged out (expected) |
| T+1h | Delete Google service account key `8e3d69d74ce1` | 01-Sec / E1 / S1.1 / T1.1.5 | GCP IAM no longer lists key |
| T+2h | Vercel env vars updated, production redeploy healthy | 01-Sec / E1 / S1.1 | `GET https://retuned.cv/api/health` returns 200 |
| T+3h | BFG history rewrite of `.env.vercel` and `keys/` | 01-Sec / E1 / S1.2 | `gitleaks detect --log-opts="--all"` exits 0 |
| T+4h | Force-push to all branches; collaborator notification sent | 01-Sec / E1 / S1.2 | All collaborators have re-cloned |

**Concurrent quick-win (separate engineer, no blocking):**

- `git rm` the 16 `.bak` files and 4 `.tmp-*` files (`02-codebase-quality / Epic 01`).
- `apps/web/data/` is already in `.gitignore`. Verify no PII is committed in any historical commit.

---

## Phase 0 — Stabilisation (Week 1)

Phase −1 is closed. The repo is no longer leaking. Now establish the controls that prevent recurrence.

| Charter | Epic | Why now | Code anchor |
|---------|------|---------|-------------|
| **01-Security** | E2 — Secrets management infra (NEW, see file) | Without secret-management infra, rotation will leak again | Vercel env vars + GitHub Actions secrets |
| **01-Security** | E3 — API auth + rate limiting | `apps/api/src/main.ts` registers no global auth/RL middleware; 4 duplicate web RL implementations | `apps/api/src/main.ts:36-46`, `apps/web/src/lib/rate-limit*.ts` |
| **01-Security** | E4 — CSP nonces + HSTS | `apps/web/src/middleware.ts:32-49` sets CSP with `'unsafe-eval' 'unsafe-inline'`. No HSTS. | `apps/web/src/middleware.ts:42-49` |
| **05-Observability** | E1 — Structured logging | All other charters benefit from request-id propagation; do this first | `apps/api/src/routes/*.ts` (console.log everywhere) |
| **20-DX** | E2 — Env validation (Zod) | `apps/web/src/lib/env.ts` is structurally broken (validates wrong vars + `process.exit(1)`); replace before any other env-touching work | `apps/web/src/lib/env.ts` |
| **20-DX** | E3 — Pre-commit hooks (gitleaks, biome, lint-staged) | Last line of defence; keeps Phase −1 from happening again | New `.husky/` directory required |

**Phase 0 success gate:** `gitleaks` scans clean on every commit; CI blocks on auth audit; structured JSON logs visible in dev.

---

## Phase 1 — P0 Foundation (Weeks 2–5)

| Week | Charter | Epic | Depends on | Code anchor |
|------|---------|------|------------|-------------|
| 2 | 01-Security | E5 — CSRF | `apps/web/src/lib/csrf.ts` exists (598 B) but unused; wire into `lib/api-handler.ts` | `apps/web/src/lib/csrf.ts`, `apps/web/src/lib/api-handler.ts` |
| 2 | 06-CI/CD | E1 — Staging environment | Phase 0 done so secrets are safe to inject; needed by 03-Billing/E2, 08-Data-Integrity/E1 to test against | New Vercel preview + Supabase branch |
| 2 | 06-CI/CD | E4 (NEW) — Delete legacy `ci-cd.yml` | Two CI workflows (`ci-cd.yml` + `cognitive-cycle.yml`) is footgun; consolidate | `.github/workflows/ci-cd.yml` |
| 3 | 08-Data-Integrity | E1 — RLS | `packages/db/src/pg/migrations/` has zero RLS; partial RLS exists in `supabase/migrations/20260510230400_rls_policies_missing.sql` only — verify completeness | `packages/db/src/pg/schema.ts`, `supabase/migrations/20260510230400_rls_policies_missing.sql` |
| 3 | 08-Data-Integrity | E3 (NEW) — Migration track unification | Drizzle (12 files) vs Supabase (30 files) drift — see four `fix_X` Supabase migrations as historical evidence | `packages/db/src/pg/migrations/`, `supabase/migrations/` |
| 3 | 03-Billing | E1 — Billing integrity | `packages/billing/src/index.ts` `atomicCheckGeneration` is a SUM table-scan; `_cache` is per-process | `packages/billing/src/index.ts` |
| 3 | 05-Observability | E2 — OTEL tracing | Needs structured logging (E1) | `@opentelemetry/sdk-node` |
| 3 | 05-Observability | E3 — Sentry | Web has stub `error-tracker.ts`; API has no Sentry | `apps/web/src/lib/error-tracker.ts` |
| 4 | 03-Billing | E2 — Stripe Checkout | Depends on 01/E1 (rotated keys safe to use), 06/E1 (staging for webhook tests), 08/E1 (RLS for subscription rows) | `packages/billing/src/index.ts` (`upgradeToPro` is currently raw DB write) |
| 4 | 04-Resilience | E1 — Temporal in production | `apps/worker/src/main.ts:79-86` SKIPS unless `RETUNE_TEMPORAL=1`; production never enables it today | `apps/worker/src/main.ts` |
| 4 | 04-Resilience | E2 — SSE Last-Event-ID | `apps/api/src/lib/trace-bus.ts` has replay log but ignores `Last-Event-ID` header | `apps/api/src/routes/stream.ts`, `apps/api/src/lib/trace-bus.ts` |
| 4 | 08-Data-Integrity | E2 — GDPR | `gdpr_packets` table exists; `extended_persistence` wired in API path but **NOT in Temporal substrate** — silent gap | `apps/api/src/runtime/workbench-runtime.ts:560`, `packages/agent/src/temporal/activities/substrate.ts` |
| 5 | 03-Billing | E3 (NEW) — Subscription lifecycle + dunning | Depends on E2 | New `stripe_events` table |
| 5 | 04-Resilience | E3 — Circuit breakers (LLM, ML, Jina) | Wrap three clients, not one | `packages/agent/src/lib/provider.ts`, `packages/agent/src/ml-client/`, `apps/api/src/runtime/workbench-runtime.ts:289` |
| 5 | 04-Resilience | E4 (NEW) — TraceBus durability (Redis Streams) | Single-instance API today; multi-instance requires this | `apps/api/src/lib/trace-bus.ts:11` (already says "Commit #3 replaces this") |
| 5 | **02-Core-Features** | E1 — Onboarding-V2 promotion / V1 decommission | V1 is dead code (`/api/onboarding/*` returns 410) but still imported by `(auth)/profile/page.tsx` | `apps/web/src/lib/onboarding/`, `apps/web/src/app/(auth)/profile/page.tsx` |

---

## Phase 2 — P1 Quality & Velocity (Weeks 6–14)

Run as parallel tracks across teams.

| Track | Charter | Epics | Depends on |
|-------|---------|-------|------------|
| Reliability | 04-Resilience | (closed in Phase 1) | — |
| Quality | 07-Testing | E1 (coverage + fix 29 failing web vitests), E2 (contract tests via Pact or `@hono/zod-openapi`), E3 (NEW — critical-path security primitives) | 06/E1 staging |
| Devex | 20-DX | E1 (one-command setup) | E2 + E3 already done in Phase 0 |
| AI Excellence | 09-AI/ML | E1 (prompt registry), E2 (provider fallback router), E3 (cost controls + missing `generation_model_calls` table) | None |
| Performance | 11-Performance | E1 (DB pooling + `prepare:false` + cache wiring), E2 (bundle), E3 (NEW — Lighthouse blocking) | None |
| UX | 10-UX/Design | E1 (tokens registry + Storybook), E2 (mandatory states) | None |
| A11y | 14-Accessibility | E1 (axe-core + blocking Lighthouse a11y) | 10/E1, 07/E1 |
| Docs | 12-Documentation | E1 (OpenAPI from Zod), E2 (ADRs incl. dual-runtime ADR) | 17/E1 (versioning) |
| Growth | 15-Growth-Analytics | E1 (PostHog EU-hosted), E2 (feature flags) | 06/E1 staging |
| Migrations | 18-Migrations | E1 (down migrations), E2 (Renovate + zod consolidation), E3 (NEW — track unification, redundant with 08/E3) | 06/E1 |
| Core Features | 02-Core-Features | E2 (generation hardening), E3 (profile-v2 consolidation), E4 (refuse-or-ship UI) | 04 closed, 07/E1 |
| Codebase Quality | 02-Codebase-Quality | E1 (.bak/.tmp), E2 (9 stub libs), E3 (V1 onboarding deletion AFTER zero-import audit), E4 (env.ts replacement coordinated with 20/E2) | Phase 0 done |

---

## Phase 3 — P2 Scale & Growth (Weeks 15–24)

| Charter | Epics | Depends on |
|---------|-------|------------|
| 16-i18n | E1 (next-intl architecture) | 10/E1 |
| 17-Integrations | E1 (versioning `/v1`), E2 (signed webhooks + events table) | 12/E1 |
| 19-Enterprise | E1 (organisations + roles) | 08/E1 (RLS) — orgs share rows; isolation is RLS-driven |
| 19-Enterprise | E2–E5 (team billing, SSO, audit log, custom domains) | E1 closed |

---

## Critical path

The single longest dependency chain that bounds calendar time to "production-ready":

```
Phase −1 secret rotation (4 h)
  → 01-Sec/E2 secrets infra (Wk 1)
    → 06-CICD/E1 staging (Wk 2)
      → 08-Data/E1 RLS (Wk 3)
        → 03-Bill/E2 Stripe Checkout (Wk 4)
          → 03-Bill/E3 lifecycle + dunning (Wk 5)
            → 07-Test/E1 coverage gates (Wk 6–7)
              → 14-A11y/E1 (Wk 8–9)
                → 19-Ent/E1 organisations (Wk 16–20)
                  → 19-Ent/E2 SSO (Wk 20–24)
```

**Minimum calendar time to production-ready: ~20 weeks** with a 3–4 engineer team in parallel.

---

## Quick wins (no dependencies, start immediately)

| Win | Charter | Effort |
|-----|---------|--------|
| `git rm` 16 `.bak` files | 02-CodeQ/E1 | 30 min |
| `git rm` 4 `.tmp-resume-batch-check*` files | 02-CodeQ/E1 | 30 min |
| `git rm` 9 stub libs (after grep for callers) | 02-CodeQ/E2 | half day |
| `git rm packages/auth/` (Supabase replaces it) | 02-CodeQ/E2 | half day, needs typecheck |
| Replace broken `apps/web/src/lib/env.ts` with real Zod schema | 20-DX/E2 + 02-CodeQ/E4 | half day |
| Add `prepare: false` flag to postgres-js in `packages/db/src/pg/client.ts` | 11-Perf/E1 | 1 hour |
| Add `creditsUsed` counter migration (`0012_credits_used_counter.sql`) | 03-Bill/E1 | half day |
| Add HSTS + remove `unsafe-eval` from CSP | 01-Sec/E4 | half day |
| Wire `csrf.ts` into `api-handler.ts` for state-mutating routes | 01-Sec/E5 | 1 day |
| Configure Renovate (`.github/renovate.json`) | 18-Mig/E2 | 2 hours |
| Delete legacy `ci-cd.yml` workflow (after merging missing checks into cognitive-cycle.yml) | 06-CICD/E4 | half day |
| Make Lighthouse blocking (remove `\|\| true` in `.github/workflows/cognitive-cycle.yml`) | 11-Perf/E3 + 14-A11y/E1 | 30 min |
| Write 6 foundational ADRs (incl. ADR-006 dual-runtime selection) | 12-Doc/E2 | 1 day |

---

## Charter index (canonical, post-rewrite)

| # | Charter | Priority | Directory |
|---|---------|----------|-----------|
| 00 | Priority execution order | — | `docs/charters/00-priority-execution-order.md` |
| — | Architect's validation matrix | — | `docs/charters/_VALIDATION-MATRIX.md` |
| 01 | Security | P0 | `docs/charters/01-security/` |
| 02-CF | Core Features | P0 | `docs/charters/02-core-features/` |
| 02-CQ | Codebase Quality | P1 | `docs/charters/02-codebase-quality/` |
| 03 | Billing & monetisation | P0 | `docs/charters/03-billing/` |
| 04 | Resilience & reliability | P0 | `docs/charters/04-resilience/` |
| 05 | Observability & monitoring | P0 | `docs/charters/05-observability/` |
| 06 | CI/CD & DevOps | P0 | `docs/charters/06-cicd/` |
| 07 | Testing & QA | P1 | `docs/charters/07-testing/` |
| 08 | Data architecture & integrity | P0 | `docs/charters/08-data-integrity/` |
| 09 | AI/ML excellence | P1 | `docs/charters/09-ai-ml/` |
| 10 | UX/UI & design system | P1 | `docs/charters/10-ux-design-system/` |
| 11 | Performance & scalability | P1 | `docs/charters/11-performance/` |
| 12 | Documentation | P1 | `docs/charters/12-documentation/` |
| 14 | Accessibility | P1 | `docs/charters/14-accessibility/` |
| 15 | Growth & analytics | P1 | `docs/charters/15-growth-analytics/` |
| 16 | i18n | P2 | `docs/charters/16-i18n/` |
| 17 | Integrations & API platform | P2 | `docs/charters/17-integrations/` |
| 18 | Migrations & upgrade paths | P1 | `docs/charters/18-migrations/` |
| 19 | Multi-tenancy & enterprise | P2 | `docs/charters/19-enterprise/` |
| 20 | Developer experience | P1 | `docs/charters/20-dx/` |

(Slots 13 and the duplicate 12-codebase-quality intentionally removed; they were empty stubs.)

---

## Disagreements with the intern

The intern's version is sound on premise but loose on facts. The architect-revised priorities differ in five places worth highlighting:

1. **Phase −1 split out from Phase 0.** The intern bundled secret rotation into "Day 1 actions" alongside operational hygiene. Rotation has a 4-hour SLA and a single named owner; hygiene tasks do not. They are different incidents.
2. **20-DX/E2 and 02-CodeQ/E4 are the same problem (`env.ts`).** The intern's plan would create two competing env-validation systems. Architect says: one source of truth, owned by 20-DX/E2; 02-CodeQ/E4 references it.
3. **`packages/auth/` is recommended for deletion.** The intern's plan never proposes deleting custom auth, treating it as part of the architecture. Verified: `apps/web` uses Supabase SSR exclusively; `packages/auth/` has zero callers in the active codebase.
4. **Cron belongs in `apps/worker`, not `apps/api`.** Today `apps/api/src/main.ts:53` calls `startCron(durability.db)`. With Temporal already running in the worker, cron is a natural Temporal scheduled workflow. The intern's plan does not address this.
5. **Production must require Temporal.** The intern's resilience charter treats Temporal as one path among many. Architect says: in-memory runtime is dev-only; production must hard-require `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres`. The code already enforces partially (`generation-lifecycle.ts:101` throws when Temporal is on without persistence) — generalise that guard.
