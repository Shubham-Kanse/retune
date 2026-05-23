# Epic 05 — CSRF Protection

**Charter:** 01-Security
**Priority:** P1 — Week 2
**Complexity:** S
**Owner:** Staff Engineer
**Status:** Created in architect rewrite (2026-05-22). csrf.ts exists but is never imported.

---

## Goal

Wire `apps/web/src/lib/csrf.ts` (598 B, exists but unused) into `apps/web/src/lib/api-handler.ts` so every state-mutating route (POST/PATCH/DELETE) requires a verified CSRF token. Today only origin-checking (`checkOrigin()` at `api-handler.ts:8-18`) guards routes. The origin check is bypassable when `Origin` header is absent (line 12: `if (!origin) return;`). A proper double-submit CSRF token closes this gap without breaking the Supabase SSR cookie flow.

## Definition of Done

- [ ] Every `withAuth` and `withAuthParams` handler rejects POST/PATCH/DELETE requests that lack a valid CSRF token, returning 403 with `{ error: "csrf_token_invalid", code: "CSRF_FAILED" }`.
- [ ] CSRF token is minted as an HMAC-SHA256 over `user_id + timestamp` with a server-side secret, not a bare random value.
- [ ] Token is delivered via a `SameSite=Strict; HttpOnly; Secure; Path=/` cookie named `__Host-csrf` AND must be echoed in the `x-csrf-token` request header (double-submit pattern).
- [ ] GET/HEAD/OPTIONS requests are exempt from CSRF verification.
- [ ] Supabase SSR auth cookies (`sb-*-auth-token`) continue to function — no cookie collision, no path conflict.
- [ ] All existing vitest tests in `apps/web` pass without modification (or are updated to include the CSRF header).
- [ ] Documentation in `docs/security/csrf-strategy.md` explains the cookie strategy, SPA integration, and Supabase interaction.

---

## Code grounding (verified)

- `apps/web/src/lib/csrf.ts` — 598 B. Exports `generateCSRFToken()` (random 32 bytes hex) and `validateCSRFToken(request)` (compares `x-csrf-token` header to `csrf-token` cookie). Neither function is imported anywhere in the codebase.
- `apps/web/src/lib/api-handler.ts` — `checkOrigin()` (lines 8–18) is the sole CSRF-adjacent defence. It skips GET/HEAD/OPTIONS, allows requests with no `Origin` header (line 12), and only compares `origin.host` vs `request.host`. The `withAuth` wrapper (line 34) and `withAuthParams` wrapper (line 50) both call `checkOrigin()` but never call `validateCSRFToken`.
- `apps/web/src/lib/supabase/server.ts` — creates a Supabase server client using `@supabase/ssr`'s `createServerClient` with `cookies()` from `next/headers`. Supabase stores auth state in cookies prefixed `sb-<project-ref>-auth-token`. These are `SameSite=Lax` by default.
- `apps/web/src/middleware.ts` — sets security headers (CSP, X-Frame-Options, etc.) and resolves session via `resolveSessionStateFromRequest`. Does not touch CSRF cookies.
- `apps/web/src/lib/session.ts:getApiSession()` — calls `createIdentityModule().resolveSessionState()` which reads Supabase cookies. CSRF cookie must not collide with the `sb-*` namespace.
- `apps/web/src/lib/rate-limit.ts` — in-memory rate limiter keyed on IP + pathname. CSRF failure should be recorded before rate-limit check to avoid masking attacks.

---

## Story 5.1 — Upgrade csrf.ts to HMAC-based token mint/verify

**As a** security engineer,
**I want** CSRF tokens to be HMAC-signed over `user_id + timestamp`,
**so that** tokens are unforgeable, time-bounded, and tied to a specific session.

### Acceptance criteria

- [ ] `generateCSRFToken(userId: string, secret: string): string` produces a base64url-encoded payload `{uid, iat, exp}` + `.` + HMAC-SHA256 signature.
- [ ] `verifyCSRFToken(token: string, userId: string, secret: string): boolean` validates signature, checks `uid` matches, and rejects tokens older than 4 hours.
- [ ] Timing-safe comparison is used (via `crypto.timingSafeEqual`), consistent with the pattern in `apps/api/src/lib/internal-auth.ts:82-90`.
- [ ] Secret is sourced from `process.env.CSRF_SECRET` (>= 32 chars), failing fast at startup if missing in production (same pattern as `apps/api/src/lib/generation-access-token.ts:15`).
- [ ] Unit tests cover: valid token, expired token, wrong user, tampered signature, malformed input.

### Tasks

- **5.1.1 — Rewrite token functions:** Replace `apps/web/src/lib/csrf.ts` body. Keep the same file path. Export `mintCSRFToken(userId, secret)` and `verifyCSRFToken(token, userId, secret)`.
- **5.1.2 — Add CSRF_SECRET to env validation:** Add `CSRF_SECRET` to the env schema (coordinate with Charter 20 Epic 02). Add to `.env.example` with a placeholder.
- **5.1.3 — Unit tests:** Add `apps/web/src/lib/__tests__/csrf.test.ts` using vitest (project already uses vitest for web — see `apps/web/vitest.config.ts`).

---

## Story 5.2 — Integrate CSRF verification into api-handler.ts wrappers

**As a** developer,
**I want** CSRF verification to be automatic for all authenticated state-mutating routes,
**so that** no route can accidentally omit the check.

### Acceptance criteria

- [ ] `withAuth` and `withAuthParams` in `apps/web/src/lib/api-handler.ts` call `verifyCSRFToken()` after session resolution for POST/PATCH/DELETE methods.
- [ ] On CSRF failure, a `ForbiddenError("csrf_token_invalid")` is thrown (uses existing `ForbiddenError` from `apps/web/src/lib/errors.ts`).
- [ ] A new helper `setCSRFCookie(response, session)` sets the `__Host-csrf` cookie on every successful GET response from authenticated routes (piggybacks on the response object).
- [ ] The cookie attributes are: `SameSite=Strict`, `HttpOnly=true`, `Secure=true` (in production), `Path=/`, `Max-Age=14400` (4 hours, matching token expiry).
- [ ] `withErrorHandling` (public routes) does NOT enforce CSRF — only authenticated wrappers do.
- [ ] Existing tests updated: any test that calls POST/PATCH/DELETE through `withAuth` must include the `x-csrf-token` header.

### Tasks

- **5.2.1 — Modify withAuth/withAuthParams:** Add CSRF check after `getApiSession()` succeeds, before calling the handler. Skip for GET/HEAD/OPTIONS.
- **5.2.2 — Cookie-setting middleware:** After handler returns a response, if the request was GET and session is valid, attach the `__Host-csrf` Set-Cookie header to the response.
- **5.2.3 — Client-side token reader:** Add `apps/web/src/lib/csrf-client.ts` that reads the CSRF cookie value (non-HttpOnly variant OR a meta tag approach). Decision: use a non-HttpOnly companion cookie `csrf-token-header` that the SPA reads and sends as `x-csrf-token`. The HttpOnly `__Host-csrf` cookie is the server-verified source.
- **5.2.4 — Update fetch wrapper:** Modify `apps/web/src/lib/api-client.ts` (or equivalent fetch helper) to automatically attach `x-csrf-token` on mutating requests.
- **5.2.5 — Fix existing tests:** Update vitest tests that exercise POST/PATCH/DELETE routes to include the CSRF header.

---

## Story 5.3 — Document SameSite cookie strategy and Supabase interaction

**As a** platform engineer,
**I want** a written security design document,
**so that** future developers understand why the cookie is configured this way and don't accidentally break auth.

### Acceptance criteria

- [ ] `docs/security/csrf-strategy.md` documents: (a) why double-submit over synchronizer token, (b) why `SameSite=Strict` for CSRF vs Supabase's `SameSite=Lax`, (c) cookie namespace separation (`__Host-csrf` vs `sb-*`), (d) SPA form integration pattern, (e) known limitations (cross-subdomain, Safari ITP).
- [ ] Document explicitly states that Supabase cookies (`sb-<ref>-auth-token`) use `SameSite=Lax` (set by `@supabase/ssr` in `apps/web/src/lib/supabase/server.ts`) and that our CSRF cookie's `Strict` policy does not interfere because the CSRF cookie is only read on same-origin requests where `Strict` is satisfied.
- [ ] Document lists the 10 auth routes in `apps/web/src/app/api/auth/*/route.ts` and notes which are exempt from CSRF (GET-based callbacks: `/auth/callback`, `/auth/confirm`, `/auth/google/callback`) vs which require it (POST: `/auth/login`, `/auth/signup`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`, `/auth/google`).

### Tasks

- **5.3.1 — Write docs/security/csrf-strategy.md:** Cover all acceptance criteria.
- **5.3.2 — Add ADR entry:** Add a one-paragraph ADR in `docs/adrs/` referencing the strategy doc and the decision rationale (double-submit chosen over synchronizer token for stateless Next.js edge compatibility).

---

## Out of scope

- CSRF for the Hono-based `apps/api` (protected by `x-retune-internal-key` header — see `apps/api/src/lib/internal-auth.ts`; not browser-accessible).
- CSRF for WebSocket/SSE streams (GET-based, exempt by definition).
- Per-form nonce tokens (unnecessary given double-submit + HMAC binding).

---

## Hard dependencies

- Charter 20 Epic 02 (env validation) must define `CSRF_SECRET` in the shared env schema.
- Epic 02 Story 2.2 (fail-fast startup) must enforce `CSRF_SECRET` presence in production.
- Existing vitest infrastructure (`apps/web/vitest.config.ts`) must be functional.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| SPA fetch calls forget to attach `x-csrf-token` header | Centralised fetch wrapper (`api-client.ts`) attaches automatically; lint rule flags raw `fetch()` to mutating API routes |
| `SameSite=Strict` cookie not sent on OAuth redirect returns | OAuth callbacks are GET-based and exempt from CSRF; document explicitly in Story 5.3 |
| Safari ITP purges the CSRF cookie after 7 days of inactivity | Token max-age is 4 hours; cookie is refreshed on every authenticated GET; ITP only affects 3rd-party context which doesn't apply here |
| Breaking existing tests | Story 5.2.5 explicitly updates all affected tests; CI gate catches regressions |
| Cookie collision with Supabase `sb-*` namespace | `__Host-csrf` prefix is disjoint from `sb-*`; verified by reading `@supabase/ssr` cookie naming |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| POST without CSRF token returns 403 | `apps/web/src/lib/__tests__/api-handler-csrf.test.ts` | vitest |
| POST with valid CSRF token succeeds | Same test file, happy path | vitest |
| Expired CSRF token returns 403 | Unit test with mocked clock | vitest |
| Wrong-user CSRF token returns 403 | Unit test with mismatched userId | vitest |
| GET requests are exempt | Existing GET route tests pass without CSRF header | vitest |
| Supabase auth flow unbroken | E2E login → generate → logout flow | Manual + CI smoke |
| Cookie attributes correct | Integration test inspects `Set-Cookie` header for `SameSite=Strict; HttpOnly; Secure; Path=/` | vitest |
| `CSRF_SECRET` missing in production → startup crash | Startup selfcheck test (`apps/web/scripts/startup-selfcheck.mjs`) | CI integration |
