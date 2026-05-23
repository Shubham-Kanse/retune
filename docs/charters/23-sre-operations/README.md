# Charter 23 — SRE Operations

**Priority:** P0 for production launch
**Owner:** Platform engineering + on-call rotation
**Status:** Scoped (2026-05-23). Operational with code touchpoints.

## Mission

Operate Retune like a production service: documented SLOs, named
on-call, paging that catches real problems, runbooks for the top 10
incidents, and a measurable mean-time-to-recovery.

## Why this is its own charter

Charter 04 (resilience) makes the system *technically* recoverable;
this charter makes it *operationally* recoverable. The difference:
Charter 04 ensures a process restart doesn't lose data; Charter 23
ensures a human knows it happened and what to do.

## Current state

| Asset | State |
|-------|-------|
| SLOs | None defined. |
| On-call rotation | None. |
| Paging | None. |
| Runbooks | None. |
| Status page | None. |
| Postmortem template | None. |
| Error budget tracking | None. |

This is greenfield operationally. The good news: Charter 05
(observability) ships the data we need (structured logs + Sentry +
Prometheus metrics + audit trail).

## Epics

| # | Title | Description |
|---|-------|-------------|
| 01 | SLO definition | Per-service SLO for: web (request availability + p95 latency), api (request availability + p95 generation start latency), worker (workflow completion rate), ml (request availability + p95 inference latency). |
| 02 | Error budget tracking | Grafana dashboards driven by the Prometheus metrics from Charter 05 E4. Burn-rate alerts. |
| 03 | On-call rotation | PagerDuty / OpsGenie / Grafana On-Call schedule. Primary + secondary, weekly rotation, EU + US time zones once team grows. |
| 04 | Paging integration | Sentry critical errors page. Synthetic check failures page. SLO burn-rate (fast burn) pages. |
| 05 | Runbook library | Top 10 incidents: provider outage (Anthropic / OpenAI), Stripe webhook failure, Temporal worker crash, ML service oom, Postgres connection exhaustion, RLS misconfig, deploy rollback, secret rotation incident, browser-side error spike, generation timeout cascade. Each: detection signal, mitigation, root-cause investigation, postmortem trigger. |
| 06 | Status page | Public status page (statuspage.io / instatus / self-hosted) reflecting SLO state. |
| 07 | Postmortem culture | Blameless postmortem template + monthly review meeting. |
| 08 | Synthetic checks | Pingdom / Checkly / Grafana Synthetic against the critical user paths: homepage load, login, generation kickoff. |

## Success metrics

- All four services have published SLOs with monthly compliance
  reports.
- Mean time to acknowledge (MTTA) page < 5 min.
- Mean time to recover (MTTR) for top-10 incidents < 1 hour.
- Postmortems published within 5 business days of any P0/P1
  incident.
- Status page uptime ≥ 99.95%.

## Dependencies

- Charter 05 / E4 (Prometheus metrics) — done.
- Charter 04 / E1 (Temporal in production) — done.
- Charter 06 / E5 (real deploy) — required so we know what to monitor.

## Out of scope

- Cost optimisation engineering — separate charter.
- DR testing (failover drills, restore-from-backup drills) — schedule
  quarterly once SLOs are live.

## Owner

Platform engineering. On-call rotation across the eng team once it
grows past 3 engineers; today the founder is implicitly on-call 24/7.
