# Charter 05 — Observability & Monitoring

## Purpose

Establish production-grade observability across the Retune platform so that engineers can diagnose failures in seconds, trace requests end-to-end, and receive proactive alerts when the system degrades.

## Current State

| Area | Status |
|------|--------|
| Logging (apps/api) | `console.log` / `console.error` with string interpolation. No structure, no levels, no correlation. |
| Logging (apps/ml) | Python `print` / default logging. No JSON output. |
| Logging (apps/worker) | None. |
| Distributed Tracing | No OpenTelemetry, no trace context propagation between services. |
| Error Tracking | `apps/web/src/lib/error-tracker.ts` is a 1516-byte stub that calls `console.log`. `global-error.tsx` reports to nothing. No Sentry, no Datadog. |
| Correlation IDs | None between apps/web → apps/api → packages/agent. |

## Target State

1. **Structured JSON logging** in every service with consistent fields (`level`, `time`, `service`, `requestId`, `userId`, `msg`).
2. **Distributed tracing** via OpenTelemetry with automatic and manual instrumentation, trace context propagated across all service boundaries.
3. **Error tracking** via Sentry with source maps, user context, and breadcrumbs in both apps/web and apps/api.

## Epics

| # | Epic | Scope |
|---|------|-------|
| 01 | [Structured Logging](./epic-01-structured-logging.md) | pino in apps/api+worker, structlog in apps/ml, request-id middleware (`x-request-id` header convention propagated across all four services) |
| 02 | [Distributed Tracing](./epic-02-distributed-tracing.md) | OpenTelemetry SDK, auto-instrumentation, manual span around `Orchestrator.run()` in `packages/agent/src/workbench/orchestrator.ts` so each tick is a span; context propagated into MLClient HTTP+gRPC calls |
| 03 | [Error Tracking](./epic-03-error-tracking.md) | Sentry in apps/web (Next.js SDK + sourcemap upload in CI) and apps/api (Sentry Node), replace `apps/web/src/lib/error-tracker.ts` stub |
| 04 | (NEW) Metrics + dashboards | Prometheus-format `/metrics` endpoint on apps/api and apps/worker, exposing tick latency histogram, generation outcome counter, LLM cost counter, ML latency histogram, Temporal queue depth. The Lighthouse "performance gate" job in `.github/workflows/cognitive-cycle.yml` is structural-only — without runtime metrics there is no production alerting. Coordinates with Charter 11 Epic 03 (Lighthouse blocking) but addresses the runtime side, not build-time. |

## Success Metrics

- 100% of API requests produce a structured JSON log line with `requestId`.
- Any request can be traced from apps/web → apps/api → packages/agent with a single trace ID.
- Unhandled exceptions in apps/web and apps/api appear in Sentry within 5 seconds.
- Mean time to diagnose production issues drops below 5 minutes.

## Dependencies

- `pino` (Node.js structured logging)
- `structlog` (Python structured logging)
- `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`
- `@sentry/nextjs`, `@sentry/node`

## Environment Variables Introduced

| Variable | Service | Purpose |
|----------|---------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | apps/api, apps/worker | OTLP collector endpoint |
| `OTEL_SERVICE_NAME` | apps/api, apps/worker | Service name for traces |
| `SENTRY_DSN` | apps/web, apps/api | Sentry project DSN |
| `SENTRY_AUTH_TOKEN` | CI/CD | Source map upload token |

## Owner

Platform Engineering

## Timeline

Target: 3 sprints (6 weeks)
- Sprint 1: Epic 01 (Structured Logging)
- Sprint 2: Epic 02 (Distributed Tracing)
- Sprint 3: Epic 03 (Error Tracking)
