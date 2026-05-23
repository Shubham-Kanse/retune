# Charter 25 Epic 01 — North-Star Tracking

**Charter:** 25 — PMF Operations
**Status:** Not started
**Owner:** Founder + Platform engineering

## Goal

Define + persist the north-star metric (Activated Weekly Users) as a
daily-computed number visible to the entire team. Without this,
prioritisation conversations are vibes-driven.

## Definition of Done

- Definition document at `docs/pmf/north-star.md` explaining the
  metric, its inputs, and its boundary conditions.
- A nightly job computes `activated_weekly_users` for the past 7 days.
- Result persisted to a new `pmf_metrics_daily` table.
- Posted to `#growth` Slack every morning.
- Visible in PostHog as a custom insight.

## The metric

**Activated Weekly User (AWU)** = a user who, in the last 7 days, has:

- Completed onboarding-v2 (`onboarding_v2_committed_at` is non-null), AND
- Produced at least one generation that reached a `done` SSE event
  (not refused, not errored, not in-flight).

This composes:

- **Acquisition** (the user signed up)
- **Activation** (they finished onboarding)
- **Engagement** (they got real value — at least one shipped resume)

## Boundary cases (decisions documented in `docs/pmf/north-star.md`)

- A user who completed onboarding but generated zero resumes? **Not** AWU.
- A user who has 5 active generations but none completed? **Not** AWU.
- A user who triggered 1 successful generation 8 days ago? **Not** AWU
  (rolling 7-day window).
- A user who's been refunded but used the product? Counts.
- A test user (`E2E_AUTH_BYPASS=1`)? Excluded.

## Stories

### Story 1.1 — Schema + nightly job
Add `pmf_metrics_daily` table:

```sql
CREATE TABLE pmf_metrics_daily (
  date DATE PRIMARY KEY,
  awu INTEGER NOT NULL,
  signups_7d INTEGER NOT NULL,
  onboarding_completes_7d INTEGER NOT NULL,
  successful_generations_7d INTEGER NOT NULL,
  paid_users_7d INTEGER NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Nightly Temporal scheduled workflow computes the row.

**Acceptance:** New row appears every morning at 06:00 UTC.

### Story 1.2 — Slack post
Bot posts to `#growth`:

```
📊 Retune metrics — 2026-05-23
• AWU: 247 (+12 vs yesterday, +89 vs week ago)
• Signups (7d): 312
• Onboarding completion: 78%
• Successful generations (7d): 1,420
• Paid users (7d): 14
```

**Acceptance:** Slack post lands daily.

### Story 1.3 — PostHog insight
Build a PostHog custom insight that mirrors AWU. Use the existing
PostHog provider (Charter 15 E1) + the events fired in Charter 25 E2.

**Acceptance:** Insight visible in PostHog dashboard.

### Story 1.4 — Public dashboard (internal)
Internal-only `/admin/pmf` page rendering the last 90 days' data.
Auth-gated to admins only.

**Acceptance:** Page accessible to admin emails; non-admins get 403.

## Tasks

- [ ] 1.1.1 Schema migration `0018_pmf_metrics_daily.sql`.
- [ ] 1.1.2 Temporal scheduled workflow `pmfMetricsDailyWorkflow` in
      `apps/worker/src/workflows/`.
- [ ] 1.1.3 Activity that runs the SQL aggregation.
- [ ] 1.2.1 Slack incoming-webhook URL in env vars.
- [ ] 1.2.2 Slack post step in the workflow.
- [ ] 1.3.1 Configure PostHog insight from the events catalog.
- [ ] 1.4.1 Build `/admin/pmf` page (in same UI style as `/settings`).

## Dependencies

- Charter 15 Epic 01 (PostHog provider) — landed.
- Charter 25 Epic 02 (activation funnel events) — concurrent.
- Charter 04 Epic 01 (Temporal in production) — landed.

## Estimated effort

~3 working days.
