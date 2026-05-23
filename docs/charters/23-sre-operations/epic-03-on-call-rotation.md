# Charter 23 Epic 03 — On-Call Rotation

**Charter:** 23 — SRE Operations
**Status:** Not started
**Owner:** Engineering Manager

## Goal

Establish a named on-call rotation with paging tooling, hand-off
runbooks, and a healthy on-call culture (sustainable, paid,
documented).

## Definition of Done

- Paging tool live: PagerDuty / Grafana On-Call / OpsGenie.
- Schedule covers 24/7. Today: founder primary, no secondary. Goal: 2
  engineers in rotation by month 3, 4 by month 6.
- Charter 23 Epic 01 burn-rate alerts page on-call.
- Sentry critical errors page on-call.
- Synthetic check failures page on-call.
- On-call hand-off runbook published.
- On-call compensation policy documented.

## On-call expectations

| Role | Response time | Notes |
|---|---|---|
| Primary | Acknowledge within 5 min, mitigate within 30 min | Carry phone, sober, near a laptop |
| Secondary | Acknowledge within 15 min if primary doesn't respond | |
| Escalation manager | Loop in for any P0 incident lasting > 30 min | |

Rotation length: 1 week. Hand-off Monday 10am EU.

Compensation: $X/week base on-call pay + $Y per page outside business
hours (numbers set by leadership; documented in HR system).

## Stories

### Story 3.1 — Tool selection
Pick PagerDuty (mature, $20/user/mo) vs Grafana On-Call (cheaper but
ops-heavier) vs OpsGenie (similar to PagerDuty).

**Acceptance:** decision document; contract signed.

### Story 3.2 — Schedule + escalation
Configure the rotation. Define escalation policy: primary → secondary
(10 min) → engineering manager (10 min) → founder (10 min).

**Acceptance:** Test page reaches escalation manager within 30 min.

### Story 3.3 — Integration wiring
Wire alerts from:
- Grafana (SLO burn-rate)
- Sentry (critical errors)
- Synthetic checks (Pingdom/Checkly/Grafana Synthetic)
- Stripe webhook failures (sustained > 5 in 5 min)
- Temporal worker crashes

**Acceptance:** Each source successfully pages on a synthetic test.

### Story 3.4 — Runbooks
Co-deliver with Charter 23 Epic 05. Each runbook ends with
"escalate-to" + "postmortem-required-yes/no".

**Acceptance:** First 5 runbooks ready before the rotation goes live.

### Story 3.5 — Compensation + culture
Document expectations + compensation. Schedule monthly retro on
on-call quality. Aim: < 1 page per shift on average; < 10% of pages
during sleeping hours.

**Acceptance:** Comp policy in HR docs; retro on the calendar.

## Tasks

- [ ] 3.1.1 Compare tools.
- [ ] 3.1.2 Sign annual contract.
- [ ] 3.2.1 Configure schedule.
- [ ] 3.2.2 Configure escalation policy.
- [ ] 3.3.1 Wire Grafana → tool.
- [ ] 3.3.2 Wire Sentry → tool.
- [ ] 3.3.3 Wire synthetic checks → tool.
- [ ] 3.4.1 Author first 5 runbooks (Charter 23 Epic 05).
- [ ] 3.5.1 Author comp policy.

## Dependencies

- Charter 23 Epic 01 (SLOs) for burn-rate alert thresholds.
- Charter 05 Epic 03 (Sentry) — landed.
- Charter 23 Epic 05 (runbooks) — concurrent.

## Estimated effort

~3 working days.
