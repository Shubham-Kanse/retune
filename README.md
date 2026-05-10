# Retune

Retune is an AI-assisted job application platform built as a monorepo. It combines a Next.js product UI, a Hono cognitive API, a Temporal worker, an ML service, and a specialist-driven agent runtime to generate resume packages with traceability.

## What This Repo Contains

- `apps/web`: Next.js 15 application (UI + API proxy routes for auth, onboarding, generation, profile, files)
- `apps/api`: Hono service exposing cognitive generation endpoints (`/generate`, `/generate/:id/stream`, `/generate/:id`, `/generate/:id/*`)
- `apps/worker`: Temporal worker process that runs durable workflows and activities
- `apps/ml`: FastAPI + optional gRPC service for embeddings, span extraction, discourse classification
- `packages/agent`: Core cognitive runtime (orchestrator, blackboard, specialists, persistence, temporal glue)
- `packages/db`: Drizzle + Postgres/PGlite schema and database helpers
- `packages/types`: Shared cognitive/data contracts
- `packages/auth`, `packages/billing`, `packages/eval`, `packages/proto`, `packages/ui`, `packages/onto`: supporting packages

## Runtime Topology

1. `apps/web` sends generation requests.
2. `apps/web` proxies to `apps/api`.
3. `apps/api` starts either:
   - Temporal workflow path (`runGenerationWorkflow`) when Temporal is configured, or
   - in-memory workbench runtime fallback.
4. `packages/agent` runs specialists over a shared blackboard.
5. `apps/api` streams trace events over SSE and serves final results/downloads.
6. Persistence is handled by `packages/db` + `packages/agent` persistence adapters.

## Quick Start

### Prerequisites

- Node.js 22+
- `pnpm` 10+
- Docker (recommended for Postgres)
- Python 3.11+ (required for document generation and ML service)

### Install

```bash
pnpm install
```

### Infra + DB

```bash
pnpm db:up
pnpm db:migrate
```

### Run Apps

```bash
pnpm dev
```

Or run selectively:

```bash
pnpm dev:lite
```

## Core Scripts

- `pnpm dev`: run monorepo dev tasks via Turbo
- `pnpm build`: build all packages/apps
- `pnpm test`: run test suites
- `pnpm lint`: run Biome checks
- `pnpm db:migrate`: run DB migrations

## Environment Notes

Key toggles used across runtime:

- `RETUNE_TEMPORAL`, `RETUNE_TEMPORAL_ADDRESS`, `RETUNE_TEMPORAL_NAMESPACE`
- `RETUNE_PERSIST` (`pglite` or `postgres`)
- `RETUNE_DATABASE_URL`
- `AI_PROVIDER` (`anthropic` or `openai`)
- `RETUNE_ML_TRANSPORT`, `RETUNE_ML_BASE_URL`, `RETUNE_ML_GRPC_BASE`

## Full Documentation

- Product requirements: `docs/prd-2.0.md`
- Technical architecture: `docs/technical-2.0.md`
- Exhaustive repo/system map: `docs/REPO_EXHAUSTIVE_MAP.md`

## Current State

This repository contains both:

- the active cognitive substrate path (`packages/agent` + `apps/api` + `apps/worker`), and
- legacy/compatibility surfaces in parts of `apps/web` APIs and UI flows.

The exhaustive map documents where those boundaries exist and which path is authoritative for generation execution.
