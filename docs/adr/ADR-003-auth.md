# ADR-003 — Auth: Supabase SSR Over Custom Auth

**Status**: Accepted
**Date**: 2026-05-23
**Owner**: Platform engineering
**Charter**: 01-Security, 02-Codebase-Quality

## Context

Retune needs authenticated user sessions for the web app, the API, and the durable workflows. The first cut shipped a custom `packages/auth/` library implementing email/password + JWT + cookie sessions. By v0.0.1 we had:

- Supabase as the production database (already in the stack via `@supabase/supabase-js`).
- A custom auth library (`packages/auth/`) implementing what Supabase Auth ships out of the box.
- Both running side-by-side in some routes, neither in others. Confused which was authoritative.

This is a high-cost / low-value duplication.

## Decision

Use **Supabase Auth via the SSR helpers** (`@supabase/ssr`) as the single source of truth for user identity in the web app. Server components, server actions, and API route handlers all read the session via the same `createClient()` factory.

Concretely:

- `apps/web/src/lib/supabase/server.ts` is the canonical server-side client.
- `apps/web/src/lib/identity-edge.ts` and `apps/web/src/lib/session.ts` wrap the supabase client with origin-check + rate-limit + audit-log fan-out.
- The `withSupabaseAuth` wrapper in `apps/web/src/lib/api-handler.ts` owns the route handler entry: it verifies the session, extracts the user id, runs CSRF + origin + rate-limit, and emits the audit event on rejection.
- The internal API (`apps/api`) does NOT call Supabase directly. It trusts an HMAC-signed `x-retune-internal-key` header (`apps/api/src/lib/internal-auth.ts`) issued by the web layer.

The custom `packages/auth/` library is **deleted**. Verified zero callers in the active codebase.

## Consequences

**Positive**:

- One identity model. Engineers never have to ask "which auth is this route on?"
- Supabase covers password reset, email verification, MFA hooks, and OAuth providers without us writing them.
- Email-based features (signup verification, password reset) use Supabase's transactional email pipeline; we wire SMTP via env vars.
- Row-Level Security policies (Charter 08 Epic 01) reference the same user id Supabase issues, so the data layer's tenant isolation is consistent with the auth layer's identity.

**Negative**:

- Supabase outage cascades to every authenticated route. Mitigation: Supabase has a 99.9% SLA on Pro; we have monitoring on `/api/health` (Charter 05) to alert within minutes.
- Vendor lock-in to Supabase's session shape. Acceptable: Supabase Auth is built on standard JWTs and we hold the migration key — porting to another auth provider is non-trivial but not catastrophic.
- We give up ability to issue custom claim shapes server-side without going through Supabase admin APIs. None of our flows need it today.

## Alternatives Considered

- **Custom auth (`packages/auth/`)**: rejected. We were duplicating undifferentiated infrastructure. Maintenance cost > benefit.
- **Auth0 / Clerk**: rejected because we already pay for Supabase for the database; adding a second identity vendor doubles bill and complexity.
- **NextAuth.js**: rejected because it doesn't compose cleanly with Supabase RLS without writing the same JWT-issuance code we're trying to avoid.

## Migration Notes

- 2026-05-22: deleted `packages/auth/` after grep verified no production callers.
- 2026-05-23: confirmed `apps/api/src/main.ts` `assertProductionRuntime()` hard-fails on missing `RETUNE_INTERNAL_API_KEY`, so the internal auth surface cannot silently fall back to anonymous in prod.

## References

- `apps/web/src/lib/supabase/server.ts`
- `apps/web/src/lib/api-handler.ts`
- `apps/api/src/lib/internal-auth.ts`
- `docs/charters/01-security/README.md`
