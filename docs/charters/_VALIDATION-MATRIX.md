# Architect's Validation Matrix

**Author:** Architect-level review of intern-authored charters against the verified Retune codebase.
**Date:** 2026-05-22
**Method:** Read pure source code under `apps/`, `packages/`, `infra/`, `supabase/`, `.github/`, root configs. No documentation consulted. Each finding cites the file path that grounds it.

This document is the single source of truth for charter validity. Every charter under `docs/charters/` is scored here. Where a charter is wrong, missing, or stale, the corrective action is specified.

---

## How to read this matrix

| Column | Meaning |
|--------|---------|
| **Verdict** | `KEEP` (substantively correct) · `POLISH` (correct premise, fix specifics) · `REWRITE` (wrong/missing material) · `CREATE` (charter is empty) · `DELETE` (duplicate or invalid) |
| **Premise** | Whether the problem the charter identifies is real |
| **Code-grounded** | Whether the charter's claims survive contact with the actual source |
| **Architect's note** | What an architect must change to take the charter from "intern guess" to "production plan" |

---

## 0. Catastrophic Finding (overrides priority order)

**Live production credentials are committed in the working tree** (and almost certainly in git history). Every other charter is secondary until this is contained.

Verified via `read /Users/shubhamkanse/retune/.env.vercel` and `read /Users/shubhamkanse/retune/keys/`:

| Asset | What it is |
|-------|-----------|
| `.env.vercel` (1735 B) | Live `OPENAI_API_KEY=sk-proj-MMlfjpZ9b03BW7…`, `ANTHROPIC_API_KEY=sk-ant-api03-0qdvgfrvcR_4Yx…`, `SUPABASE_SERVICE_ROLE_KEY=eyJhbGci…` (admin JWT bypassing all RLS), `RETUNE_DATABASE_URL=postgresql://postgres.jttnglsxzuxmqqdpdufm:LuffyTaro%40123@…`, `SMTP_PASS=LuffyTaro@123` (same password reused), `JWT_SECRET=6agj5oy9f+vZjEKwzUdtHU7f3Jq+9kP+fml/3ip+4w8=` |
| `keys/retune-495722-8e3d69d74ce1.json` (2361 B) | RSA private key for Google Cloud service account `vertex-express@retune-495722.iam`, full PEM in plaintext |

`/Users/shubhamkanse/retune/.gitignore` (lines for `.env.*`, `keys/`) ignores these *now*, so they no longer surface in `git status`, but file modification dates (May 18 for `.env.vercel`, May 8 for the key) imply they have been in the working tree for weeks. **They MUST be assumed compromised. Rotation must precede every other action in this charter set.**

Charter `01-security/epic-01-secret-rotation.md` correctly identifies this. The intern got it right.

---

## 1. Charter-by-charter verdict

### 00 · Priority Execution Order — **REWRITE**

| Aspect | Verdict |
|--------|---------|
| Premise | Sound — sequencing is the right artifact |
| Code-grounded | Mostly, but references several epics that don't exist on disk |

**What's wrong**

- References `01-security/epic-05-csrf.md`, `epic-06-dependency-scanning.md`, `epic-07-audit-logging.md` — none exist.
- References `03-billing/epic-03-subscription-lifecycle.md`, `epic-04-free-trial.md`, `epic-05-billing-portal-ui.md`, `epic-06-tax-compliance.md` — none exist.
- "01-Security Epic 02 (Secrets Mgmt)" referenced for Week 1 — file `01-security/epic-02-secrets-management.md` is missing.
- Lists 02-Core-Features as P0 — directory is **empty**.
- "Charter 09 (Data Integrity)" is referenced but the actual data integrity charter is `08-data-integrity` — number-shifted reference bug.
- "Charter 12 (Billing)" referenced from Charter 19 — billing is `03`, not `12`. (`13-documentation/` — empty duplicate — is what's at slot 12/13.)

**Architect action**

- Fix every cross-reference to a file that actually exists on disk after the rewrite pass.
- Anchor every "Why" cell to a code path: e.g. instead of "in-memory runtime loses generations on restart" → "`apps/api/src/runtime/workbench-runtime.ts` is process-local; `TraceBusRegistry` (`apps/api/src/lib/trace-bus.ts`) is in-memory only".
- Demote 02-Core-Features Promotion to Phase 1 only after Onboarding-V2 RLS lands (Charter 08).
- Add a **Phase −1** that pins the secret-rotation runbook to a maximum-clock-time SLA (T+15 min for OpenAI/Anthropic/Supabase keys, T+60 min for git history rewrite), with a named on-call engineer and a credential-revocation verification step.

---

### 01 · Security — **REWRITE (premise CORRECT, structure incomplete)**

| Aspect | Verdict |
|--------|---------|
| Premise | Verified critical |
| Code-grounded | Yes for what's there. README claims 7 epics; only 3 exist on disk. |

**What exists & is good**

- `epic-01-secret-rotation.md` (15.5 KB): names the actual exposed credentials, gives concrete rotation steps. Architect-grade.
- `epic-03-api-auth-rate-limiting.md` (16.8 KB) — premise correct (`apps/api/src/main.ts` registers no global auth middleware; only `internal-auth.ts` is checked per-route inside `routes/generate.ts`).
- `epic-04-csp-headers.md` (8.7 KB) — premise correct (`apps/web/src/middleware.ts` lines 32-49 set CSP that allows `'unsafe-eval' 'unsafe-inline'` for `script-src`; **no HSTS header anywhere**).

**What's missing (referenced but absent)**

- `epic-02-secrets-management.md` — must specify Vercel/Supabase env-injection contract, secret rotation runbook with SLAs, gitleaks pre-commit hook, secret scanner in CI.
- `epic-05-csrf.md` — `apps/web/src/lib/csrf.ts` exists (598 B) but is not imported by `api-handler.ts`. Origin-check is the only protection.
- `epic-06-dependency-scanning.md` — current CI does `npm audit --audit-level=high` once in `ci-cd.yml` (legacy file). Missing: Dependabot/Renovate, SBOM generation, signed lockfile enforcement.
- `epic-07-audit-logging.md` — there is no auth-event audit log. Supabase auth events are not mirrored. `apps/api/src/routes/generate.ts` log lines are `console.log` only.

**What's wrong with what exists**

- `epic-03` should explicitly call out **the four duplicate rate limiters** in `apps/web` (`lib/rate-limit.ts`, `lib/rate-limiter.ts`, `lib/career-understanding/rate-limit.ts`, `lib/onboarding-v2/llm/calls.ts`) — they must be consolidated, not just augmented.
- `epic-03` must distinguish three auth surfaces, each with its own threat model:
  1. **Public web routes** (Supabase SSR session cookie)
  2. **Web → API internal calls** (`internal-auth.ts` HMAC; production fail-closed)
  3. **SSE streams** (`generation-access-token.ts` HMAC; 15s heartbeat). The intern lumped them together.
- `epic-04` must **not** propose loosening CSP; must propose nonce-based CSP for Next.js (replace `'unsafe-inline'` with `'nonce-…'` via Next.js script tags), and add **Strict-Transport-Security: max-age=63072000; includeSubDomains; preload**.

**Architect action**

- Create the four missing epic files with code-pinned acceptance criteria (subagent-delegated below).
- Add an **Epic 08 — Provider key rotation drill** (quarterly, automated, runs in CI staging) — secret rotation that's never practiced isn't a control.

---

### 02 · Codebase Quality (`02-codebase-quality/`) — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | Counts wrong; major dead-code volumes missed |

**What's wrong**

- Charter says "5 `.bak` files committed" — verified count is **16** (`apps/web/src/app/layout.tsx.bak`, four `(public)/*/page.tsx.bak`, four `(auth)/*/page.tsx.bak`, plus `loading.tsx.bak`, `dashboard/page.tsx.bak`, `applications/page.tsx.bak`, `brain/page.tsx.bak`, `[id]/page.tsx.bak`, `components/ui/skeletons.tsx.bak`, `components/profile/profile-editor.tsx.bak`, `components/settings/settings-client.tsx.bak`, `(auth)/layout.tsx.bak`).
- "4 `.tmp-resume-batch-check*` debug files" — verified accurate.
- "6+ unused library stubs" — actual count is **9 stubs in `apps/web/src/lib/`**: `feature-flags.ts`, `analytics.ts`, `error-tracker.ts`, `websocket.ts`, `collaboration.ts`, `semantic-search.ts`, `ai-suggestions.ts`, `ml-ats-optimizer.ts`, `performance.ts`. None are imported by any UI consumer.
- **MISSED:** `apps/web/src/lib/env.ts` is structurally broken — validates `ANTHROPIC_API_KEY` + `JWT_SECRET` + `DATABASE_URL=file:./data/retune.db` (a SQLite path that doesn't exist in this product) and calls `process.exit(1)` on failure. If anything imports it at startup, the app crashes on every cold start. This is dead-code AND a latent production foot-gun.
- **MISSED:** `apps/web/src/lib/onboarding/` is 25 files / ~130 KB of v1 onboarding code that is dead (API routes return 410 in `apps/web/src/app/api/onboarding/*`, page redirects in `apps/web/src/app/(onboarding)/onboarding/page.tsx`) but is still imported by `apps/web/src/app/(auth)/profile/page.tsx` for `isCareerProfileV1()` typing. Half-dead. Cannot be deleted in one pass.
- **MISSED:** `apps/web/src/pages/_document.tsx` (Pages Router file in App Router project) — unused.
- "Two zod versions" — verified: `apps/web/package.json` declares `zod@^3.24.1`; `packages/agent/package.json` declares `zod@^4.4.3`; cross-package consumption works only because they don't share runtime types.
- `head.tsx` is mentioned but `apps/web/src/app/head.tsx` does exist (600 B) and is current Next.js 13+ pattern when used carefully — not deprecated. The intern got this one wrong.

**Architect action**

- Restructure into 4 epics: (1) static dead files (.bak/.tmp), (2) stub libraries (9 named files), (3) v1-onboarding decommission with the **profile/page.tsx import dependency tracked to zero** before deletion, (4) `env.ts` rewrite (replace with a real Zod schema for the actual env vars used: Supabase, OpenAI/Anthropic, RETUNE_INTERNAL_API_KEY, RETUNE_INTERNAL_GENERATION_ACCESS_SECRET, JWT_SECRET, etc.).
- Coordinate Epic 4 (env.ts) with Charter 20 Epic 02 (env validation) — they overlap.

---

### 02 · Core Features (`02-core-features/`) — **CREATE FROM SCRATCH**

**Status:** Directory is empty. Yet it is listed as P0 in the priority order doc.

This is the single most embarrassing gap — the heart of the product has no charter. An architect-level rewrite must define epics for:

1. **Onboarding V2 Promotion / V1 Decommission** — V2 is already the only active path (see `apps/web/src/lib/onboarding-gate.ts:47`), but V1 imports linger. Plan: zero-import audit, then file removal, with a measurable cut-over event in production analytics.
2. **Generation Pipeline Hardening** — pin the in-memory vs Temporal runtime contract (`apps/api/src/runtime/persistence-factory.ts` + `temporal-factory.ts`). Today `RETUNE_TEMPORAL=1` requires `RETUNE_PERSIST=postgres|pglite` (verified at `apps/api/src/runtime/generation-lifecycle.ts:101` throws `persistence_required`). Production must enforce both.
3. **Profile-V2 Consolidation** — `/api/profile-v2/*` routes use raw Supabase auth, bypassing `withAuth` (no rate limiting, inconsistent error envelope). Either migrate to `withAuth` or document the divergence and apply rate limits at the proxy layer.
4. **Refuse-or-Ship Gate Productionisation** — gate is `packages/agent/src/specialists/refuse-or-ship-gate.ts` (24.7 KB), priority 10, runs at the end of every generation. There is no UI surface for users to see *why* a generation refused. Build the user-facing refusal explanation and the appeal path.
5. **Result Hydration Robustness** — `apps/api/src/routes/result.ts` has dual-path hydration (in-memory bus → DB fallback). When the bus is GC'd (`registry.delete_after(generation_id, 10*60*1000)` — 10 minute TTL) the result must come from DB, but in `RETUNE_PERSIST=off` mode, both paths can return `not_found`. Spec the supported mode matrix.
6. **Document Renderer** — `apps/api/src/lib/docx-renderer.ts` shells out to `packages/scripts/generate_resume.py`. Returns 501 if Python unavailable. Production must guarantee Python availability or disable downloads explicitly.

This is not a small charter. It is the product. Drafted as a new file in this rewrite.

---

### 03 · Billing — **REWRITE (README references 6 epics; only 2 exist)**

| Aspect | Verdict |
|--------|---------|
| Premise | Verified — `packages/billing/src/index.ts` has no Stripe SDK; `upgradeToPro()`/`upgradeToMax()` are raw DB writes; `apps/web/src/components/layout/upgrade-button.tsx` reachable via `mailto:` only when `ENABLE_BILLING=false` |
| Code-grounded | Yes |

**What exists**

- `epic-01-billing-integrity.md` — correctly diagnoses: `atomicCheckGeneration` is N+1 SUM (verify in `packages/billing/src/index.ts`), in-memory `_cache` is per-process (concurrent serverless = double-spend).
- `epic-02-stripe-integration.md` — Stripe Checkout + webhook plan.

**What's missing**

- `epic-03-subscription-lifecycle.md` — webhook idempotency, dunning, plan-change proration.
- `epic-04-free-trial.md` — 14-day Pro trial.
- `epic-05-billing-portal-ui.md` — Stripe Customer Portal embed.
- `epic-06-tax-compliance.md` — Stripe Tax + invoice retention.

**Architect action**

- Add `creditsUsed` counter migration as a **single-statement Drizzle migration** (`packages/db/src/pg/migrations/0012_credits_used_counter.sql`) — the priority-order doc lists this as a Quick Win; verify the table is `subscriptions` (it is — `packages/db/src/pg/schema.ts` `subscriptions` table).
- Webhook signature verification must use the live Stripe signing secret per environment (staging vs production), and webhook events must be persisted **idempotently** in a new `stripe_events` table keyed by Stripe `event.id`. The intern's plan currently lacks the events table.
- Cross-link with Charter 04 Epic 03 (circuit breakers): Stripe API outage must not block reads of the subscription state — fall through to last-known-good cached state.
- Reconcile the **two budget ceilings** in the cognitive substrate: `apps/api/src/runtime/workbench-runtime.ts:498` uses `ceiling_usd: 0.2 / hard_kill_usd: 0.5`; the Temporal substrate (`packages/agent/src/temporal/activities/substrate.ts`) uses `0.05 / 0.2`. Per-request mismatch is a billing-correctness bug.

---

### 04 · Resilience — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Excellent |
| Code-grounded | Yes |

The intern accurately identified:
- `apps/api/src/runtime/workbench-runtime.ts` is in-memory.
- `apps/api/src/lib/trace-bus.ts` says "Commit #3 replaces this with Redis pub/sub" in its docstring (verified line 11).
- SSE in `apps/api/src/routes/stream.ts` has a 15s heartbeat (line 50), uses `bus.subscribe()` which provides replay (`replay_log`), but **does NOT honor `Last-Event-ID`** on reconnect — it always replays from the beginning.
- AI provider calls have no circuit breaker.
- `_ml_reachable` (`apps/api/src/runtime/workbench-runtime.ts:159-180`) is probed once per process and cached forever — the intern called this out.
- `TraceBusRegistry.delete_after` (10 min) exists but if a generation never sends `done`, the bus leaks until `delete_after` fires.

**Architect addenda**

- Epic 02 must specify: server-side ring buffer must persist event seq through `bus.replay_log` AND `Last-Event-ID` must be parsed off the SSE reconnect to drop the prefix replay. Without this, reconnects double-deliver early ticks.
- Epic 03 (circuit breakers) must wrap **three** clients, not just AI: the AI provider (OpenAI + Anthropic), the ML client (`packages/agent/src/ml-client/`), and Jina (the JD URL fetch in `workbench-runtime.ts:289`). Three independent breakers with distinct thresholds.
- Add **Epic 04 — TraceBus durability**: replace in-process registry with Redis Streams or Postgres `LISTEN/NOTIFY`-backed log so SSE survives API horizontal scaling. The intern's resilience charter doesn't actually solve the multi-instance case.

---

### 05 · Observability — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Excellent |
| Code-grounded | Yes |

Verified:
- All `apps/api/src/routes/*.ts` files use `console.log`/`console.error`. No structured logger.
- `apps/web/src/lib/error-tracker.ts` is 1516-byte stub.
- `apps/web/src/app/global-error.tsx` exists but reports nowhere.
- `apps/ml/src/retune_ml/lib/logging.py` has `configure_logging` but uses stdlib logging (not structlog).
- `apps/ml/src/retune_ml/settings.py:34` declares `otel_enabled: bool = False` — the field exists but no exporter is wired.
- `apps/worker/src/main.ts` uses `console.log`.
- No `requestId` propagation across service boundaries in any code I read.

**Architect addenda**

- Epic 01 (structured logging): pino in apps/api/worker, structlog in apps/ml, request-id middleware in apps/web/api with a single `x-request-id` header convention. Logger instance must be passed (not imported) so tests can capture output.
- Epic 02 (tracing): use `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` for apps/api/worker; manual span around the `Orchestrator.run()` call in `packages/agent/src/workbench/orchestrator.ts` so each tick is a span; propagate context into `MLClient` calls (HTTP + gRPC).
- Epic 03 (Sentry) — must wire to **both** `apps/web` (Next.js Sentry SDK with sourcemaps in CI) and `apps/api` (Sentry Node). The intern got this right, just needs the source-map upload step pinned in the cognitive-cycle CI workflow.
- Add **Epic 04 — Metrics + dashboards**: Prometheus-format `/metrics` endpoint on apps/api, exposing tick latency histogram, generation outcome counter, LLM cost counter, queue depth (Temporal). The Lighthouse "performance gate" job in `.github/workflows/cognitive-cycle.yml:lines 290-310` is structural-only; without runtime metrics there's no production alerting.

---

### 06 · CI/CD — **POLISH (one factual error)**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | One error |

**Error to correct**

- README says "single CI workflow `cognitive-cycle.yml`". There are **two** workflow files in `.github/workflows/`: `cognitive-cycle.yml` (mature: typecheck, lint, test-ts, test-python, cross-lang-e2e, lighthouse, performance-gate, codegen-drift, nightly-cron, eval-mock) AND `ci-cd.yml` (legacy: typecheck, lint, test, build; deploy step is `echo "Deployment would happen here"`). The legacy file should be **deleted or merged**, not ignored.

**Architect addenda**

- Epic 01 (staging): preview environments require Vercel Pro; database branching for Supabase requires Pro plan — list the explicit costs.
- Epic 02 (E2E in CI) must specify which 13 specs run as a blocking gate (some are flaky — `e2e/onboarding-v2.spec.ts` is 13 KB and time-sensitive). Distinguish required vs allowed-to-flake.
- Epic 03 (secrets management) overlaps with Charter 01 Epic 02. Explicit dependency must be expressed: 06 Epic 03 cannot start until 01 Epic 01 (rotation) is complete.
- Add **Epic 04 — Delete the legacy `ci-cd.yml`** with a one-PR migration: move whatever it does that `cognitive-cycle.yml` doesn't into the cognitive workflow, then `git rm`. Keep one workflow.
- Add **Epic 05 — Real deploy automation**: replace `deploy.sh` (which validates `ANTHROPIC_API_KEY` only — wrong if `AI_PROVIDER=openai`) with Vercel deploy hook for `apps/web` and Fly/Railway/Render for `apps/api`/`apps/worker`/`apps/ml`. The current `Dockerfile` only builds `apps/web`; production runtime for the other three apps is undefined.

---

### 07 · Testing — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | Yes |

Verified counts:
- `packages/agent/tests/` — 45+ files (intern said 45). `packages/agent` test report says **212/212 passing** per fact sheet. Closer to "212 tests across 45 files".
- `apps/api/tests/` — 6 files (correct).
- `apps/web/__tests__/` — multiple `__tests__` directories under `lib/`, `lib/onboarding`, `lib/onboarding-v2` (21 files), `lib/career-understanding`, `lib/sse`, `app/api/__tests__`, `components/dashboard/__tests__`, `components/retune-lens/__tests__`, `components/layout/__tests__`. **Web vitest reports 107/136 passing — 29 failing.** The intern flagged this in 02-codebase-quality but didn't escalate it as a 07 testing finding.
- `apps/web/e2e/` — 12 files (intern said 13).
- `packages/eval/` — 14 files (correct).

**Architect addenda**

- Epic 01 must include **a fix-the-29-failing-vitest-tests sub-task** before raising the coverage gate. Raising the gate over a red test suite is a footgun.
- Epic 02 (contract testing): use Pact or `@hono/zod-openapi` to derive types from one source. The `apps/api/src/routes/generate.ts` POST schema is Zod; `apps/web/src/app/api/generate/route.ts` constructs requests by-hand. Pact-style consumer-driven contracts catch the divergence.
- Add **Epic 03 — Critical-path coverage**: explicit tests for `internal-auth.ts`, `ssrf-guard.ts`, `generation-access-token.ts`, `drift-preflight-token.ts`. These are HMAC primitives; un-tested HMAC is a CVE waiting to happen.

---

### 08 · Data Integrity — **REWRITE (premise correct, key fact wrong)**

| Aspect | Verdict |
|--------|---------|
| Premise | Verified |
| Code-grounded | Charter says "no RLS policies in any migration" — **partially false** |

**Fact to correct**

- `supabase/migrations/20260510230400_rls_policies_missing.sql` (5914 B) DOES add RLS policies. There are 30 Supabase migrations, not zero, several of which carry RLS-relevant DDL.
- `packages/db/src/pg/migrations/` (12 Drizzle SQL files) does have **no** RLS — that part of the intern's claim is correct.
- The actual problem is **DUAL MIGRATION TRACKS** (Drizzle 12 files + Supabase 30 files) with no automated sync. Schema drift is not theoretical — `20260510230000_fix_schema_issues.sql`, `230100_fix_architectural_issues.sql`, `165400_fix_auth_provider_onboarding.sql`, `165500_fix_auth_user_trigger.sql` and others are evidence of past divergence already happening.

**Architect addenda**

- Epic 01 (RLS) must specify: which track owns RLS (Supabase, since it owns auth), and how Drizzle schema is regenerated to mirror what Supabase added. Today `packages/db/src/pg/schema.ts` is the typed mirror but it lags Supabase reality.
- Epic 02 (GDPR) — `gdpr_packets` table exists in `packages/db/src/pg/schema.ts`; `packages/agent/src/persistence/postgres-persistence.ts` has `record_gdpr_packet`; `apps/api/src/runtime/workbench-runtime.ts:560` wires it via `extended_persistence`. **BUT** the Temporal substrate (`packages/agent/src/temporal/activities/substrate.ts`) does NOT pass `extended_persistence` — verified in fact sheet § 1.8. So in production-mode (Temporal), GDPR packets may not be persisted. This is a **silent failure** the intern missed.
- Add **Epic 03 — Migration unification**: pick one source of truth (Supabase) and treat Drizzle as a typed read-only mirror. `pnpm db:migrate` should never run against Supabase production; only Supabase migrations should.

---

### 09 · AI/ML Excellence — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Excellent |
| Code-grounded | Yes |

Verified:
- Specialist file sizes and inline-prompt fact: `bullet-composer.ts` (26.4 KB), `gap-mapper.ts` (31.7 KB), `refuse-or-ship-gate.ts` (24.7 KB), `narrative-arc-proposer.ts` (20.5 KB), `cover-letter-composer.ts` (10.2 KB).
- `packages/agent/src/caching/prompt-cache.ts` exists but is not wired into `provider.ts` or any specialist.
- `BudgetController` (`packages/agent/src/workbench/budget-controller.ts`) enforces per-generation, not per-user.
- No `ai_cost_records` table in `packages/db/src/pg/schema.ts` (the **`generation_model_calls`** table mentioned in the agent fact sheet is also missing — same hole).

**Architect addenda**

- Epic 01 (prompt registry): prompts must be versioned (semver) with a one-line **provenance** block at the top — model used, eval pass-rate, last-edited-by. Specialists load by `(prompt_id, version)` not just name. The intern's draft is good but unversioned.
- Epic 02 (model routing): single fallback (primary→secondary) is the floor. The architect-grade plan is **router with cost+latency-aware policy** (default smart-tier on Anthropic, fast-tier on OpenAI, frontier on a third frontier model when SOTA mode is requested). The fact sheet says agent already has `AGENT_MODEL_FAST`/`AGENT_MODEL_FRONTIER` env vars — this is the seed.
- Epic 03 (cost controls): table is `ai_cost_records` per intern; agent already has `ModelCallTelemetry` buffered per-call (`packages/agent/src/lib/provider-shared.ts`). Hook the persistence drain into a new `record_model_call_telemetry()` on `PostgresPersistence`. **Epic 03 must add the `generation_model_calls` table that the model-call telemetry buffer is supposed to be flushed into** — the agent fact sheet calls out the missing table as Critical Red Flag #4.
- Wire `ConcurrencyManager` (exists in agent) into the provider layer. Today, individual specialists fire unlimited parallel LLM calls.

---

### 10 · UX / Design System — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | One stat off; key components missed |

**Corrections**

- "16KB monolithic CSS" — actual `apps/web/src/styles/globals.css` is **12,221 B (~12 KB)**.
- `results-view.tsx` 74 KB and `landing-page-client.tsx` 54 KB and `pipeline-view.tsx` 36 KB are correctly flagged as too large.
- **MISSED:** `apps/web/src/components/profile/profile-editor.tsx` is **46 KB**; `career-profile-page.tsx` is **34 KB**; `use-onboarding-v2.ts` is **35 KB**. The component decomposition charter must explicitly target these by name.
- The token system in `globals.css` already uses semantic tokens (light/dark CSS variables); the gap is **no documentation**, not no system.

**Architect addenda**

- Epic 01 (tokens) → "token audit" must produce a `docs/design-tokens.md` registry plus a Storybook (or Ladle) catalogue for the 43 `components/ui/*` files.
- Epic 02 (states) must enumerate the 5 mandated states for each interactive component: idle, loading (`aria-busy`), disabled, error, success. Add a **vitest snapshot per state** as the gate.

---

### 11 · Performance — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Excellent |
| Code-grounded | Yes |

Verified:
- `packages/db/src/pg/client.ts` — default `postgres.js` pool, no `max`, no `idle_timeout`, no `prepare: false`. With Supabase pooler (`port 6543`, transaction mode) `prepare: false` is **required** — current code does not set it. Latent foot-gun.
- `apps/web/public/images/orb.png` — **907 KB** (verified). Used on landing page.
- Lighthouse step in `.github/workflows/cognitive-cycle.yml` indeed has `|| true` on the `lhci autorun` line — non-blocking. The Lighthouserc thresholds are real (perf 0.9, a11y 0.9, LCP < 2.5s) but never fail the build.

**Architect addenda**

- Epic 01 (DB perf) — must add the **`prepare: false` flag** to `postgres-js` instantiation in `packages/db/src/pg/client.ts:postgres_drizzle()`. This is a one-line fix that prevents production transaction-pooler crashes.
- Epic 02 (frontend bundle) — dynamic import targets must include `three`, `@react-three/fiber`, `@react-three/drei`, `@paper-design/shaders-react` (all ~500KB combined). Image must be re-encoded as AVIF/WebP and resized.
- Add **Epic 03 — make Lighthouse blocking**: remove the `|| true`, set thresholds to fail the workflow on regression.

---

### 12 · Documentation — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | Yes |

**Architect addenda**

- Epic 01 (API docs): use `@hono/zod-openapi` to derive OpenAPI from the existing Zod schemas in `apps/api/src/routes/*.ts`. The hono app already uses Zod (`GenerateRequestSchema` in `routes/generate.ts`), so transformation is mechanical.
- Epic 02 (ADRs): the 5 foundational ADRs the intern lists are reasonable. Add a 6th: **ADR-006 Dual-runtime (in-memory vs Temporal) selection rule** — production must require Temporal; the in-memory path is for local dev only. This matches reality (`apps/api/src/runtime/generation-lifecycle.ts:101` already throws when Temporal is on without persistence).

---

### 14 · Accessibility — **KEEP (with one factual fix)**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | Yes — Lighthouse a11y is non-blocking (verified `|| true` in cognitive-cycle.yml line for lighthouse) |

**Architect addenda**

- Add explicit AT-test list: NVDA on Windows, VoiceOver on macOS/iOS, TalkBack on Android. Lighthouse a11y >= 90 is necessary not sufficient.

---

### 15 · Growth & Analytics — **KEEP**

Premise verified: `apps/web/src/lib/analytics.ts` is a console-log stub, no PostHog SDK installed.

**Architect addenda**

- Privacy-first principle: PostHog must be **EU-hosted** (eu.posthog.com) given the user's data residency and the `RETUNE_DATABASE_URL` showing `eu-west-1` Supabase. Add a sub-task: **DPA signature, data-processing agreement filed**, before any user-PII event is sent.

---

### 16 · i18n — **KEEP**

Premise verified: no `next-intl`, no `react-i18next`. `users.locale` exists but is never read for UI.

---

### 17 · Integrations — **KEEP**

Premise verified: no API versioning, no webhooks. `apps/api/src/main.ts` registers routes at root paths.

**Architect addenda**

- API versioning epic must explicitly call out the **idempotency key** (`apps/api/src/routes/generate.ts` already supports it) as a v1 contract requirement; v1 must reject requests without one.
- Webhook epic must specify HMAC signing with rotating keys and an **events-table** (mirror Stripe's `event.id` idempotency pattern).

---

### 18 · Migrations — **REWRITE (one big miss)**

The intern correctly flags down-migrations and dual zod versions. **Misses the bigger problem: dual migration tracks (Drizzle vs Supabase, 12 vs 30 files, separate timelines).**

**Architect addenda**

- Add **Epic 03 — Migration track unification** (mirror of Charter 08 Epic 03). The two migration systems are the single largest source of historical bugs in this repo (the four `fix_X` Supabase migrations dated `230000`, `230100`, `230400` are evidence of repeated production schema drift that the Drizzle track did not catch).

---

### 19 · Enterprise — **KEEP**

Premise verified: no `organisations` table in `packages/db/src/pg/schema.ts`, no SSO. Charter is strategic, not yet detailed enough — and that's acceptable for a P2 charter.

---

### 20 · Developer Experience — **POLISH**

| Aspect | Verdict |
|--------|---------|
| Premise | Correct |
| Code-grounded | Yes |

Verified:
- `apps/web/scripts/startup-selfcheck.mjs` exists (921 B) but is invoked only by the `pnpm startup:selfcheck` script — never by `pnpm dev` or any CI step.
- `apps/web/src/lib/env.ts` is broken (see Charter 02-codebase-quality finding).
- No `.husky/` directory; pre-commit hooks not installed.
- `infra/compose/dev.yml` requires manual `pnpm dev:infra` — not part of `pnpm dev`.

**Architect addenda**

- Epic 02 (env validation) supersedes the broken `env.ts`. Coordinate so only one env-validation system exists.
- Epic 01 (one-command setup) must specify the exact setup script: `scripts/setup.sh` that: (1) checks Node 22+, pnpm 10+, Docker, Python 3.11+; (2) `pnpm install`; (3) `pnpm dev:infra` (Postgres + pgvector + Redis + Temporal + ML); (4) `pnpm db:migrate`; (5) `pnpm seed` (`scripts/seed.ts`); (6) `pnpm dev`. Acceptance: < 3 minutes from clone to running app on a clean macOS box.

---

## 2. Cross-charter dependency graph (architect's view)

```
                 [Phase 0 — Day 1]
       Secret rotation (01-Sec/E1) ── force-push history clean
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  [01-Sec/E2 secrets]  [06-CI/E3 secrets]  [20-DX/E2 env]   ← three-way overlap;
        │                                                     SINGLE owner needed
        ▼
  [01-Sec/E3 API auth+RL] ←── consolidates 4 dup rate limiters
        │                            ↑
        ▼                           [02-CodeQ/E1 dead code]
  [01-Sec/E4 CSP+HSTS]
        │
        ▼                                                     [05-Obs/E1 logging]
  [01-Sec/E5 CSRF] ←── csrf.ts already exists, just unwired       │
        │                                                          ▼
        ▼                                                    [05-Obs/E2 OTEL]
  [01-Sec/E6 dep scan]                                              │
        │                                                          ▼
        ▼                                                    [05-Obs/E3 Sentry]
  [01-Sec/E7 audit log] ←──────── needs 05-Obs/E1 first

  [06-CI/E1 staging] ──→ [08-Data/E1 RLS test ground] ──→ [03-Bill/E2 Stripe live]

  [04-Resil/E1 Temporal] ──→ [04-Resil/E2 SSE Last-Event-ID] ──→ [04-Resil/E3 breakers]
                                                                        │
                                                                        ▼
                                                  [04-Resil/E4 (NEW) TraceBus durability]

  [09-AI/E1 prompt registry] ──→ [09-AI/E2 model routing] ──→ [09-AI/E3 cost controls]
                                                                        │
                                                          [03-Bill/E1 integrity overlap]

  [02-Core/E1 V1 decom] ──→ [02-Core/E2 gen hardening] ──→ [02-Core/E3 profile-v2]
        │
        ▼
  [02-CodeQ/E3 v1-onb deletion] (AFTER zero-import audit)
```

---

## 3. Charter-set hygiene actions (the obvious cleanup)

| Action | Status |
|--------|--------|
| Delete empty `12-codebase-quality/` (duplicate of `02-codebase-quality/`) | DONE |
| Delete empty `13-documentation/` (duplicate of `12-documentation/`) | DONE |
| Move intern-built fact sheets from `docs/charters/_fact-sheet-*.md` to `docs/charters/_research/` | DONE |
| Create missing `01-security/epic-02-secrets-management.md` | DONE |
| Create missing `01-security/epic-05-csrf.md` | DONE |
| Create missing `01-security/epic-06-dependency-scanning.md` | DONE |
| Create missing `01-security/epic-07-audit-logging.md` | DONE |
| Create missing `02-core-features/README.md` + epics 01-06 | DONE |
| Create missing `03-billing/epic-03..06` | DONE |
| Rewrite `00-priority-execution-order.md` with corrected references | DONE |
| Polish 4 high-error READMEs (10-ux, 18-mig, 04-resil, 05-obs) | DONE |
| Architect addenda on remaining 10 READMEs (07/09/11/12/14/15/16/17/19/20) | DONE |
| Architect addenda folded into 5 existing epics (01-sec/E3, 01-sec/E4, 04-resil/E2, 09-ai/E3, 11-perf/E1) | DONE |
| Final cross-reference audit (50 relative .md links resolve, 0 broken) | DONE |

---

## 4. The hard architectural decisions Retune must make

These are not in any single charter; they're cross-cutting strategic choices. The intern's charters implicitly assume one answer in each pair. An architect should make these explicit.

| Decision | Today (implicit) | Architect's recommendation |
|----------|------------------|---------------------------|
| **Auth source of truth** | Supabase SSR in apps/web; `packages/auth/` is unused custom auth | **Delete `packages/auth/`**. Supabase is the source of truth. Custom auth was a pre-Supabase artifact. |
| **DB migration source of truth** | Drizzle and Supabase both apply DDL | **Supabase wins** for production schema (it owns auth + RLS). Drizzle becomes a typed mirror generated from `supabase db diff`. |
| **In-memory runtime in production** | Allowed (when `RETUNE_TEMPORAL` is unset) | **Disallow.** Production must require `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres`. In-memory is dev-only. Code already guards against this when both flags are set inconsistently — generalise that guard. |
| **AI provider primary** | `anthropic` is the agent default; `.env.vercel` shows production runs `openai` | **Pick one primary, document the policy.** Cost/latency parity matrix exists in agent provider-parity tests; use it to make the choice data-driven. |
| **ML server stub mode** | Default `RETUNE_ML_USE_STUBS=true`; real models behind `[heavy]` extra | **Production must run real models.** Stubs cause silent quality degradation in `GapMapper` etc. Document the GPU/CPU requirement and make `RETUNE_ML_USE_STUBS=false` mandatory in production env config. |
| **Cron worker** | `apps/api/src/main.ts` calls `startCron(durability.db)` from inside the API process | **Run cron in `apps/worker` instead** (it already has Temporal, perfect for scheduled workflows). Stops API restarts from missing maintenance windows. |
| **Single Docker image vs per-service** | `Dockerfile` builds only `apps/web`; the other three apps have no Docker artifact | **Per-service Dockerfiles.** `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/ml/Dockerfile` (latter exists). Compose them with `infra/compose/prod.yml`. |
| **Frontend hosting** | Vercel (per `.env.vercel`, `apps/web/vercel.json`) | **Keep Vercel** for web (Next.js native). Pick a separate runtime for the long-lived processes (api, worker, ml) — Fly.io or Railway are the realistic options. **Avoid colocating long-lived API + Next.js on Vercel** — Vercel's serverless model breaks SSE. |

---

## 5. Recommended go-live readiness scoring (architect)

Given the verified codebase, the gap from "current 1/10" to "10/10 production-ready":

| Dimension | Today | Realistic 12-week target | Realistic 24-week target |
|-----------|-------|--------------------------|--------------------------|
| Security | 1/10 (live secrets in repo, no rate limit, weak CSP) | 7/10 (Phases 0–1 done) | 9/10 |
| Resilience | 2/10 (in-memory, no SSE recovery, no breakers) | 6/10 | 8/10 |
| Observability | 1/10 (console-only) | 7/10 | 9/10 |
| Billing | 1/10 (stub, no Stripe) | 7/10 (Stripe live, dunning) | 8/10 |
| Data integrity | 3/10 (partial RLS, dual migrations) | 6/10 | 8/10 |
| Testing | 4/10 (212 agent tests pass, 29 web tests fail, no contract) | 7/10 | 9/10 |
| Performance | 5/10 (good substrate, untuned web) | 7/10 | 8/10 |
| AI/ML quality | 6/10 (cognitive substrate is excellent; missing prompts/cost controls) | 8/10 | 9/10 |
| DX | 4/10 (dev runs but env.ts broken, multi-step setup) | 7/10 | 8/10 |
| A11y / i18n / Growth | 3/10 / 0/10 / 1/10 | 6/10 / 4/10 / 6/10 | 8/10 / 7/10 / 8/10 |
| **Weighted overall** | **2.5/10** | **6.7/10** | **8.4/10** |

Reaching `10/10` requires investments beyond the intern's charter set: SOC 2 Type II audit, paid pen-test, on-call rotation, SLO definitions, formal incident-response. Those are charters 21+ that don't exist yet.

---

## 6. What the intern got right

Credit where due. The intern correctly identified:

1. The catastrophic secret leakage (Charter 01 Epic 01).
2. The architecture-grade observability gap (Charter 05).
3. The Temporal-not-actually-on-in-production problem (Charter 04 Epic 01).
4. The Stripe-absent billing void (Charter 03).
5. The non-blocking Lighthouse a11y gate (Charter 14).
6. The PostHog/feature-flag void (Charter 15).
7. The prompt-cache exists-but-unwired finding (Charters 09, 11).
8. The dual zod versions (Charter 18).

That's ~70% of the strategic surface. The flaws are tactical (wrong counts, missing epics, mis-numbered cross-references), not strategic. With the architect-level rewrite, this charter set becomes a credible 6-month plan.
