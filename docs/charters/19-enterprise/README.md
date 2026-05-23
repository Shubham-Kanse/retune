# Charter 19 — Multi-Tenancy & Enterprise

## Vision

Transform Retune from a single-user SaaS into an enterprise-ready platform supporting organisation accounts, team collaboration, SAML/OIDC SSO, audit logging, and custom domains.

## Current State

| Area | Status |
|------|--------|
| Auth | Supabase Auth (email/password + Google OAuth). No SAML/OIDC. |
| Auth package | `packages/auth/` — Supabase client helpers only |
| Database | `packages/db/src/pg/schema.ts` — individual user accounts, no organisation concept |
| RLS | None (being added in Charter 08) |
| Audit logs | None |
| Custom domains | None |

## Target State

- Organisations with owner/admin/member roles
- Invite-by-email team onboarding
- Per-organisation billing plans and credit pools
- SAML/OIDC SSO (future epic)
- Audit log trail for compliance (future epic)
- Custom domain support (future epic)

## Epics

| # | Epic | Status |
|---|------|--------|
| 01 | [Organisation Accounts](./epic-01-organisation-accounts.md) | planned |
| 02 | Team Billing & Credit Pools | planned |
| 03 | SAML/OIDC SSO | planned |
| 04 | Enterprise Audit Logs | planned |
| 05 | Custom Domains | planned |

## Dependencies

- Charter 08 (RLS) — row-level security must be in place before org-scoped data isolation
- Charter 12 (Billing) — credit pool logic extends existing billing package

## Success Metrics

- Organisations can be created and members invited within 30 seconds
- 100% of generation data is scoped to the owning organisation
- SSO login completes in < 3 seconds
- Audit log queries return within 500ms for 90-day windows


## Architect addenda (2026-05-22)

- **No `organisations` table in `packages/db/src/pg/schema.ts`** — verified. Epic 01 starts the schema work from scratch.
- **Hard dep on Charter 08 Epic 01 (RLS) is correct** — orgs share rows; tenant isolation is RLS-driven. Cannot start enterprise work before RLS lands.
- **`packages/auth/` deletion is a prerequisite** — the custom auth provider in `packages/auth/` is dead code (Supabase SSR replaces it). Enterprise SSO (Epic 03) must build on Supabase Auth's SAML/OIDC support, not the legacy `packages/auth/`. Coordinate with Charter 02-Codebase-Quality Epic 05 (delete `packages/auth/`).
- **Audit log infrastructure** — Charter 19 Epic 04 (Enterprise Audit Logs) is logically downstream of Charter 01 Epic 07 (Security Audit Logging). Build the security audit log first; the enterprise audit log surface is a tenant-scoped query layer on top.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 19 and §4.
