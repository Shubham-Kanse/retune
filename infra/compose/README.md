# `infra/compose/dev.yml`

Local-development stack for the cognitive workbench rebuild.

## Services

| Service | Port | Purpose |
|---|---|---|
| `postgres` (pgvector/pg16) | 5432 | Episodic memory + structured store. **Source of truth from commit #2.** |
| `redis` (7-alpine) | 6379 | Hot cache, rate-limit token buckets, Temporal backing |
| `temporal` (1.25.2) | 7233 (gRPC), 8233 (Web UI) | Durable workflow engine |
| `ml-service` (apps/ml) | 8000 | Python FastAPI ML compute layer |

## Quick start

```sh
docker compose -f infra/compose/dev.yml up
```

Then:

```sh
curl http://localhost:8000/health
curl -X POST http://localhost:8000/embed \
  -H 'content-type: application/json' \
  -d '{"texts":["hello"],"model":"bge-large-en-v1.5"}'

# Postgres
psql postgresql://retune:retune@localhost:5432/retune -c 'select 1;'

# Temporal Web UI
open http://localhost:8233
```

## Reset everything

```sh
docker compose -f infra/compose/dev.yml down -v
```

## Relationship to the root `docker-compose.yml`

The root `docker-compose.yml` is the **production deploy artifact** for
the existing SQLite-backed product. It remains untouched by commit #1.
The Postgres-mirror migration ships in commit #2.
