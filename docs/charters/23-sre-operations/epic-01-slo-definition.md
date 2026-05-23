# Charter 23 Epic 01 — SLO Definition

**Charter:** 23 — SRE Operations
**Status:** Not started
**Owner:** Platform engineering

## Goal

Publish per-service Service Level Objectives so we know what
"healthy" means before customers tell us we're broken. Track them in
a Grafana dashboard reading from Charter 05 Epic 04 metrics.

## Definition of Done

- SLO document published at `docs/sre/slos.md`.
- Each of `apps/web`, `apps/api`, `apps/worker`, `apps/ml` has at least
  one Availability SLO and one Latency SLO.
- Grafana dashboard wired to `retune_*` metrics; SLO compliance
  visible at a glance.
- Error budget burn-rate alerts wired into Charter 23 Epic 04 (paging).
- Monthly SLO compliance report scheduled.

## Proposed SLOs

### apps/web

- **Availability**: 99.9% over 30 days. Eligible requests: HTTP 200/300/4xx
  (excluding 5xx) over total requests with `path != /health`.
- **Latency**: p95 < 800ms for HTML routes, p95 < 200ms for API
  proxy routes.

### apps/api

- **Availability**: 99.95% over 30 days. POST /generate available
  excluding billing-rejection 402s.
- **Latency**: p95 generation start (POST /generate response time
  excluding the SSE stream itself) < 500ms.
- **Stream durability**: 95% of started SSE streams reach a `done`
  or `error` event (i.e., do not silently disconnect).

### apps/worker

- **Workflow completion rate**: 99% of started workflows complete
  within their soft deadline (30s for tick-only, 3 min for full
  generation).
- **Activity success rate**: 99.5% of activities succeed (after retries).

### apps/ml

- **Availability**: 99.5% over 30 days.
- **Latency**: p95 inference < 800ms for span extraction; < 1.5s for
  discourse classification; < 3s for embedding batch.

## Stories

### Story 1.1 — Decide budgets
For each SLO, decide the error budget over 30 days. (E.g. 99.9%
availability = 43 minutes downtime/month.)

**Acceptance:** Budget table in `docs/sre/slos.md`.

### Story 1.2 — Grafana dashboard
Build dashboards for each service: SLI (the indicator), SLO (the
target line), error-budget remaining (green / yellow / red).

**Acceptance:** Dashboard URL published in `docs/sre/slos.md`.

### Story 1.3 — Burn-rate alerts
Configure fast-burn (1h, 14.4× budget consumption) and slow-burn (6h,
6× budget) alerts that page on-call (Charter 23 Epic 04).

**Acceptance:** Test alert fires on a synthetic spike; on-call confirms
receipt.

### Story 1.4 — Monthly compliance report
Auto-generated report posted to #engineering Slack on the 1st of
each month: per-SLO compliance, biggest budget burns, top failure
modes.

**Acceptance:** First report posted; team reviews and adjusts budgets
if any are unrealistic.

## Tasks

- [ ] 1.1.1 Author `docs/sre/slos.md`.
- [ ] 1.2.1 Provision Grafana (Grafana Cloud free tier acceptable for
      starting).
- [ ] 1.2.2 Wire `retune_*` metrics from `apps/api/src/lib/metrics.ts`
      into Prometheus exporter / Grafana Cloud agent.
- [ ] 1.2.3 Build dashboards.
- [ ] 1.3.1 Implement burn-rate alert rules.
- [ ] 1.4.1 Write the report-generator script.

## Dependencies

- Charter 05 Epic 04 (Prometheus metrics) — landed.
- Grafana Cloud or self-hosted Grafana.

## Estimated effort

~3 working days.
