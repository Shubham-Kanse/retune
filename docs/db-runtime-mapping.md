# Retune DB Runtime Mapping (Supabase)

This document maps current runtime code to DB tables, and marks optimized-schema coverage.

## 1) Active Runtime Tables (used today)

- `users`
  - Used by auth/session/signup/verify/reset, onboarding status, account APIs.
  - Critical legacy/runtime fields still in active use: `password_hash`, `auth_provider`, `email_verified`, `onboarding_completed`.
- `profiles`
  - Used by onboarding save/message/upload, profile read/update, generate preflight context.
  - Legacy profile text fields are still first-class in app behavior.
- `onboarding_conversations`
  - Used by onboarding upload/message/save/skip flows.
- `jds`
  - Used by generate pipeline input persistence.
- `generations`
  - Used by API orchestration state, status stream, results, audit endpoints.
- `goals`, `conflicts`, `active_questions`, `audit_entries`, `blackboard_snapshots`
  - Used by workbench runtime + Temporal/in-memory orchestration.
- `applications`
  - Primary product record shown in dashboard/result/files/download APIs.
  - Current UI/result flows still depend on `resume_content`, `cover_letter_content`, `application_strategy`.
- `documents`
  - Used for rendered content variants and output retrieval.
- `outcomes`
  - Used by outcome/feedback routes.
- `subscriptions`, `usage_records`
  - Used by billing/quota/usage logic.
- `password_reset_tokens`, `processor_consents`, `generation_preflights`, `ab_test_assignments`, `voice_centroids`, `honesty_calibrations`, `gdpr_packets`
  - Used by auth/compliance/preflight/experiments/persona calibration/GDPR APIs.

## 2) Provisioned but Not Primary Runtime Path Yet

- `job_descriptions`, `jd_analysis`
- `generation_goals`, `generation_ticks`, `generation_snapshots`, `generation_conflicts`, `generation_questions`
- `generation_artifacts`, `generation_results`, `generation_audit_packets`
- `skill_ontology`, `profile_skills`, `billing_subscriptions`, `billing_usage`, `oauth_accounts`, `user_sessions`, `gdpr_deletion_log`

These exist in Supabase schema, but runtime logic currently reads/writes legacy-compatible tables first.

## 3) Gaps Found + Fixed

- Fixed: missing `users.onboarding_completed` column in Supabase.
  - Migration: `supabase/migrations/20260510_fix_users_onboarding_completed.sql`
- Added drift guard: sync trigger between `users.onboarding_complete` and `users.onboarding_completed`.
  - Migration: `supabase/migrations/20260510_sync_onboarding_flags.sql`

## 4) Permanent Guardrail

- Added schema audit script to compare live Supabase against runtime Drizzle schema:
  - `tools/db/schema-audit.cjs`
  - Run with: `pnpm db:audit:schema`
  - Fails (exit 1) on missing runtime tables/columns.

## 5) Migration Strategy to Fully Optimized Schema

1. Introduce repository layer per domain (`profileRepo`, `generationRepo`, `applicationRepo`) and move route handlers behind repositories.
2. Enable dual-write for high-traffic domains:
   - `jds -> job_descriptions`
   - generation state -> `generation_*` optimized tables
   - output metadata -> `generation_artifacts` / `generation_results`
3. Switch read path to optimized tables after parity window.
4. Backfill historical rows and verify row-count + checksum parity.
5. Deprecate legacy columns only after 2 release cycles with parity dashboards.

## 6) Definition of Done for “Fully Optimized”

- 100% writes go to optimized canonical tables.
- Legacy tables/columns become compatibility views only.
- Dashboard/result/files APIs read optimized artifacts/results first.
- CI gate enforces `pnpm db:audit:schema` + parity tests.

## 7) Current Runtime Mode

- Result API path now runs optimized-first by default in code (no feature flag gate).
- Upstream cognitive response is still used to hydrate optimized tables when no optimized row exists yet.
- Legacy writes remain only where still required by other surfaces that have not yet been migrated.
