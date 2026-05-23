# Charter 04 — Resilience & Reliability

## Purpose

Retune's generation pipeline currently runs in-memory on a single API server process. If the process restarts mid-generation, the generation is permanently lost. SSE streams have no reconnection support, and external service calls (AI providers, ML service) have no failure isolation. This charter addresses all three gaps.

## Current State

| Component | Risk |
|-----------|------|
| `workbench-runtime.ts` (in-memory fallback) | Generation lost on process restart |
| SSE stream (`stream.ts`) | No `Last-Event-ID`, no reconnection |
| SSE client (`stream-client.ts`) | No reconnection logic |
| AI provider calls | No circuit breaker; one provider outage blocks all generations |
| `_ml_reachable` flag | Set once, never re-probed |
| `TraceBusRegistry` | No TTL; memory leak on long-running servers |

## Epics

| # | Epic | Outcome |
|---|------|---------|
| 01 | [Temporal Production Activation](./epic-01-temporal-production.md) | Generations survive API restarts via durable workflows; production hard-requires `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres` (co-owned with Charter 02-Core-Features Epic 02) |
| 02 | [SSE Reconnection](./epic-02-sse-reconnection.md) | Clients auto-reconnect; **architect addendum:** server must parse `Last-Event-ID` header on reconnect and replay only events with `seq > Last-Event-ID` (today the bus replays the entire `replay_log` from the start, double-delivering early ticks) |
| 03 | [Circuit Breakers](./epic-03-circuit-breakers.md) | External failures isolated; **architect addendum:** wrap THREE clients independently — AI provider, ML client (`packages/agent/src/ml-client/`), and Jina (`apps/api/src/runtime/workbench-runtime.ts:289`) — three breakers with distinct thresholds |
| 04 | (NEW) TraceBus durability | Replace in-process `TraceBusRegistry` (`apps/api/src/lib/trace-bus.ts`) with Redis Streams or Postgres `LISTEN/NOTIFY` so SSE survives multi-instance horizontal scaling. Today, an API replica receiving an SSE reconnect for a generation that was started on a different replica returns 404 (no bus). The intern's charter doesn't actually solve the multi-instance case. |

## Success Metrics

- Zero lost generations due to API process restarts
- SSE clients recover from disconnects within 5 seconds (p95)
- AI provider outage does not cascade to unrelated generations
- TraceBusRegistry memory stays bounded regardless of server uptime

## Dependencies

- Temporal Cloud account (or self-hosted Temporal for staging)
- Vercel or Railway deployment slot for `apps/worker`
- No new npm dependencies required for circuit breaker (pure implementation)

## Risks

| Risk | Mitigation |
|------|------------|
| Temporal Cloud latency adds generation overhead | Benchmark; keep in-memory fallback behind feature flag |
| Ring buffer size (100 events) insufficient for slow clients | Monitor; make configurable via env var |
| Circuit breaker threshold too aggressive | Start conservative (5 failures / 60s timeout); tune with metrics |
