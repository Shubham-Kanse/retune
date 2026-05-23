# Charter 08 — Data Architecture & Integrity

## Purpose

Establish row-level tenant isolation and GDPR compliance across the Retune data layer. Today the Postgres schema has no RLS policies (explicitly marked "Unimplemented — commit #4+" in `packages/db/src/pg/schema.ts`), committed user data exists in `apps/web/data/`, and no right-to-erasure or right-to-portability implementation exists.

## Current State (architect-verified)

| Area | Status |
|------|--------|
| Row-Level Security (Drizzle migrations) | ❌ **Zero RLS** — verified across all 12 files in `packages/db/src/pg/migrations/` |
| Row-Level Security (Supabase migrations) | ⚠️ **Partial** — `supabase/migrations/20260510230400_rls_policies_missing.sql` (5,914 B) adds RLS policies. Coverage of all 31 tables is unverified. The intern claimed "no policies anywhere" — this is **factually wrong**; the precise gap is "no policies in the Drizzle track and unverified coverage in the Supabase track". |
| **Dual migration tracks** (architect note) | 🚨 **CRITICAL** — 12 Drizzle SQL files vs 30 Supabase migrations with no automated sync. The four `fix_*` Supabase files (`20260510230000_fix_schema_issues.sql`, `230100_fix_architectural_issues.sql`, `230200_fix_security_advisor.sql`, `230300_fix_security_warnings.sql`) are evidence of past divergence. New Epic 03 owns this. |
| Committed PII | ✅ `apps/web/data/` is in root `.gitignore`. Verified absent from `git status`. Historical-commit audit needed. |
| KMS Encryption | ❌ `users.kms_key_id` column exists, no encryption implementation |
| Right to Erasure | ⚠️ Partial — `DELETE /api/account` does hard-delete. No grace period. No Supabase auth deletion. |
| Right to Portability | ⚠️ Partial — `/api/account/export` exists. Coverage of all 31 tables unverified. |
| Data Retention | ❌ No retention policy or automated sweep |
| **Temporal-path GDPR gap** (architect note) | 🚨 `apps/api/src/runtime/workbench-runtime.ts:560` wires `extended_persistence` (which writes `gdpr_packets`). The Temporal substrate (`packages/agent/src/temporal/activities/substrate.ts`) does NOT pass `extended_persistence`. **In Temporal mode (production target), GDPR packets may not persist.** Silent failure. Epic 02 must address. |

## Epics

| # | Epic | Priority | Dependency |
|---|------|----------|------------|
| 01 | [Row-Level Security](./epic-01-row-level-security.md) | P0 — Critical | None |
| 02 | [GDPR Compliance](./epic-02-gdpr-compliance.md) | P0 — Critical | Charter 01 Epic 01 (history rewrite); architect note: must wire `extended_persistence` into Temporal substrate so GDPR packets persist in production-mode |
| 03 | (NEW) Migration track unification | P0 | None — pick Supabase as the source of truth for production schema; regenerate Drizzle schema as a typed mirror via `supabase db diff`. The two parallel migration timelines have already produced four `fix_*` emergency patches; they will produce more without unification. |

## Success Criteria

1. No user can read or write another user's data via direct DB query when connected as `retune_app` role
2. Integration tests prove cross-tenant isolation
3. `apps/web/data/` removed from git history and gitignored
4. Users can request account deletion with 30-day grace period
5. Users can export all their data as a ZIP archive
6. Supabase auth user is deleted on account deletion

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| RLS breaks existing queries that don't set `app.current_user_id` | Integration tests + staged rollout; service role bypasses RLS |
| BFG history rewrite requires force-push | Coordinate with all contributors; single scheduled window |
| Soft-delete grace period requires cron infrastructure | Use Temporal scheduled workflow or pg_cron |

## Out of Scope

- KMS encryption implementation (separate charter)
- Field-level encryption
- Data residency routing (column exists, enforcement deferred)
- Audit log table (separate from per-tick `audit_entries`)
