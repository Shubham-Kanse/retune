# Charter 18 — Migrations & Upgrade Paths

## Purpose

Establish reversible migration practices and automated dependency management to reduce risk of schema changes and prevent version drift across the monorepo.

## Current State (architect-revised)

| Asset | State |
|-------|-------|
| `packages/db/src/pg/migrations/` | 12 migration files (0000–0011), zero down migrations |
| `supabase/migrations/` | **30 migration files** (intern said 32; actual count 30) — separate system, not unified |
| **Dual-track schema drift** (architect note) | 🚨 **CRITICAL.** Drizzle 12 files vs Supabase 30 files run on independent timelines. Four `fix_*` Supabase migrations exist as historical evidence of repeated production drift: `20260510230000_fix_schema_issues.sql`, `230100_fix_architectural_issues.sql`, `230200_fix_security_advisor.sql`, `230300_fix_security_warnings.sql`, `165400_fix_auth_provider_onboarding.sql`, `165500_fix_auth_user_trigger.sql`. The intern's charter does not address this — the bigger problem than down-migrations. |
| Zod versions | Two: zod@3.25.76 and zod@4.4.3 (verified across `apps/web/package.json` and `packages/agent/package.json`) |
| OpenAI SDK | openai@6.36.0 linked to both zod@3 and zod@4 |
| Dependency automation | None — no Renovate or Dependabot |

## Target State

- Every migration has a corresponding `.down.sql` rollback file
- CI enforces the down-migration convention
- A programmatic rollback function exists in `packages/db`
- Renovate automates dependency PRs with patch automerge
- Zod consolidated to a single version (v4) across all packages

## Epics

| # | Epic | Status |
|---|------|--------|
| 01 | [Down Migrations](./epic-01-down-migrations.md) | Not Started |
| 02 | [Dependency Upgrades](./epic-02-dependency-upgrades.md) | Not Started |
| 03 | (NEW) Migration track unification | Not Started — single source of truth: Supabase owns production schema (it owns auth + RLS); Drizzle becomes a typed mirror generated via `supabase db diff`. **Co-owned with Charter 08 Epic 03 (single shared file/owner).** |

## Success Metrics

- 100% of migrations have corresponding down files
- CI blocks PRs that add migrations without down files
- Zero duplicate major versions of any dependency in `pnpm ls --depth 0`
- Renovate PRs created within 24h of new patch releases

## Dependencies

- CI pipeline access (GitHub Actions)
- Renovate GitHub App installed on the repository
