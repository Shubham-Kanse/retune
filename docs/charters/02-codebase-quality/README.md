# Charter 02 — Codebase Quality

## Vision

Remove dead code, consolidate duplicate dependencies, and establish CI guardrails that prevent quality regressions, so that the codebase remains lean, navigable, and free of confusing artifacts.

## Current State (architect-verified, 2026-05-22)

| Item | Verified | Note |
|------|----------|------|
| `.bak` files committed | **16** (not 5 as the intern claimed) | All under `apps/web/src/`. Full list: `app/layout.tsx.bak`, `(auth)/layout.tsx.bak`, `(auth)/{dashboard,applications,brain}/page.tsx.bak`, `(auth)/generate/new/{page,loading}.tsx.bak`, `(auth)/generate/[id]/page.tsx.bak`, `(public)/{login,signup,forgot-password,reset-password,verify-email}/page.tsx.bak`, `components/ui/skeletons.tsx.bak`, `components/profile/profile-editor.tsx.bak`, `components/settings/settings-client.tsx.bak` |
| `.tmp-resume-batch-check*` files | 4 | `.tmp-resume-batch-check.ts`, `.fresh.ts`, `.mjs`, `-output.json` at `apps/web/` root |
| Unused library stubs in `apps/web/src/lib/` | **9** (not "6+") | `feature-flags.ts`, `analytics.ts`, `error-tracker.ts`, `websocket.ts`, `collaboration.ts`, `semantic-search.ts`, `ai-suggestions.ts`, `ml-ats-optimizer.ts`, `performance.ts`. None imported by any UI consumer |
| Duplicate rate limiters | **4** (not 2) | `lib/rate-limit.ts`, `lib/rate-limiter.ts`, `lib/career-understanding/rate-limit.ts`, `lib/onboarding-v2/llm/calls.ts` |
| `pages/_document.tsx` in App Router project | Present | `apps/web/src/pages/_document.tsx` (436 B). Unused. |
| `head.tsx` "deprecated" claim | **WRONG** | The file `apps/web/src/app/head.tsx` (600 B) uses the current Next.js App Router `head.tsx` pattern. Not deprecated. Intern was wrong. |
| Python in `packages/scripts` | Intentional | `packages/scripts/generate_resume.py` (28.8 KB) is the document renderer invoked by `apps/api/src/lib/docx-renderer.ts`. Keep — but document. |
| Two zod versions | Confirmed | `apps/web/package.json` declares `zod@^3.24.1`; `packages/agent/package.json` declares `zod@^4.4.3` |
| **MISSED by intern: `apps/web/src/lib/env.ts` is broken** | Confirmed | Validates `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DATABASE_URL=file:./data/retune.db`, calls `process.exit(1)` on failure. Wrong env vars (Supabase + OpenAI are the real ones). Latent foot-gun. |
| **MISSED by intern: V1 onboarding 130 KB dead-but-imported** | Confirmed | `apps/web/src/lib/onboarding/` (25 files, ~130 KB). API routes return 410. Page redirects to V2. **But still imported** by `apps/web/src/app/(auth)/profile/page.tsx` for `isCareerProfileV1` typing. Cannot delete in one pass. |
| **MISSED by intern: `packages/auth/` is dead** | Confirmed | Custom auth provider. Not imported by `apps/web` (Supabase SSR replaces it). Zero tests. Candidate for `git rm` after type-check. |

## Epics (architect-revised)

| # | Epic | Scope |
|---|------|-------|
| 01 | [Dead Code Removal](./epic-01-dead-code-removal.md) | The 16 `.bak`, the 4 `.tmp-*`, `pages/_document.tsx` |
| 02 | [Dependency Rationalisation](./epic-02-dependency-rationalisation.md) | Consolidate to zod@4, CI guard against duplicate majors |
| 03 | (NEW) Stub library purge | The 9 stubs above. `git rm` after callgraph audit. Coordinates with Charter 05 (error-tracker), Charter 15 (analytics), Charter 09 (ai-suggestions), Charter 17 (websocket) — must merge AFTER those land their real implementations or AFTER they accept the stub deletion. |
| 04 | (NEW) V1 onboarding decommission | Zero-import audit on `apps/web/src/lib/onboarding/` → replace `isCareerProfileV1` with a stand-alone type guard → `git rm` 25 files / 130 KB. Coordinates with Charter 02-Core-Features Epic 01. |
| 05 | (NEW) `packages/auth/` deletion | Custom auth lib unused since Supabase SSR landed. Verify zero callers. `git rm` package. |
| 06 | (NEW) `apps/web/src/lib/env.ts` rewrite | Replace with the Zod schema for the actual env vars used. Single source of truth, co-owned with Charter 20 Epic 02. |

## Success Metrics

- Zero `.bak` or `.tmp-*` files in the repository
- Zero unused library files in `apps/web/src/lib/`
- Single zod version across the monorepo
- `biome check --no-errors-on-unmatched` exits 0
- CI fails if duplicate major dependency versions are detected

## Dependencies

- Charter 01 Epic 05 (CSRF implementation) — must land before deleting `csrf.ts` stub
- Charter 05 (Error Tracking) — must land before deleting `error-tracker.ts` stub
- Charter 15 (Analytics) — must land before deleting `analytics.ts` stub
- Charter 18 (Zod Migration) — coordinates with Epic 02 on zod consolidation

## Risks

- Deleting files that appear unused but are dynamically imported — mitigated by grep verification
- Zod 4 has breaking API changes — mitigated by typecheck + full test suite
