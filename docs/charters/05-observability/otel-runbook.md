# OpenTelemetry Runbook

> Charter 05 — Observability. How to wire Retune's traces + metrics into a real backend.

## What's in the box

- `apps/api/src/lib/otel.ts` initialises the Node SDK (`@opentelemetry/sdk-node`) with
  auto-instrumentations on. The SDK is **only started** when `OTEL_EXPORTER_OTLP_ENDPOINT` is set,
  so leaving the env unset is the supported "off" mode for local dev and tests.
- `apps/api/src/main.ts` calls `await initOTel()` once before the HTTP server starts and
  `await shutdownOTel()` from the SIGTERM/SIGINT handlers so traces flush cleanly on rolling deploys.
- Prometheus metrics live at `GET /metrics` (Charter 05 Epic 03). Counter/gauge/histogram registry
  + 7 default metrics. Pull-mode; works behind any Prometheus-compatible scraper (Grafana Mimir,
  VictoriaMetrics, native Prometheus).
- TraceBus (orchestrator span fan-out) has a Redis adapter behind `RETUNE_TRACE_BUS=redis` for
  multi-pod deployments.

## Required env to enable export

```bash
# OTLP/HTTP. Most managed backends (Honeycomb, Grafana Cloud, Datadog, New Relic) accept this.
export OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
export OTEL_EXPORTER_OTLP_HEADERS="x-honeycomb-team=<api-key>"

# Service identity — used as the `service.name` resource attribute.
export OTEL_SERVICE_NAME=retune-api
export OTEL_RESOURCE_ATTRIBUTES="deployment.environment=production,service.version=$(git rev-parse --short HEAD)"

# Optional: sample 10% in prod to control cost. Default is always_on.
export OTEL_TRACES_SAMPLER=parentbased_traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1
```

## Validating that traces actually reach the backend

1. Set the env vars above on a single api pod.
2. Send 10 sample requests:
   ```bash
   for i in $(seq 1 10); do curl -s "https://<api-host>/health" >/dev/null; done
   ```
3. In your backend's trace explorer, filter on `service.name=retune-api` and you should see 10
   `GET /health` spans within ~30s. If nothing arrives, check:
   - `OTEL_EXPORTER_OTLP_ENDPOINT` resolves from inside the pod (no DNS/firewall block).
   - `OTEL_EXPORTER_OTLP_HEADERS` is correctly url-encoded if any value contains `,` or `=`.
   - Pod logs include `event=otel.bootstrap` at startup. If they don't, the env var was missing
     when the process started — `initOTel()` short-circuits when unset.

## Validating metrics

1. Hit the metrics endpoint:
   ```bash
   curl -s https://<api-host>/metrics | head -30
   ```
   You should see `retune_*` series and the default Node process metrics.
2. Confirm the scrape config in your Prometheus / Grafana Agent / VictoriaMetrics targets `/metrics`
   on the api service at a 30s scrape interval.

## Sampling guidance

- **Local dev**: leave OTel off. Console logs + the existing TraceBus UI at `/retune-lens` are
  enough.
- **Staging**: 100% sampling so we catch every regression.
- **Production**: 10% head-based ratio is the starting point. Drop to 1% if span volume costs are
  prohibitive; pair with tail-based sampling at the collector layer to keep the slow / errored
  spans regardless of head ratio.

## Cardinality budget

- `service.name`, `deployment.environment`, `service.version` are unbounded over time and rotate
  on every deploy. Keep all other resource attributes bounded.
- HTTP route templates (`GET /v1/generate/{id}`) are auto-derived by the Hono auto-instrumentation
  and ARE bounded. Per-id paths are NOT — if you spot `/v1/generate/00000000-...` in your trace
  list, the route templating broke; file an issue.

## Common failure modes

| Symptom                                            | Cause                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| No traces, no error                                | `OTEL_EXPORTER_OTLP_ENDPOINT` not set at process start                             |
| Traces arrive but no metrics                       | Backend doesn't accept OTLP metrics — switch to the dedicated Prometheus endpoint  |
| `OTLPExporterError 401`                            | API key header not set or expired                                                  |
| Spans truncate after deploy                        | SIGTERM grace period too short for `shutdownOTel()` — bump to ≥ 30s                |
| High cardinality alert                             | An unparameterised route is producing one span template per id; check route order  |

## Charter cross-references

- Charter 05 Epic 01 — Sentry setup. OTel + Sentry coexist; Sentry handles error grouping, OTel
  handles distributed tracing.
- Charter 05 Epic 03 — Prometheus metrics. The `/metrics` endpoint is independent of OTel; you can
  run either or both.
- Charter 04 Epic 02 — Circuit breakers. Each circuit-breaker open/close transition emits a trace
  event tagged `retune.circuit_breaker.transition`.
