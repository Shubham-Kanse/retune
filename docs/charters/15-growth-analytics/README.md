# Charter 15 — Growth & Analytics

## Purpose

Instrument the Retune product with real analytics and remote feature flags to enable data-driven decisions, measure funnel conversion, and safely roll out features without deploys.

## Current State

| Asset | State |
|-------|-------|
| `apps/web/src/lib/analytics.ts` (1302 B) | Stub — calls `console.log` only |
| `apps/web/src/lib/feature-flags.ts` (5369 B) | Hardcoded env-var booleans, no remote service |
| `apps/web/src/lib/onboarding-v2/analytics.ts` (3511 B) | Event tracking defined but not wired to any service |
| `apps/web/src/components/admin/analytics-dashboard.tsx` (9110 B) | Component exists, not linked from any route |
| External integrations | None (no PostHog, Mixpanel, Amplitude, or Segment) |

## Target State

- PostHog client-side and server-side SDKs integrated
- Defined event taxonomy covering auth, onboarding, generation, billing, and results
- All key user flows instrumented with real PostHog calls
- Feature flags served remotely via PostHog with local fallback
- `FeatureGate` component for declarative flag-gated UI

## Epics

| # | Epic | Status |
|---|------|--------|
| 01 | [PostHog Integration](./epic-01-posthog-integration.md) | Not Started |
| 02 | [Feature Flags](./epic-02-feature-flags.md) | Not Started |

## Success Metrics

- 100% of defined events firing in PostHog dashboard within 1 week of deploy
- Feature flag evaluation latency < 50ms p95
- Zero analytics-related errors in production logs

## Dependencies

- PostHog project + API key provisioned
- `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` set in deployment environments


## Architect addenda (2026-05-22)

- **PostHog must be EU-hosted** — verified `.env.vercel` shows `aws-0-eu-west-1.pooler.supabase.com` (EU data residency). Use `eu.posthog.com`, not `app.posthog.com`. Ship a DPA with PostHog before any user-PII event is sent.
- **Funnel events already defined** — `apps/web/src/lib/onboarding-v2/analytics.ts` has typed event shapes that emit nowhere in production. Epic 01 just needs to wire them to PostHog; the taxonomy is already in code.
- **Replace the 9 stub libraries** — `feature-flags.ts`, `analytics.ts`, `error-tracker.ts`, `websocket.ts`, `collaboration.ts`, `semantic-search.ts`, `ai-suggestions.ts`, `ml-ats-optimizer.ts`, `performance.ts`. None of them are wired. Once PostHog (Charter 15 Epic 01) and Sentry (Charter 05 Epic 03) land, delete the matching stubs (coordinate with Charter 02-codebase-quality Epic 03).
- **Feature flag fallback path** — Epic 02 must specify what happens when PostHog is unreachable. Default-on or default-off per flag, documented. Without a fallback policy, an outage in PostHog cascades into a UX outage.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 15.
