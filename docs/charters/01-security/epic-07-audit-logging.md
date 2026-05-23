# Epic 07 — Security Audit Logging

**Charter:** 01-Security
**Priority:** P1 — Week 4
**Complexity:** L
**Owner:** Staff Engineer + Security Engineer
**Status:** Created in architect rewrite (2026-05-22). No durable audit log exists today; only `console.log`/`console.error` in route handlers.

---

## Goal

Establish a durable, queryable audit log of security-sensitive events: auth events, admin actions, data access through service role, billing changes, and RLS bypass. Today the only observability is ephemeral `console.log`/`console.error` calls scattered across `apps/api/src/routes/*.ts` and `apps/web/src/app/api/auth/*/route.ts`. These are lost on container restart and cannot be queried, correlated, or retained for compliance. This epic adds a Postgres-backed `security_audit_log` table, a typed helper function, and instrumentation at 12 named callsites.

## Definition of Done

- [ ] `security_audit_log` table exists in `packages/db/src/pg/schema.ts` with the specified schema.
- [ ] `recordSecurityEvent()` helper is exported from `apps/api/src/lib/audit.ts` and callable from both `apps/api` and `apps/web` (via shared DB connection).
- [ ] 12 named callsites are instrumented (see Story 7.2).
- [ ] Audit log entries include `request_id` for correlation with structured logs (depends on Charter 05 Epic 01).
- [ ] Admin-only audit dashboard is accessible at `/admin/audit` in `apps/web` (gated by admin role check).
- [ ] Audit log table has RLS policy: only service role can INSERT; only admin users can SELECT; regular users cannot read other users' audit entries.
- [ ] Retention policy: entries older than 90 days are archived to cold storage (or marked for deletion) via a scheduled job.

---

## Code grounding (verified)

- `packages/db/src/pg/schema.ts` — existing tables follow the pattern: UUID PK with `gen_random_uuid()`, `created_at` timestamptz default `now()`, optional `updated_at`/`deleted_at`. The schema comment (lines 27–29) explicitly lists "audit_log table" as unimplemented future work.
- `packages/db/src/pg/schema.ts:audit_entries` (line 180) — per-generation orchestrator tick audit. This is a *cognitive* audit trail, NOT a security audit log. The new `security_audit_log` is a separate table for security events.
- `apps/api/src/lib/internal-auth.ts` — `resolveAuthenticatedIdentity()` returns `{ error, status }` on auth failure (lines 48, 49, 53, 54). These failure paths have no audit logging today.
- `apps/api/src/lib/generation-access-token.ts` — `verifyGenerationAccessToken()` returns `null` on failure. No audit trail for rejected preflight tokens.
- `apps/api/src/lib/ssrf-guard.ts` — `validateExternalUrl()` returns `{ ok: false, reason }` on rejection. No audit trail for SSRF guard rejections.
- `apps/web/src/lib/api-handler.ts` — `withAuth` throws `AuthError()` on session failure (line 39), `RateLimitError()` on rate limit (line 37). Neither is durably logged.
- `apps/web/src/lib/rate-limit.ts` — in-memory rate limiter. Rate-limit exceeds are thrown as `RateLimitError` but not recorded.
- `apps/web/src/app/api/account/route.ts` — `DELETE` handler (line 39) deletes user row and files. No audit record of account deletion.
- `apps/web/src/app/api/auth/login/route.ts`, `apps/web/src/app/api/auth/signup/route.ts` — auth routes. No durable logging of login/signup events.
- `packages/billing/src/index.ts` — `upgradeToPro()` (line 237) and `upgradeToMax()` (line 243) update subscription plan. No audit record of billing tier changes.
- `apps/web/src/lib/csrf.ts` — once Epic 05 lands, CSRF failures need audit logging (callsite 8).
- `.env.example` — `SUPABASE_SERVICE_ROLE_KEY` is documented. Any code path using this key bypasses RLS and must be audited.

---

## Story 7.1 — Schema migration + recordSecurityEvent() helper

**As a** platform engineer,
**I want** a typed, indexed audit log table and a single helper function to write to it,
**so that** instrumentation is consistent and queryable.

### Acceptance criteria

- [ ] New table `security_audit_log` in `packages/db/src/pg/schema.ts` with columns:
  - `id` uuid PK (default `gen_random_uuid()`)
  - `user_id` uuid nullable (FK to `users.id`, `onDelete: 'set null'`)
  - `actor_kind` varchar(32) NOT NULL — enum: `'service_role'`, `'user'`, `'anonymous'`
  - `event_type` varchar(128) NOT NULL (e.g. `'auth.login_failed'`, `'billing.upgrade'`, `'account.deleted'`)
  - `target_kind` varchar(64) nullable (e.g. `'user'`, `'generation'`, `'subscription'`)
  - `target_id` uuid nullable
  - `request_id` varchar(64) nullable (correlation ID from structured logging — Charter 05 Epic 01)
  - `ip` varchar(45) nullable (IPv4 or IPv6)
  - `user_agent` text nullable
  - `payload` jsonb nullable (event-specific metadata)
  - `created_at` timestamptz NOT NULL default `now()`
- [ ] Indexes: `(user_id, created_at)`, `(event_type, created_at)`, `(request_id)`.
- [ ] Drizzle migration generated and tested against PGlite.
- [ ] `apps/api/src/lib/audit.ts` exports `recordSecurityEvent(params: SecurityEvent): Promise<void>` that inserts a row. Fire-and-forget (does not throw on insert failure — logs to stderr instead).
- [ ] Type `SecurityEvent` is exported from `packages/types` for cross-package use.

### Tasks

- **7.1.1 — Add table to pg/schema.ts:** Follow existing patterns (UUID PK, `tcol("created_at")`). Place after `audit_entries` table.
- **7.1.2 — Generate migration:** Run `pnpm db:migrate` to produce the SQL migration file in `packages/db/src/pg/migrations/`.
- **7.1.3 — Create apps/api/src/lib/audit.ts:** Export `recordSecurityEvent()`. Accept a `SecurityEvent` object. Use the existing Drizzle `db` instance from `packages/db/pg`.
- **7.1.4 — Export SecurityEvent type:** Add to `packages/types/src/audit.ts`. Include a discriminated union of known event types for type safety.
- **7.1.5 — Test migration:** Write a PGlite-based test that creates the table, inserts a row, and queries it back.

---

## Story 7.2 — Instrument 12 named callsites

**As a** security engineer,
**I want** every security-sensitive code path to emit an audit event,
**so that** incidents can be reconstructed from the log.

### Acceptance criteria

- [ ] The following 12 callsites emit `recordSecurityEvent()`:

| # | Event type | Callsite file | Trigger |
|---|-----------|---------------|---------|
| 1 | `auth.login_success` | `apps/web/src/app/api/auth/login/route.ts` | Successful `signInWithPassword` |
| 2 | `auth.login_failed` | `apps/web/src/app/api/auth/login/route.ts` | Failed `signInWithPassword` |
| 3 | `auth.signup` | `apps/web/src/app/api/auth/signup/route.ts` | New user created |
| 4 | `account.deleted` | `apps/web/src/app/api/account/route.ts` (DELETE handler, line 39) | User self-deletes |
| 5 | `billing.upgrade` | `packages/billing/src/index.ts` (`upgradeToPro` line 237, `upgradeToMax` line 243) | Plan tier change |
| 6 | `auth.session_rejected` | `apps/web/src/lib/api-handler.ts` (withAuth, line 39) | `getApiSession()` returns null |
| 7 | `auth.internal_key_rejected` | `apps/api/src/lib/internal-auth.ts` (lines 48–54) | Invalid/missing internal API key |
| 8 | `csrf.token_invalid` | `apps/web/src/lib/api-handler.ts` | CSRF verification fails (after Epic 05) |
| 9 | `rate_limit.exceeded` | `apps/web/src/lib/api-handler.ts` (line 37) | Rate limit threshold hit |
| 10 | `ssrf.url_rejected` | `apps/api/src/runtime/workbench-runtime.ts` (line 74, calls `validateExternalUrl`) | SSRF guard rejects URL |
| 11 | `auth.preflight_token_rejected` | `apps/api/src/lib/generation-access-token.ts` | `verifyGenerationAccessToken` returns null (non-test) |
| 12 | `auth.service_role_access` | Any future code path using `SUPABASE_SERVICE_ROLE_KEY` | RLS bypass via service role |

- [ ] Each event includes: `user_id` (if known), `actor_kind`, `ip` (from `x-forwarded-for` or `x-real-ip`), `user_agent`, and event-specific `payload`.
- [ ] Audit calls are non-blocking (fire-and-forget with error logging to stderr).
- [ ] No sensitive data in `payload` (no passwords, no tokens, no PII beyond user_id).

### Tasks

- **7.2.1 — Instrument auth routes (callsites 1–3):** Modify `apps/web/src/app/api/auth/login/route.ts` and `signup/route.ts`.
- **7.2.2 — Instrument account deletion (callsite 4):** Modify `apps/web/src/app/api/account/route.ts` DELETE handler.
- **7.2.3 — Instrument billing upgrades (callsite 5):** Modify `packages/billing/src/index.ts` `upgradeToPro()` and `upgradeToMax()`.
- **7.2.4 — Instrument api-handler failures (callsites 6, 8, 9):** Modify `apps/web/src/lib/api-handler.ts` catch blocks.
- **7.2.5 — Instrument internal-auth rejection (callsite 7):** Modify `apps/api/src/lib/internal-auth.ts` error return paths.
- **7.2.6 — Instrument SSRF guard (callsite 10):** Modify `apps/api/src/runtime/workbench-runtime.ts` where `validateExternalUrl` is called.
- **7.2.7 — Instrument preflight token rejection (callsite 11):** Modify `apps/api/src/lib/generation-access-token.ts` null-return paths.
- **7.2.8 — Add service-role access hook (callsite 12):** Create a wrapper `withServiceRoleAudit()` that logs whenever the service role key is used. Apply to any future service-role code path.

---

## Story 7.3 — Admin audit dashboard

**As an** admin user,
**I want** a queryable audit dashboard,
**so that** I can investigate security events without direct database access.

### Acceptance criteria

- [ ] Route `/admin/audit` in `apps/web` renders a paginated, filterable table of audit log entries.
- [ ] Filters: `event_type`, `user_id`, `date range`, `actor_kind`.
- [ ] Only users with `role = 'admin'` (or equivalent flag in `users` table) can access the page. Non-admins get 403.
- [ ] API endpoint `GET /api/admin/audit` returns paginated JSON (limit/offset, default 50 per page).
- [ ] The API endpoint uses the existing `withAuth` wrapper + an additional admin-role check.
- [ ] Dashboard shows: timestamp, event type, actor kind, user email (joined), IP, truncated payload.
- [ ] Export to CSV button for filtered results.

### Tasks

- **7.3.1 — Add admin role check:** Create `apps/web/src/lib/admin-guard.ts` that verifies the session user has admin privileges. Initially: check a `role` column on `users` table (add if missing) or an `is_admin` boolean.
- **7.3.2 — Create API route:** `apps/web/src/app/api/admin/audit/route.ts` with GET handler, pagination, and filters.
- **7.3.3 — Create dashboard page:** `apps/web/src/app/(app)/admin/audit/page.tsx` with table component, filters, and pagination.
- **7.3.4 — Add CSV export:** Server-side CSV generation endpoint `GET /api/admin/audit/export?format=csv`.
- **7.3.5 — Add RLS policy documentation:** Document in `docs/security/audit-log-access.md` that the `security_audit_log` table has RLS: INSERT via service role only, SELECT for admin users only.

---

## Out of scope

- Real-time alerting on security events (future: webhook/Slack integration).
- Audit log for cognitive pipeline events (already covered by `audit_entries` table in `packages/db/src/pg/schema.ts`).
- Tamper-proof / append-only log (future: consider write-once storage or hash chaining).
- SIEM integration (future: export to Datadog/Splunk via structured log forwarding).

---

## Hard dependencies

- **Charter 05 Epic 01 (structured logging):** Must close first so `request_id` is propagated through the request lifecycle and available to `recordSecurityEvent()`. Without this, the `request_id` column will be null.
- **Charter 08 Epic 01 (RLS):** Must close so the `security_audit_log` table has proper row-level security policies. Until RLS is in place, the table is accessible to any database role. Document explicitly: admin queries bypass RLS via service role — this is intentional and itself audited (callsite 12).
- **Epic 05 (CSRF):** Callsite 8 (`csrf.token_invalid`) cannot be instrumented until Epic 05 lands the CSRF verification in `api-handler.ts`.
- **Existing Drizzle migration infrastructure:** `packages/db/src/pg/migrations/` and `pnpm db:migrate` must be functional.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Audit log INSERT adds latency to hot paths (auth, rate-limit) | Fire-and-forget pattern — `recordSecurityEvent` does not await in the request path; failures logged to stderr |
| Audit log grows unbounded | 90-day retention policy via scheduled cleanup job (nightly cron in `cognitive-cycle.yml`) |
| Sensitive data leaks into `payload` column | Type system enforces allowed payload shapes; code review gate; no raw request bodies stored |
| `request_id` is null until Charter 05 Epic 01 lands | Column is nullable; backfill is not required; correlation improves once structured logging ships |
| Admin dashboard exposes PII (emails, IPs) | Admin-only access; RLS policy; access to dashboard is itself audited (meta-audit) |
| Service-role bypass of RLS on audit table | Documented and intentional; service-role access is itself logged (callsite 12) |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Table created successfully | PGlite migration test inserts and queries a row | `packages/db` test suite |
| `recordSecurityEvent()` writes to DB | Integration test: call helper, query table, assert row exists | `apps/api` test suite |
| Auth failure produces audit entry | Login with wrong password → query `security_audit_log` for `auth.login_failed` | Integration test |
| Account deletion produces audit entry | Delete account → query for `account.deleted` with correct `user_id` | Integration test |
| Billing upgrade produces audit entry | Call `upgradeToPro()` → query for `billing.upgrade` | Unit test |
| Rate-limit exceed produces audit entry | Exceed rate limit → query for `rate_limit.exceeded` | Integration test |
| SSRF rejection produces audit entry | Call `validateExternalUrl("http://169.254.169.254")` in workbench-runtime context → query for `ssrf.url_rejected` | Integration test |
| Admin dashboard returns 403 for non-admin | Request `/api/admin/audit` with non-admin session → 403 | vitest |
| Admin dashboard returns paginated results | Request with admin session → 200 with correct shape | vitest |
| Fire-and-forget does not throw | Mock DB failure in `recordSecurityEvent` → no exception propagates to caller | Unit test |
| No secrets in payload | Grep all `recordSecurityEvent` calls for password/token/key in payload → zero matches | Code review + lint rule |
