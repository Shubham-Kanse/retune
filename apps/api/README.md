# @retune/api

Edge-style HTTP API for the cognitive workbench. Hono on Node.js (swappable
to Bun / workerd later — the route code is runtime-agnostic).

## Status (commit #2)

- `GET  /health` — liveness + build info
- `POST /generate` — start a generation; returns a `generation_id`
- `GET  /generate/:id/stream` — **SSE** stream of reasoning-trace events
  (one per orchestrator tick). Emits `trace`, `done`, and `error` events.

The generation implementation for commit #2 is deliberately in-memory —
no database persistence yet. Calls spin up a fresh `Orchestrator` per
request, register the two comprehension specialists, and run until the
goal stack drains. This is enough to demo the substrate; commit #3
swaps the in-memory runtime for a Temporal-backed durable workflow.

## Run

```sh
pnpm --filter @retune/api dev        # watch mode
pnpm --filter @retune/api start      # one-shot
```

Default port: `8787` (override with `PORT`).

## Try it

```sh
# Start a generation
curl -s -X POST http://localhost:8787/generate \
  -H 'content-type: application/json' \
  -d '{"jd_title":"Senior Software Engineer","company":"Stripe"}'

# Stream the trace (in another terminal, substitute the id)
curl -N http://localhost:8787/generate/<id>/stream
```

## Why SSE, not WebSocket

The trace is one-way server→client. SSE gives us auto-reconnect, proxy
compatibility, and a trivial `EventSource` client — at the cost of
nothing we need two-way for.
