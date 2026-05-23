# Charter 02 — Core Features

**Priority:** P0 — blocks launch
**Owner:** Product Engineering Lead + Cognitive Substrate Tech Lead
**Status:** Created in architect rewrite (2026-05-22). The directory was empty in the intern-generated charter set despite being listed P0 in the priority order doc — this is the most embarrassing gap in the charter set, and it's the heart of the product.

---

## Purpose

Make the Retune cognitive product surfaces production-ready. Today the cognitive substrate (`packages/agent`, 212 passing tests) is excellent. The product surfaces around it — onboarding, profile, generation lifecycle, refusal explanation, document delivery — are partially-shipped, dual-versioned, or undocumented in their support contract. This charter tightens those surfaces.

---

## Current state (verified from code)

| Surface | Reality | Source |
|---------|---------|--------|
| **Onboarding V1** | Dead. API routes return 410. Page redirects to V2. But `apps/web/src/lib/onboarding/` is 25 files / ~130 KB and is still imported by `apps/web/src/app/(auth)/profile/page.tsx` for the `isCareerProfileV1` type guard. | `apps/web/src/app/api/onboarding/session/route.ts`, `apps/web/src/app/(onboarding)/onboarding/page.tsx`, `apps/web/src/lib/onboarding/` |
| **Onboarding V2** | Active. 9 stages: upload → extraction → inference → summary → correction → completeness → questions → voice → audit. ~36 KB client hook. Per-session limits (30 LLM calls, $0.50, 5 calls/min) enforced in `lib/onboarding-v2/llm/calls.ts`. Session in Supabase with optimistic locking. | `apps/web/src/lib/onboarding-v2/`, `apps/web/src/app/(onboarding)/onboarding-v2/page.tsx` (24.5 KB), `apps/web/src/hooks/use-onboarding-v2.ts` (35 KB) |
| **Profile (legacy `/api/profile`)** | Drizzle-backed. Goes through `withAuth` wrapper. | `apps/web/src/app/api/profile/route.ts`, `apps/web/src/lib/api-handler.ts` |
| **Profile-V2 (`/api/profile-v2/*`)** | Supabase-direct. Bypasses `withAuth`. No rate limiting. Different error envelope. | `apps/web/src/app/api/profile-v2/route.ts`, `apps/web/src/app/api/profile-v2/tune/route.ts`, `apps/web/src/app/api/profile-v2/re-read/route.ts` |
| **Generation entry** | `apps/web/src/app/(auth)/generate/new/page.tsx`, phases `form → captured → preflight → starting → streaming`. JD via paste or `/api/jd/fetch`. Drift preflight via `/api/generate/preflight` (POST detect / PATCH resolve). HMAC preflight token (15 min TTL). | `apps/web/src/app/(auth)/generate/new/page.tsx` |
| **Generation runtime** | Two paths. In-memory (`apps/api/src/runtime/workbench-runtime.ts`, 25 KB) + Temporal (`apps/worker/src/main.ts`). Selection: `RETUNE_TEMPORAL=1` activates Temporal; otherwise in-memory. Persistence modes: `off` / `pglite` / `postgres`. Production today runs in-memory + persistence-off (verified by `.env.vercel` setting `RETUNE_PERSIST=postgres` but no `RETUNE_TEMPORAL=1`). | `apps/api/src/runtime/persistence-factory.ts`, `apps/api/src/runtime/temporal-factory.ts`, `apps/api/src/runtime/generation-lifecycle.ts` |
| **Result hydration** | Bus-then-DB fallback. Bus is in-process (`apps/api/src/lib/trace-bus.ts`), GC'd after 10 min via `delete_after`. If `RETUNE_PERSIST=off`, returns 404 after GC. | `apps/api/src/routes/result.ts:34-49` |
| **Document downloads** | `/generate/:id/{resume\|cover_letter}.{docx\|pdf}` shells to `packages/scripts/generate_resume.py`. Returns 501 if Python unavailable. | `apps/api/src/lib/docx-renderer.ts` |
| **Refuse-or-ship gate** | `packages/agent/src/specialists/refuse-or-ship-gate.ts` (24.7 KB), priority 10, runs at end of every generation. Decision logic exists. **No user-visible explanation surface.** | `packages/agent/src/specialists/refuse-or-ship-gate.ts`, no consumer in `apps/web/` |
| **Career understanding & Retune Lens** | Real LLM-driven. `apps/web/src/lib/career-understanding/` (16 files), `/api/profile/understanding/{preview,apply,feedback,status}`. Does NOT call ML service — uses LLM only. | `apps/web/src/lib/career-understanding/`, `apps/web/src/components/retune-lens/` |
| **Refinement (selection-based)** | `/api/refine/selection` exists. Token-bucket via billing. | `apps/web/src/app/api/refine/selection/route.ts`, `packages/billing/src/index.ts` (`claimRefinementAttempt`) |

---

## Problem statements

1. **V1 onboarding is half-dead and creates ambiguity.** Half the project assumes V1 is gone (API + page redirect); half still imports its types. New contributors are misled.
2. **In-memory runtime is allowed in production.** `RETUNE_TEMPORAL` is optional. A production API restart loses all in-flight generations. The fact sheet (`_research/_fact-sheet-packages.md` § 1.8) confirms Temporal is wired but not enforced. The intern's resilience charter addresses Temporal activation — this charter addresses the **policy** that production must require it.
3. **Profile-V2 endpoints diverge from the rest of the API.** Different auth wrapper, no rate limiting, different error shape. Either they migrate to `withAuth` or the divergence is documented and the rate limiter is applied at proxy level.
4. **Refuse-or-ship is invisible to users.** When the gate refuses, the user sees an error but not *why*. Their evidence is not surfaced. Their appeal path does not exist. This is a product gap, not a substrate gap.
5. **Result hydration mode matrix is undocumented.** The user-facing contract for "can I still see my generation result 12 hours later?" depends on `RETUNE_PERSIST` setting + bus GC timing. Not specified in user-facing docs or in any test.
6. **Document downloads silently return 501** when Python is missing. Production must guarantee Python availability OR explicitly disable downloads with a clear UX.

---

## What "done" looks like

- `apps/web/src/lib/onboarding/` is deleted. The dependency from `(auth)/profile/page.tsx` is replaced with a pure type-guard library or with the V2 schema directly.
- Production environment variable matrix is enforced at startup: `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres` in any non-development `NODE_ENV`. Boot fails-fast otherwise.
- All `/api/profile-v2/*` routes go through a single auth wrapper that enforces rate limiting and emits the standard error envelope.
- A first-class refusal surface in the UI: when the gate refuses, the user sees the failed evidence requirements, the model's confidence, and a clear "challenge this verdict" path that goes through `apps/api/src/routes/active-questions.ts`.
- Result hydration support contract documented: results survive at least 30 days when `RETUNE_PERSIST=postgres`. Bus TTL bumped or eliminated when DB persistence is on.
- Document downloads return 200 (with valid file) OR 503 (with explicit "service-temporarily-unavailable" — meaning: Python not booted yet) — never 501.

---

## Success metrics

- Zero production restarts cause a generation to fail with `not_found` after the bus is GC'd. Verified by chaos test in CI.
- Zero callers of `apps/web/src/lib/onboarding/` outside the V2 codepath — verified by `grep -r "@/lib/onboarding/" apps/web/src` returning zero hits, then `git rm`.
- All `/api/profile-v2/*` routes return the same error envelope as `/api/profile/*` — verified by contract test.
- Refusal events have a `user_action` recorded in 80%+ cases (challenge / accept / abandon) — measured via PostHog.
- Document download success rate ≥ 99.5% (excluding genuine 4xx like wrong format) — measured by ratio of `2xx` vs `5xx` on `/generate/:id/*.{docx,pdf}`.

---

## Epics

| # | Epic | Priority | File |
|---|------|----------|------|
| 1 | Onboarding-V2 promotion / V1 decommission | P0 Wk 5 | [epic-01-onboarding-v2-promotion.md](./epic-01-onboarding-v2-promotion.md) |
| 2 | Generation runtime contract enforcement | P0 Wk 5 | [epic-02-generation-runtime-contract.md](./epic-02-generation-runtime-contract.md) |
| 3 | Profile-V2 API consolidation | P0 Wk 6 | [epic-03-profile-v2-consolidation.md](./epic-03-profile-v2-consolidation.md) |
| 4 | Refuse-or-ship user surface | P1 Wk 7 | [epic-04-refusal-surface.md](./epic-04-refusal-surface.md) |
| 5 | Result hydration support contract | P1 Wk 7 | [epic-05-result-hydration-contract.md](./epic-05-result-hydration-contract.md) |
| 6 | Document downloads SLA | P1 Wk 8 | [epic-06-document-download-sla.md](./epic-06-document-download-sla.md) |

Each epic follows the per-epic template used in `docs/charters/01-security/epic-01-secret-rotation.md`: Goal, DoD, Stories with acceptance criteria, Tasks with named subtasks, code-anchored references.

---

## Hard dependencies

- 04-Resilience / Epic 01 (Temporal in production) must close before 02-Core/E2 can enforce the runtime contract.
- 08-Data-Integrity / Epic 01 (RLS) must close before 02-Core/E3 (Profile-V2 consolidation) — the unified auth wrapper presumes RLS is on.
- 02-Codebase-Quality / Epic 03 (V1 onboarding deletion) is the implementation arm of 02-Core/E1; deletion happens there after the zero-import audit completes here.

---

## Non-goals (explicit)

- Onboarding V3 ideas (out of scope; we are stabilising V2).
- New cognitive specialists (the substrate already has 32; production hardening, not expansion).
- Profile schema evolution (Charter 18 owns schema migrations).
- Multi-tenancy (Charter 19 owns organisations).

---

## Risks

| Risk | Mitigation |
|------|-----------|
| V1 type imports in profile page have hidden runtime dependencies | Static-analysis grep + a 1-week "soak" period with V1 lib restricted via Biome rule before deletion |
| Forcing `RETUNE_TEMPORAL=1` in production breaks existing deploys | Feature-flag the enforcement; default-on after staging soak |
| Profile-V2 migration breaks the AI tune flow | Parity test: every profile-v2 response shape preserved before the auth wrapper change merges |
| Refusal surface introduces UX regressions on already-shipping flow | Behind a PostHog flag for first 2 weeks; A/B against current "generic error" experience |
| Result hydration TTL change increases DB storage cost | Quantify: ≤ 100 MB/100 active users/month at p95; budget approved before rollout |

---

## Out-of-scope verification

This charter only spans surfaces that already exist in code. Anything that doesn't exist yet (e.g. organisations, marketplace, integrations) belongs in Charters 17 / 19 / future. Architect's rule: "Core Features" means **features the user already has access to in some form**, not "features we wish we had built".
