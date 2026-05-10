# Retune Repository Exhaustive Map

Last updated: 2026-05-10

## Scope and Method

This document maps the product by statically reviewing repository source code and architecture docs, with focus on active code paths for:

- High-level architecture (HLA)
- Cognitive generation pipeline
- Onboarding and profile lifecycle
- Resume/document generation and delivery
- Persistence, SSE, Temporal, ML integration
- Package-by-package responsibilities

Large generated and binary artifacts (database files, `node_modules`, pglite pages, pyc caches) are excluded from semantic mapping because they are runtime/generated data, not source logic.

## 1. High-Level Architecture (HLA)

## 1.1 Process Topology

- `apps/web` (Next.js): user-facing product + authenticated API routes/proxies.
- `apps/api` (Hono): generation control plane and result/stream endpoints.
- `apps/worker` (Temporal worker): durable workflow execution.
- `apps/ml` (FastAPI + optional gRPC): embeddings, discourse classification, span extraction.
- `packages/agent`: cognitive substrate (blackboard, specialists, orchestrator, persistence adapters).
- `packages/db`: schema + db clients for Postgres/PGlite.

Canonical runtime flow:

1. User initiates generation from web app.
2. Web route proxies to `apps/api` `POST /generate`.
3. API starts Temporal workflow when configured, else in-memory workbench.
4. Agent specialists execute against shared blackboard.
5. Trace emits over SSE (`/generate/:id/stream`).
6. Final blackboard/result read through `/generate/:id` and rendered/downloaded documents.

## 1.2 Durable vs In-Memory Paths

- Durable path: Temporal workflow (`runGenerationWorkflow`) + DB-backed persistence.
- Fallback path: in-process `run_generation()` in API using `TraceBus` and registry.
- Web app remains compatible with both by proxying stream/result endpoints and syncing legacy `applications` rows.

## 2. Monorepo Structure and Responsibilities

## 2.1 `apps/`

- `apps/web`
- `apps/api`
- `apps/worker`
- `apps/ml`

## 2.2 `packages/`

- `agent`: cognitive engine, specialists, temporal integrations
- `db`: schema, migrations, db adapters
- `types`: shared domain/cognitive type contracts
- `auth`: auth primitives
- `billing`: usage/accounting support
- `eval`: evaluation harness + metrics
- `proto`: protobuf/gRPC contracts
- `onto`: ontology/runtime helpers
- `ui`: shared UI/cognitive components
- `scripts`: Python utilities (`generate_resume.py`, `ats_score.py`, `validate_docx.py`)

## 3. Cognitive Generation: End-to-End Internals

## 3.1 API Entry (`apps/api/src/routes/generate.ts`)

- Validates request payload (`jd_title`, `company`, `jd_text`, `jd_url`, `profile_text`, `market`).
- Mints `generation_id`.
- Chooses runtime:
  - Temporal: seeds user/JD rows and starts `runGenerationWorkflow` on `COGNITIVE_TASK_QUEUE`.
  - In-memory: creates trace bus and calls `run_generation()`.
- Exposes list endpoint for generation summaries and cancel endpoint for in-memory runs.

## 3.2 Workbench Runtime (`apps/api/src/runtime/workbench-runtime.ts`)

- Builds all substrate dependencies (blackboard, goals, scheduler, registry, budget, audit, persistence).
- Optional JD fetch via Jina (`https://r.jina.ai/...`) when URL is supplied.
- Optional ML probing and fallback to stubs.
- Seeds goals via shared `seed_initial_goals()`.
- Registers specialists and listeners.
- Runs orchestrator tick-loop, publishes `trace`/`done`/`error` frames.

## 3.3 Goal Seeding (`packages/agent/src/workbench/seed-goals.ts`)

Goal categories seeded with priorities:

- Comprehension/reflection: `analyze_jd`, `analyze_company`, `extract_spans`, `classify_discourse`, `extract_voice_fingerprint`, `infer_emotional_state`, `calibrate_honesty`
- Strategy/production/decision: `map_gaps`, `solve_evidence`, `propose_arcs`, `select_arc`, `compose_resume`, `compose_cover_letter`, `patch_ats`, `compose_strategy`, `render_documents`, `decide_refuse_or_ship`

Priority ordering forces context-building goals first, then production/decision goals.

## 3.4 Orchestrator Tick Loop (`packages/agent/src/workbench/orchestrator.ts`)

Per tick:

1. Drain staged listener conflicts.
2. Enforce budget.
3. Select next goal.
4. Select specialist candidates via registry + scheduler.
5. Execute specialist.
6. Atomically commit writes/conflicts/new goals + audit entry.
7. Persist tick state when persistence is enabled.

Termination modes include `no_open_work`, `no_competent_specialist`, `no_affordable_specialist`, `budget_exhausted`, `external_abort`, `max_ticks`.

## 3.5 Specialist Surface (`packages/agent/src/specialists/*`)

Implemented specialist modules include:

- comprehension: title/company retrieval, spans, discourse, cultural calibration, credibility
- reflection: voice fingerprint, emotional-state/mood/motivation, honesty
- strategy: gap mapping, evidence solving
- production: bullet composing, cover letter, strategy composition, document rendering, ATS patch
- critique/decision: critic ensemble, theory-of-mind, outcome predictor, refuse-or-ship gate
- cross-cutting monitors/listeners: fairness, voice-drift, well-being

Registry behavior is explicit and deterministic (`SpecialistRegistry`).

## 4. Temporal Durable Workflow

## 4.1 Workflow (`packages/agent/src/temporal/workflows/run-generation.workflow.ts`)

- Runs initial generation activity.
- If pending user input exists, workflow durably waits via signals (`userAnsweredSignal`) and resumes through activities.
- Exposes status query with cumulative ticks/cost.
- Loops until generation no longer requires user answers.

## 4.2 Worker (`apps/worker/src/main.ts`)

- Supports `RETUNE_PERSIST=pglite|postgres`.
- Applies migrations for pglite mode and seeds dev user.
- Connects to Temporal with retry/backoff.
- Graceful SIGINT/SIGTERM shutdown handling.

## 5. Streaming, Results, and Downloads

## 5.1 SSE (`apps/api/src/routes/stream.ts`)

- Endpoint: `GET /generate/:id/stream`.
- Emits:
  - `trace` per tick event
  - `done` final summary (+ generated narrative summary)
  - `error` failures
  - `ping` heartbeat
  - `narrative_paragraph` progressive narrator output

## 5.2 Result Endpoint (`apps/api/src/routes/result.ts`)

- `GET /generate/:id`: hydrates from in-memory final blackboard first, then DB fallback.
- `GET /generate/:id/audit`: exposes trace history for audit UI.
- Document downloads:
  - `/generate/:id/resume.docx|pdf`
  - `/generate/:id/cover_letter.docx|pdf`
- Uses Python-backed renderer via docx helper; returns typed JSON failures on unsupported render states.

## 5.3 Web Proxies

- `apps/web/src/app/api/generate/route.ts`: forwards generation request to API and creates compatibility `applications` row.
- `apps/web/src/app/api/generate/[id]/stream/route.ts`: proxies SSE stream and marks application completed on `event: done`.
- `apps/web/src/app/api/generate/[id]/result/route.ts`: proxies result and syncs local app status/company/role/ATS fields.

## 6. Onboarding and Profile Lifecycle

## 6.1 Resume Upload Onboarding (`apps/web/src/app/api/onboarding/upload/route.ts`)

- Requires session.
- Validates file size/type and file signatures (PDF/DOCX magic bytes).
- Temporarily stores file under user upload dir, extracts text via Python subprocess, deletes temp file.
- Appends extracted content into onboarding conversation state.
- Calls provider-agnostic AI prompt (`profile-builder`) through `@retune/agent/web`.
- Parses structured JSON (when present), computes missing fields, advances stage.

## 6.2 Conversational Onboarding (`apps/web/src/app/api/onboarding/message/route.ts`)

- Accepts user message.
- Loads/creates onboarding conversation.
- Calls provider (`openai`/`anthropic`) with assembled prompt.
- Attempts JSON extraction and profile upsert.
- Computes profile completeness with shared `computeCompletenessScore`.
- Updates user onboarding completion marker.

## 6.3 Deterministic Save (`apps/web/src/app/api/onboarding/save/route.ts`)

- Non-LLM path for saving profile payload directly.
- Computes completeness and upserts profile.
- Marks onboarding complete.

## 7. Resume Generation and Artifact Rendering

## 7.1 Logical Steps in Active Runtime

The active runtime is specialist/goal-driven (not a hardcoded linear script), but operationally covers:

1. ingest JD/profile/company signals
2. classify/extract evidence
3. infer voice/honesty/emotional context
4. map requirement gaps
5. solve evidence allocation
6. propose/select narrative arc
7. compose resume + supplementary artifacts
8. patch ATS and critique outcomes
9. render documents
10. decide refuse/revise/ship + audit packet

## 7.2 Python Tools

Located under `packages/scripts`:

- `generate_resume.py`: markdown-to-docx/pdf pipeline
- `ats_score.py`: JD/resume keyword coverage scoring
- `validate_docx.py`: structural validation

These are invoked by runtime/document subsystems where required.

## 8. Database and Data Model

`packages/db/src/schema.ts` re-exports Postgres schema (`packages/db/src/pg/schema.ts`) as canonical source.

Core entity families visible across code paths:

- users/sessions/auth-related profile state
- profile and onboarding conversation state
- generation/JD/outcome artifacts
- cognitive runtime state (blackboard snapshots, conflicts, audit/GDPR packets)

Migrations are in `packages/db/src/pg/migrations/*`.

## 9. ML Service

`apps/ml/src/retune_ml/main.py`:

- FastAPI app with startup/shutdown lifecycle
- optional co-hosted gRPC server
- routers:
  - `/health`
  - embeddings
  - span extraction
  - discourse classification

Agent runtime can route via HTTP or gRPC transports and fall back to stubs when unreachable.

## 10. Web Product Surface

Major route groups in `apps/web/src/app`:

- public auth/legal pages (`(public)`)
- onboarding route group (`(onboarding)`)
- authenticated app (`(auth)`): dashboard, generation result/audit/outcome/contest pages, profile/settings, brain views
- API route handlers (`src/app/api/*`) for auth, profile, onboarding, generate, refine, files, admin/monitoring

Component groups under `apps/web/src/components` include dashboard, profile editor, pipeline visualizer, cognitive visualizations, results views, settings, and shared UI primitives.

## 11. Package-Level Map

- `packages/agent`: source of truth for cognitive behavior and orchestration
- `packages/db`: source of truth for persistence contracts
- `packages/types`: shared domain types for cross-package compile-time alignment
- `packages/eval`: launch/quality metric machinery and canonical cases
- `packages/ui`: reusable cognitive UI primitives (goal DAG, trace timeline, confidence dial, etc.)
- `packages/onto`: ontology model/runtime helpers
- `packages/proto`: generated protobuf surfaces for ML gRPC

## 12. Known Architecture Notes

- There are legacy docs and prompt assets describing an “8-step sequential agent” model; active runtime now uses a specialist-goal blackboard architecture. Both coexist in repo, but runtime truth is in `apps/api` + `packages/agent`.
- Web layer includes compatibility synchronization with `applications` rows while cognitive runtime tracks richer generation state.
- Both Temporal and in-memory modes are intentionally supported.

## 13. Onboarding for Engineers

1. Install dependencies: `pnpm install`
2. Start infra: `pnpm db:up`
3. Run migrations: `pnpm db:migrate`
4. Run dev apps: `pnpm dev` (or `pnpm dev:lite`)
5. Optional worker: ensure Temporal env vars and run worker
6. Optional ML: run `apps/ml` service for non-stub execution
7. Read these files first:
   - `docs/technical-2.0.md`
   - `apps/api/src/routes/generate.ts`
   - `apps/api/src/runtime/workbench-runtime.ts`
   - `packages/agent/src/workbench/orchestrator.ts`
   - `packages/agent/src/workbench/seed-goals.ts`
   - `packages/agent/src/specialists/*`

## 14. Minute-Detail Checklist by Concern

- Request validation and API contracts: `apps/api/src/routes/*.ts`, `apps/web/src/app/api/*`
- Streaming contract: `apps/api/src/routes/stream.ts` + web proxy route
- Generation state hydration: `apps/api/src/routes/result.ts`
- Goal lifecycle: `packages/agent/src/workbench/goal-stack.ts`, `seed-goals.ts`
- Specialist dispatch: `specialists/registry.ts`, `attention-scheduler.ts`
- Conflict handling: `conflict-staging.ts`, monitor specialists, orchestrator drain path
- Persistence semantics: `packages/agent/src/persistence/*`, db schema/migrations
- Temporal durability: `packages/agent/src/temporal/*`, `apps/worker/src/main.ts`
- Onboarding parsing/extraction: onboarding upload/message/save routes
- Resume/doc rendering: document renderer + python scripts

## 15. Resume Generation, Onboarding, and Product Operation Summary

- Onboarding builds a structured candidate profile (AI-assisted + deterministic save support).
- Generation combines JD/company/profile signals into blackboard hypotheses and drafts.
- Specialists iteratively produce and critique outputs under cost/budget and policy constraints.
- Final result is either ship/revise/refuse with auditable trace and downloadable artifacts.
- System supports user follow-ups (active questions) via Temporal signal/resume loop when needed.

