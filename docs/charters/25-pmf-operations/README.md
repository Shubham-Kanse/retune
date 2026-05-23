# Charter 25 — PMF Operations

**Priority:** P0 (this is what tells us if Retune deserves to exist)
**Owner:** Founder + PMM (when hired)
**Status:** Scoped (2026-05-23). Mostly analytics + product instrumentation.

## Mission

Quantify Retune's path to product-market fit. Define the metrics that
answer "is this working?" and instrument the product to surface them
in real time, so we can decide what to build, what to kill, and when
to scale.

## Why this is its own charter

Engineering charters (01-20) make Retune *work*. This charter makes
us know whether *working* is enough for users to stay, pay, refer, and
advocate.

## North-star metric

**Activated weekly users** = users who in the last 7 days produced at
least one resume the user marked as "ready to send" (or downloaded).
This combines acquisition (they showed up), activation (they finished
onboarding), and engagement (they got real value).

Sub-metrics that feed it:

- Acquisition: signup rate per traffic source.
- Activation: % of signups who complete onboarding-v2 + first
  generation within 24h.
- Engagement: % of activated users producing a 2nd generation in the
  same week.
- Retention: weekly returning users / weekly active users.
- Referral: % of users with at least one inbound referral.
- Revenue: free → paid conversion rate, MRR, churn.

## Current state

| Metric | Instrumentation |
|---|---|
| Signups | DB count from `users.createdAt`. |
| Onboarding completion | None — Charter 02 onboarding-v2 doesn't surface a success metric. |
| First generation | None tracked. |
| Re-generation | None tracked. |
| Retention | No time-series view. |
| Referral | No referral mechanism. |
| Revenue | Stripe dashboard only — not joined to product behaviour. |

PostHog provider is wired (Charter 15) but only fires `$pageview`
today. Custom events not yet emitted.

## Epics

| # | Title | Description |
|---|-------|-------------|
| 01 | North-star tracking | Define + persist `activated_weekly_users` as a daily-computed metric. PostHog cohort + Postgres `pmf_metrics_daily` table. |
| 02 | Activation funnel instrumentation | Fire PostHog events at: `signup_complete`, `onboarding_v2_started`, `onboarding_v2_completed`, `first_generation_kicked`, `first_generation_completed`, `first_resume_downloaded`. |
| 03 | Engagement loops | Email re-activation: D+1 onboarding nudge, D+3 first-generation nudge, D+7 week-over-week summary. Powered by Resend / Loops / Customer.io. |
| 04 | NPS + qualitative | In-product NPS prompt at first-resume-downloaded + at week-4. Qualitative interview booking link for promoters + detractors. |
| 05 | Referral mechanism | Per-user referral link → 1 free month for both sides on conversion. |
| 06 | Cohort dashboards | Internal Grafana / PostHog dashboards by acquisition source, role family, market (US/UK), plan tier. |
| 07 | Pricing experiments | A/B tests for plan structure, free-tier limits, trial length. Feature-flag gated (Charter 15). |
| 08 | Sean Ellis test | Quarterly survey: "How would you feel if you couldn't use Retune anymore?" Target: ≥ 40% "very disappointed" = PMF achieved. |

## Success metrics

- North-star metric tracked + visible to all engineers.
- Sean Ellis ≥ 40% "very disappointed" within 12 months.
- Activation rate ≥ 60% within 24h of signup.
- Free → paid conversion ≥ 5% within 30 days of signup.
- NPS ≥ 30 (consumer SaaS benchmark).
- Referral coefficient k ≥ 0.3.

## Dependencies

- Charter 15 (Growth) — PostHog provider + feature flags wired (done).
- Charter 03 (Billing) — Stripe events flowing into our DB (done).
- Charter 02 (Core Features) — onboarding-v2 + generation flow stable
  (done).

## Out of scope

- Paid-acquisition channel optimisation (premature — fix activation
  + retention first).
- Enterprise GTM (Charter 19 + 22 deal with that).

## Owner

Founder until a PMM is hired. Weekly metric review.
