# Developer Onboarding

Welcome to Retune. This guide gets you from zero to a running dev environment and explains the key architectural decisions you'll encounter on day one.

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 22+ | [nvm](https://github.com/nvm-sh/nvm) or [Volta](https://volta.sh) |
| pnpm | 10+ | `npm install -g pnpm` |
| Docker | any recent | [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| Python | 3.11+ | [pyenv](https://github.com/pyenv/pyenv) |

## One-command setup

```bash
git clone <repo>
cd retune
./scripts/setup.sh
```

The script handles: dependency install, `.env` bootstrap, Docker infra (Postgres, Redis, Temporal), DB migrations, and startup self-checks. See the script header for skip flags (`SKIP_DOCKER=1`, `SKIP_MIGRATE=1`, etc.).

## Manual setup (if you prefer)

```bash
pnpm install
cp .env.example .env          # fill in real values
pnpm db:up                    # start Postgres via Docker
pnpm db:migrate               # run Drizzle migrations
pnpm dev                      # start all apps in watch mode
```

Or run a lighter subset:

```bash
pnpm dev:lite                 # web + api only (no worker, no ml)
```

## Environment variables

Key toggles (see `.env.example` for the full list):

| Variable | Values | Effect |
|----------|--------|--------|
| `AI_PROVIDER` | `anthropic` \| `openai` | Which LLM provider to use |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | your key | Required for live generation |
| `RETUNE_PERSIST` | `pglite` \| `postgres` | DB backend (`pglite` = in-memory, no Docker needed) |
| `RETUNE_DATABASE_URL` | postgres URL | Required when `RETUNE_PERSIST=postgres` |
| `RETUNE_TEMPORAL` | `true` \| `false` | Use Temporal for durable workflows |
| `JWT_SECRET` | 32+ char string | Auth token signing |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Auth |

For local dev without Supabase, set `E2E_AUTH_BYPASS=1` (bypasses auth middleware in test mode).

## Repo structure

```
apps/
  web/        Next.js 15 — UI + API proxy routes
  api/        Hono — cognitive generation endpoints (/generate/*)
  worker/     Temporal worker — durable workflow activities
  ml/         FastAPI + gRPC — embeddings, span extraction, discourse

packages/
  agent/      Core cognitive runtime (orchestrator, specialists, blackboard)
  db/         Drizzle schema + migrations + PGlite/Postgres adapters
  types/      Shared TypeScript contracts
  eval/       Evaluation harness (canonical + adversarial corpus)
  ui/         Shared React components + design tokens
  auth/       Supabase auth helpers
  billing/    Stripe billing helpers
  proto/      gRPC protobuf definitions + generated stubs
```

## How a generation works

1. User pastes a job description in `apps/web`.
2. `apps/web` proxies to `apps/api` (`POST /generate`).
3. `apps/api` starts either:
   - **Temporal path** (when `RETUNE_TEMPORAL=true`): durable workflow via `apps/worker`.
   - **In-memory path** (default): `run_cognitive_pipeline()` in `packages/agent`.
4. The cognitive pipeline runs ~22 specialists over a shared blackboard.
5. `apps/api` streams trace events over SSE (`GET /generate/:id/stream`).
6. `apps/web` renders the live trace and final result.

The authoritative runtime is `packages/agent/src/workbench-runner.ts`. The specialist registry is in `packages/agent/src/specialists/`.

## Running tests

```bash
pnpm test                     # all packages
pnpm --filter @retune/agent test   # agent unit tests (218 tests)
pnpm --filter @retune/web test     # web vitest
pnpm --filter @retune/eval test    # eval harness
```

For the adversarial corpus structural validation:

```bash
pnpm --filter @retune/eval eval:adversarial
```

## Linting and formatting

```bash
pnpm lint                     # Biome check (all packages)
pnpm lint --write             # auto-fix
```

The project uses [Biome](https://biomejs.dev) for both linting and formatting. No Prettier or ESLint.

## Database

```bash
pnpm db:migrate               # apply pending migrations
pnpm db:generate              # generate migration from schema changes
pnpm db:studio                # open Drizzle Studio (visual DB browser)
```

Schema lives in `packages/db/src/schema.ts`. Migrations in `packages/db/migrations/`.

To use PGlite (no Docker required):

```bash
RETUNE_PERSIST=pglite pnpm dev:lite
```

## Adding a specialist

1. Create `packages/agent/src/specialists/my-specialist.ts` implementing `Specialist`.
2. Add a prompt `.md` file at `packages/agent/src/specialists/prompts/my-specialist.system.md`.
3. Register the prompt in `packages/agent/src/prompts/bootstrap.ts`.
4. Register the specialist in `packages/agent/src/workbench-runner.ts` (and `temporal/activities/substrate.ts` for the Temporal path).
5. Add tests in `packages/agent/tests/`.

See `packages/agent/src/specialists/narrator.ts` for a minimal example.

## Prompt registry

All LLM prompts live in `packages/agent/src/specialists/prompts/*.md`. The format is:

```markdown
---
name: my-specialist.system
version: 1
model_hint: smart
---

Your prompt body here. Use {{variable}} for runtime substitution.
```

Load with `getPrompt("my-specialist.system")` or render with `renderPrompt("my-specialist.system", { variable: "value" })`.

## Reproducing a bug

Use the repro script to capture a minimal reproduction:

```bash
./scripts/repro-issue.sh <issue-number>
```

This captures: Node/pnpm/Python versions, env var presence (not values), recent git log, and TypeScript diagnostics into a `repro-<issue>.txt` file you can attach to the issue.

## Key docs

- Architecture decisions: `docs/adr/`
- Charter specs: `docs/charters/`
- Design system: `docs/design-system.md`
- i18n architecture: `docs/i18n-architecture.md`
- Billing operations: `docs/billing-operations.md`
