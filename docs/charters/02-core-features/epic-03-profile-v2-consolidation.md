# Epic 03 — Profile-V2 Route Consolidation

**Charter:** 02-Core-Features
**Priority:** P1 — Week 3
**Complexity:** M
**Owner:** Product Engineering Lead
**Status:** Created in architect rewrite (2026-05-22). Divergence documented in charter README.

---

## Goal

Eliminate the auth/rate-limit divergence in `/api/profile-v2/*` routes. Today these 3 routes use Supabase auth directly (bypassing the `withAuth` wrapper), have no rate limiting, and return a different error envelope than the rest of the API. This creates an inconsistent security posture and makes client-side error handling fragile.

## Definition of Done

- [ ] All 3 profile-v2 routes (`route.ts`, `tune/route.ts`, `re-read/route.ts`) go through a unified auth wrapper that enforces rate limiting.
- [ ] All 3 routes return the standard error envelope (`{ error: string, message?: string }` with appropriate HTTP status codes).
- [ ] No direct `createClient()` + `supabase.auth.getUser()` calls remain in the route handlers (auth is handled by the wrapper).
- [ ] Contract tests verify error shape parity with `/api/profile/*` routes.

---

## Code grounding (verified)

- `apps/web/src/app/api/profile-v2/route.ts:14,18,21` — imports `createClient` from `@/lib/supabase/server`, calls `supabase.auth.getUser()` directly. No `withAuth` wrapper.
- `apps/web/src/app/api/profile-v2/tune/route.ts:12,16-17` — same pattern: direct Supabase auth, no rate limiting.
- `apps/web/src/app/api/profile-v2/re-read/route.ts:15,19-20` — same pattern.
- `apps/web/src/lib/api-handler.ts:32` exports `withAuth(handler)` — wraps a handler with session extraction, returns 401 on missing session, provides `user` to the handler.
- `apps/web/src/lib/api-handler.ts:53` exports `withAuthParams(handler)` — same but for routes with dynamic params.
- None of the profile-v2 routes import from `@/lib/api-handler.ts`.
- The legacy `/api/profile/route.ts` uses `withAuth` — this is the target pattern.

---

## Story 3.1 — Extend withAuth to support Supabase-direct mode with rate limiting

**As a** platform engineer,
**I want** the `withAuth` wrapper to support the Supabase session pattern used by profile-v2 routes while adding rate limiting and the standard error envelope,
**so that** migration is mechanical, not a rewrite.

### Acceptance criteria

- [ ] `apps/web/src/lib/api-handler.ts` exports a `withAuthRateLimited(handler, options?)` variant (or extends `withAuth` with an options parameter).
- [ ] The wrapper: (a) extracts the Supabase session, (b) returns 401 with standard envelope on missing/invalid session, (c) applies a per-user rate limit (configurable, default 30 req/min), (d) returns 429 with standard envelope on rate limit exceeded.
- [ ] Rate limit state uses an in-memory sliding window (acceptable for single-instance Vercel functions; upgrade path noted for multi-instance).
- [ ] Standard error envelope: `{ error: "<code>", message?: "<human-readable>" }`.

### Tasks

- **3.1.1** Add rate-limiting utility to `apps/web/src/lib/api-handler.ts` (or a new `apps/web/src/lib/rate-limit.ts`). Sliding window, keyed by user ID.
- **3.1.2** Add `withAuthRateLimited` that composes auth extraction + rate limiting + standard error envelope.
- **3.1.3** Unit test the rate limiter in isolation.

---

## Story 3.2 — Migrate profile-v2 routes to unified wrapper

**As a** developer,
**I want** the 3 profile-v2 routes to use the unified auth wrapper,
**so that** they inherit rate limiting and consistent error handling.

### Acceptance criteria

- [ ] `apps/web/src/app/api/profile-v2/route.ts` uses `withAuthRateLimited`.
- [ ] `apps/web/src/app/api/profile-v2/tune/route.ts` uses `withAuthRateLimited`.
- [ ] `apps/web/src/app/api/profile-v2/re-read/route.ts` uses `withAuthRateLimited`.
- [ ] No direct `createClient()` + `supabase.auth.getUser()` calls remain in these files (auth is delegated to the wrapper).
- [ ] Existing functionality (Supabase DB queries, LLM calls) is unchanged.
- [ ] `pnpm build` passes.

### Tasks

- **3.2.1** Refactor `apps/web/src/app/api/profile-v2/route.ts` — extract handler logic, wrap with `withAuthRateLimited`.
- **3.2.2** Refactor `apps/web/src/app/api/profile-v2/tune/route.ts` — same.
- **3.2.3** Refactor `apps/web/src/app/api/profile-v2/re-read/route.ts` — same.
- **3.2.4** Verify all three routes still work end-to-end (manual or integration test).

---

## Story 3.3 — Contract test for error shape parity

**As a** frontend developer,
**I want** proof that profile-v2 routes return the same error shapes as profile routes,
**so that** my error handling code works uniformly.

### Acceptance criteria

- [ ] Test file `apps/web/src/app/api/profile-v2/__tests__/error-contract.test.ts` exists.
- [ ] Tests cover: (a) 401 on missing auth — shape matches `/api/profile` 401; (b) 429 on rate limit exceeded — standard envelope; (c) 400 on invalid body — standard envelope; (d) 500 on internal error — standard envelope.
- [ ] Tests run in CI as part of `pnpm test`.

### Tasks

- **3.3.1** Create the test file. Use the existing test patterns from `apps/web/`.
- **3.3.2** Mock Supabase auth to simulate missing/valid sessions.
- **3.3.3** Assert response shapes match the standard envelope exactly.

---

## Out of scope

- Migrating `/api/profile` (legacy) to the same wrapper — it already uses `withAuth` and works correctly.
- Multi-instance rate limiting (Redis-backed) — noted as a future upgrade when the app moves beyond single Vercel function instances.
- Changing the profile-v2 business logic or Supabase queries.

---

## Hard dependencies

- None blocking. This epic is self-contained.
- Charter 03-Billing may later add credit-based rate limiting on top of the per-user rate limit added here.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Rate limiter false-positives on legitimate heavy usage (e.g., rapid profile edits) | Default 30 req/min is generous; configurable per-route |
| In-memory rate limit resets on cold start (Vercel) | Acceptable for MVP; document upgrade path to KV-backed limiter |
| Migration breaks existing frontend expectations | Contract test (Story 3.3) catches shape changes; frontend error handling is already generic |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| All 3 routes use unified wrapper | `grep -L 'withAuthRateLimited' apps/web/src/app/api/profile-v2/*/route.ts` returns empty | CI |
| No direct auth calls in routes | `grep 'supabase.auth.getUser' apps/web/src/app/api/profile-v2/*/route.ts` returns empty | CI |
| Rate limiting active | Contract test sends 31 requests in 60s → 31st returns 429 | CI |
| Error envelope consistent | Contract test asserts `{ error, message? }` shape on 401, 429, 400, 500 | CI |
