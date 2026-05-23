# Epic 01 — Onboarding V2 Promotion (V1 Decommission)

**Charter:** 02-Core-Features
**Priority:** P0 — Week 2 (after security rotation completes)
**Complexity:** S
**Owner:** Product Engineering Lead
**Status:** Created in architect rewrite (2026-05-22). V1 is functionally dead but structurally present.

---

## Goal

Complete the V1 onboarding decommission. V1 API routes already return 410 and the page redirects to V2, but the V1 library (32 files / ~130 KB at `apps/web/src/lib/onboarding/`) is still imported by `apps/web/src/app/(auth)/profile/page.tsx` for the `isCareerProfileV1` type guard and `CareerProfileV1` type. Until those imports reach zero, the dead code cannot be safely deleted, and new contributors are misled into thinking V1 is partially active.

## Definition of Done

- [ ] `grep -r '@/lib/onboarding/' apps/web/src` returns zero hits.
- [ ] `apps/web/src/lib/onboarding/` directory is deleted (32 files removed).
- [ ] The 4 dead API route handlers (`apps/web/src/app/api/onboarding/{session,upload,upload/stream,chat}/route.ts`) are deleted.
- [ ] `apps/web/src/app/(auth)/profile/page.tsx` uses a stand-alone type guard from `apps/web/src/lib/profile-domain/`.
- [ ] Zero requests reach the deprecated routes for 7 consecutive days in production logs (verified post-deploy).
- [ ] Build passes (`pnpm build`) with no type errors referencing the deleted paths.

---

## Code grounding (verified)

- `apps/web/src/app/api/onboarding/session/route.ts` returns `{ status: 410 }`. Same for `chat/route.ts`, `upload/route.ts`, `upload/stream/route.ts`.
- `apps/web/src/app/(onboarding)/onboarding/page.tsx` calls `redirect("/onboarding-v2")` — a 4-line file.
- `apps/web/src/app/(auth)/profile/page.tsx:12-14` imports `isCareerProfileV1` from `@/lib/onboarding/career-profile.schema` and `CareerProfileV1`, `ProfileReadiness` from `@/lib/onboarding/types`.
- `apps/web/src/lib/onboarding/` contains 32 files including 8 test files under `__tests__/`.
- `apps/web/src/lib/profile-domain/` already exists (21 files) with `contracts/`, `schemas/`, `utils/` — the natural home for a migrated type guard.

---

## Story 1.1 — Zero-import audit and type guard migration

**As a** platform engineer,
**I want** all V1 onboarding imports replaced with stand-alone equivalents,
**so that** the V1 library can be deleted without breaking the build.

### Acceptance criteria

- [ ] `grep -r '@/lib/onboarding/' apps/web/src` returns zero hits.
- [ ] `isCareerProfileV1` type guard lives in `apps/web/src/lib/profile-domain/utils/career-profile-v1-guard.ts`.
- [ ] `CareerProfileV1` and `ProfileReadiness` types are re-exported from `apps/web/src/lib/profile-domain/contracts/index.ts` (minimal type-only definitions, no runtime dependency on V1 lib).
- [ ] `apps/web/src/app/(auth)/profile/page.tsx` imports from `@/lib/profile-domain` instead of `@/lib/onboarding`.
- [ ] No other file in `apps/web/src` imports from `@/lib/onboarding/`.

### Tasks

- **1.1.1** Run `grep -r '@/lib/onboarding/' apps/web/src` and catalogue every import site. Today: `apps/web/src/app/(auth)/profile/page.tsx` lines 12–14.
- **1.1.2** Extract the `isCareerProfileV1` function (pure type guard, no side effects) into `apps/web/src/lib/profile-domain/utils/career-profile-v1-guard.ts`. Copy the minimal `CareerProfileV1` interface shape needed for the guard.
- **1.1.3** Update `apps/web/src/app/(auth)/profile/page.tsx` to import from `@/lib/profile-domain`.
- **1.1.4** Re-run the grep. Confirm zero hits. Run `pnpm build` to verify no type errors.

---

## Story 1.2 — Delete V1 onboarding library and dead routes

**As a** codebase maintainer,
**I want** the dead V1 onboarding code removed,
**so that** the repo is smaller, grep results are cleaner, and new contributors are not confused.

### Acceptance criteria

- [ ] `apps/web/src/lib/onboarding/` directory does not exist.
- [ ] `apps/web/src/app/api/onboarding/` directory does not exist.
- [ ] `apps/web/src/app/(onboarding)/onboarding/page.tsx` is deleted (the redirect is no longer needed once routes are gone — or retained as a 1-line safety net; team decides).
- [ ] `pnpm build` passes.
- [ ] `pnpm test` passes (no test references the deleted files).

### Tasks

- **1.2.1** Delete `apps/web/src/lib/onboarding/` (32 files).
- **1.2.2** Delete `apps/web/src/app/api/onboarding/` (4 route files).
- **1.2.3** Decide: keep or delete `apps/web/src/app/(onboarding)/onboarding/page.tsx`. If kept, it remains a redirect safety net for bookmarked URLs.
- **1.2.4** Run full build + test suite. Fix any transitive breakage.

---

## Story 1.3 — Production cut-over verification

**As a** product owner,
**I want** proof that no real traffic reaches the deprecated V1 routes,
**so that** I can confirm the decommission is safe.

### Acceptance criteria

- [ ] Vercel/production logs show zero 410 responses from `/api/onboarding/*` for 7 consecutive days after deploy.
- [ ] If any traffic is detected, investigate source (crawlers, cached clients) and mitigate before proceeding with route deletion.

### Tasks

- **1.3.1** Deploy the build from Story 1.2 to staging. Monitor for 48 hours.
- **1.3.2** Deploy to production. Set a 7-day observation window.
- **1.3.3** After 7 days of zero hits, close this story. If hits are found, add a redirect middleware and extend the window.

---

## Out of scope

- Onboarding V2 feature improvements (separate product backlog).
- V1 database rows cleanup (Charter 08 data integrity).
- The redirect page at `apps/web/src/app/(onboarding)/onboarding/page.tsx` may be retained indefinitely as a safety net — that decision is not blocking.

---

## Hard dependencies

- Charter 02-Codebase-Quality Epic 04 (V1 onboarding deletion) — that epic handles the broader dead-code sweep; this epic handles the import audit that unblocks it. Story 1.2 here is the actual deletion; the codebase-quality epic should reference this as complete before claiming the line item.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Unknown import sites beyond `profile/page.tsx` | Story 1.1 starts with exhaustive grep; build verification catches any miss |
| Cached clients still hitting `/api/onboarding/*` | Story 1.3 observation window; redirect middleware as fallback |
| `CareerProfileV1` type shape drift during migration | Type guard is pure — copy the interface verbatim, add a deprecation comment |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Zero V1 imports | `grep -r '@/lib/onboarding/' apps/web/src` exits with no output | CI (build would fail anyway) |
| V1 lib deleted | `test ! -d apps/web/src/lib/onboarding` | CI |
| Build passes post-deletion | `pnpm build` exits 0 | CI |
| No production traffic to V1 routes | Vercel analytics filter on `/api/onboarding/*` shows 0 requests for 7 days | Manual review |
