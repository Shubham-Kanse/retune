# ADR-006 — Generation Runtime: Temporal in Production, In-Memory Dev-Only

**Status**: Accepted
**Date**: 2026-05-23
**Owner**: Platform engineering
**Charter**: 04-Resilience, 02-Core-Features

## Context

A single resume generation runs the orchestrator for ~10-30 ticks (~30-90 seconds wall clock). Each tick mutates the blackboard and writes an audit row. The naive runtime is "in-process: hold the blackboard in memory; stream events over SSE; persist final state on completion."

Failure modes of the naive runtime:

1. **Process restart** (deploy, OOM, crash) loses every in-flight generation. The user gets a hung SSE stream and no resume.
2. **Multi-instance scaling** breaks: an SSE reconnect routed to a different instance returns 404 because that instance doesn't have the bus.
3. **No retry / no scheduling**. Cron jobs (nightly consolidator, etc.) end up in `apps/api` rather than a dedicated worker, polluting the API's responsibility surface.

## Decision

Production **MUST** run with `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres`. The in-memory + persistence-off runtime is **dev-only**, enforced by `assertProductionRuntime()` in `apps/api/src/main.ts` at boot.

Production topology:

- `apps/api` is a stateless HTTP service. It receives `POST /generate`, starts a Temporal workflow, and exits. Subsequent reads (`GET /generate/:id`, SSE stream, document download) hit Postgres + the trace bus that lives in `apps/api`'s memory only as a hot cache.
- `apps/worker` runs the Temporal worker. Workflow code in `packages/agent/src/temporal/` invokes activities that build the substrate (`build_fresh_substrate` / `build_resumed_substrate`) and run ticks.
- The blackboard is persisted at every tick via `PostgresPersistence`. `extended_persistence` writes GDPR packets and conflicts to durable rows so the audit screen survives any restart.
- Cron lives in the worker, not in `apps/api`.

Dev topology stays simple: `RETUNE_TEMPORAL=0` (default) keeps the in-memory runtime in `apps/api/src/runtime/workbench-runtime.ts` so contributors don't need a Temporal cluster on their laptops.

## Consequences

**Positive**:

- Survives any single-process failure. A production restart picks the workflow back up where it stopped.
- Multi-instance scales horizontally — the workflow ID is the routing key, not the bus.
- The bus retention (`busRetentionMs(persistenceEnabled)` in `generation-lifecycle.ts`) is intentionally short (10 min) when persistence is on, because the DB is authoritative. With persistence off, retention extends to 24 h to make the dev experience tolerable.
- Document downloads can hydrate from the DB-stored blackboard for the GDPR retention window (30 days, governed by Charter 08).

**Negative**:

- Dev parity gap: a contributor running with `RETUNE_TEMPORAL=0` may not catch a workflow-shape bug. Mitigated by `apps/api/tests/temporal-paths.test.ts` exercising the Temporal seeding path, plus `packages/agent/tests/temporal-workflow.test.ts` running the workflow itself in time-skipped tests.
- Two paths to maintain. We tax this by: (a) the workflow code lives in `packages/agent/src/temporal/`, so the substrate construction is shared between modes; (b) integration tests cover both.

## Wire-Up Notes

- `assertProductionRuntime()` validates BEFORE the Hono app is constructed, so a misconfigured deploy fails the health check immediately rather than serving requests in a degraded state.
- SSE Last-Event-ID resumption (Charter 04 Epic 02) is wired in both runtimes.
- Circuit breakers (Charter 04 Epic 03) wrap LLM (via concurrency manager + provider retry), ML (per-MLClient instance), and Jina (module-level) regardless of which runtime is active.

## Alternatives Considered

- **Always in-memory**: rejected. Cannot survive restarts; cannot scale.
- **Always Temporal**: rejected for dev. Forcing every contributor to run a Temporal cluster locally is a 30-min-per-day tax we won't pay.
- **Postgres `LISTEN/NOTIFY` + custom workflow**: tempting because the dependency surface is smaller, but reinvents Temporal's signal/timer/retry machinery. We've all worked at companies that built half a Temporal and regretted it.
- **AWS Step Functions / Cloudflare Workflows**: lock-in tax we don't want today; reconsider if we ever standardise on one cloud.

## References

- `apps/api/src/main.ts` (`assertProductionRuntime`)
- `apps/api/src/runtime/workbench-runtime.ts` (in-memory runtime — dev only)
- `apps/worker/src/main.ts`
- `packages/agent/src/temporal/`
- `packages/agent/src/temporal/activities/substrate.ts`
- `docs/charters/04-resilience/README.md`
- `docs/charters/02-core-features/README.md` Epic 02
