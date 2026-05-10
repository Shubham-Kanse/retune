# @retune/worker

Temporal worker for the cognitive-cycle workflow family.

> **Required for the v2.0 cognitive cycle in production.** The API has an
> in-process fallback (`RETUNE_TEMPORAL=0`) that runs the orchestrator
> inline — fine for dev and small CI runs but not for production: a server
> restart mid-generation drops in-flight work. The Temporal worker keeps
> generations durable across pod recycles, deploys, and crashes (PRD 2.0
> §7.3 reliability target).

Hosts:
- `runGenerationWorkflow` — the durable outer loop from `@retune/agent`
- The activity implementations (`runGeneration`, `resumeGeneration`, `recordAnswer`)
- The full v2.0 specialist registry: 14 cognitive specialists + 3
  cross-cutting listeners (FairnessMonitor, VoiceDriftMonitor,
  WellBeingMonitor) all wired through `build_fresh_substrate` in
  `packages/agent/src/temporal/activities/substrate.ts`.

## Env

| Var | Default | Purpose |
|---|---|---|
| `RETUNE_TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server gRPC endpoint |
| `RETUNE_TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `RETUNE_PERSIST` | `pglite` | `pglite` (local) or `postgres` |
| `RETUNE_DATABASE_URL` | — | Required when `RETUNE_PERSIST=postgres` |
| `RETUNE_PGLITE_DATADIR` | in-memory | For persistent pglite across restarts |

## Run

```sh
# Start a local Temporal dev-server (optional; production uses real cluster)
docker compose -f infra/compose/dev.yml up temporal

# Start the worker
pnpm --filter @retune/worker dev
```

The worker will log its state transitions (`INITIALIZED` → `RUNNING`) and
poll the task queue for workflow + activity tasks. SIGINT / SIGTERM
triggers a graceful shutdown that drains in-flight activities before
exit.

## Scaling

Horizontal scaling is by worker process count — each worker process
pulls tasks from the shared `retune-cognitive` task queue. Temporal
handles the load balancing and at-least-once delivery.

Per-worker concurrency is tuned with `maxConcurrentWorkflowTaskExecutions`
and `maxConcurrentActivityTaskExecutions`; defaults are appropriate for
dev. Production sizing lands in commit #6 alongside the k8s Helm chart.
