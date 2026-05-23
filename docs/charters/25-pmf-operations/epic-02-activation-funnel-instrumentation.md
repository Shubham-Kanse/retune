# Charter 25 Epic 02 — Activation Funnel Instrumentation

**Charter:** 25 — PMF Operations
**Status:** Not started (this epic ships the events; B9 in the current backlog wires the highest-leverage subset)
**Owner:** Frontend lead + analytics

## Goal

Fire PostHog events at every stage of the new-user activation funnel
so we can see the drop-off curve and target the worst step.

## Definition of Done

- Every funnel event fires from a single canonical call site.
- Events are documented in `docs/pmf/event-taxonomy.md`.
- PostHog "Funnel" insight visualises the conversion through each step.
- Each event includes `distinct_id` (Supabase user UUID), `$pathname`,
  and the relevant business properties.
- No event carries PII (email, full name, JD content, resume content).

## The funnel

| # | Event | Trigger |
|---|---|---|
| 1 | `signup_complete` | Successful POST /api/auth/signup → 200 |
| 2 | `onboarding_v2_started` | First `(onboarding)/onboarding-v2/page.tsx` render after signup |
| 3 | `onboarding_v2_resume_uploaded` | Stage 1 upload completes (extraction succeeds) |
| 4 | `onboarding_v2_summary_confirmed` | Stage 4 user clicks "Looks right" |
| 5 | `onboarding_v2_completed` | Stage 9 commit succeeds; `commit_committed_at` set |
| 6 | `first_generation_started` | First successful POST /api/generate for the user |
| 7 | `first_generation_completed` | First SSE `done` event for the user |
| 8 | `first_resume_downloaded` | First GET /api/generate/:id/resume.docx → 200 |
| 9 | `subscribed` | Stripe `checkout.session.completed` for this user |

## Properties per event

| Event | Properties |
|---|---|
| signup_complete | `email_domain`, `referrer_source` |
| onboarding_v2_* | `stage_index`, `time_in_stage_ms` |
| first_generation_started | `jd_source` (paste/url), `market` |
| first_generation_completed | `ticks_executed`, `cost_usd`, `outcome` |
| first_resume_downloaded | `format` (docx/pdf) |
| subscribed | `plan`, `trial`, `coupon` |

## Stories

### Story 2.1 — Event helper
Single `captureEvent(name, properties?)` function that:
- Calls `posthog.capture(distinct_id, name, properties)` server-side
  (when called from API route).
- Calls `posthog.capture(name, properties)` client-side (when called
  from a component).
- Strips any PII-shaped property keys.

**Acceptance:** Helper landed in `apps/web/src/lib/analytics.ts` (or
re-exported from existing PostHog provider). 5 unit tests.

### Story 2.2 — Wire all 9 events
Add the calls at the listed trigger points. Many already exist as
`recordSecurityEvent` (Charter 01 E7) — reuse the trigger location.

**Acceptance:** All 9 events visible in PostHog Live Events feed when
the developer signs up + walks through.

### Story 2.3 — PostHog funnel insight
Build the funnel visualisation. Filter to last-30-days users.

**Acceptance:** Funnel URL in `docs/pmf/event-taxonomy.md`.

### Story 2.4 — Drop-off alert
Slack alert when conversion at any step drops > 10pp week-over-week.

**Acceptance:** Test alert fires on synthetic data.

## Tasks

- [ ] 2.1.1 Implement helper.
- [ ] 2.1.2 Unit tests for PII stripping.
- [ ] 2.2.1 Fire `signup_complete` from `/api/auth/signup`.
- [ ] 2.2.2 Fire `onboarding_v2_*` events from the V2 hook.
- [ ] 2.2.3 Fire `first_generation_*` from `/api/generate` (start) and
      from the SSE done handler (complete).
- [ ] 2.2.4 Fire `first_resume_downloaded` from
      `apps/web/src/app/api/generate/[id]/resume.docx/route.ts`.
- [ ] 2.2.5 Fire `subscribed` from the Stripe webhook handler.
- [ ] 2.3.1 Configure PostHog funnel insight.
- [ ] 2.4.1 Configure drop-off alert.

## Dependencies

- Charter 15 Epic 01 (PostHog provider) — landed.
- Charter 25 Epic 01 (north-star) — concurrent.

## Estimated effort

~2 working days.
