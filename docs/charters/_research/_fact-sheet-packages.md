# Code-Grounded Fact Sheet: packages/agent, packages/db, Supporting Packages

> Generated from source code only. No docs consulted. Line references are approximate (±5).

---

## 1. packages/agent — The Cognitive Substrate

### 1.1 Orchestrator

**File:** `src/workbench/orchestrator.ts` (270 lines)

**Stages per tick (lines 100–230):**
1. Check external abort signal
2. Drain listener-staged conflicts from `ConflictStagingQueue`
3. Assert budget alive (throws `BudgetExhaustedError`)
4. Reconcile prerequisites on blocked goals
5. `peek_next()` — highest-priority pending goal with met prerequisites
6. `registry.candidates_for(goal.kind)` → attention scheduler picks winner
7. `invoke_specialist()` — passes frozen blackboard snapshot + composed AbortSignal
8. Atomic commit: audit entry → blackboard.commit() → goal stack push
9. Persist tick (if persistence wired)
10. Fire `on_trace` callback (SSE streaming)
11. Goal bookkeeping: mark satisfied/abandoned

**Termination reasons (line 90):** `no_open_work | no_competent_specialist | no_affordable_specialist | budget_exhausted | external_abort | max_ticks`

**Refuse-or-ship gate location:** NOT in the orchestrator. It's a regular specialist (`src/specialists/refuse-or-ship-gate.ts`, 24.7KB) that handles goal kind `decide_refuse_or_ship` seeded at priority 10 (lowest in the chain). The orchestrator has no special-case logic for it.

**Post-run (lines 230–260):** Calls `persistence.complete_generation()`, writes GDPR packet via `extended_persistence.record_gdpr_packet()`.

### 1.2 Blackboard

**File:** `src/workbench/blackboard.ts` (160 lines)

- **NOT a CRDT.** Plain in-memory object (`Blackboard` from `@retune/types`).
- Writes are immutable path-based patches (`write_path` returns new root).
- `snapshot()` uses `structuredClone()` + `deep_freeze()` — defensive copy per specialist invocation.
- Sequenced: monotonic `seq` counter per write event.
- Events published to `TriggerBus` after each write.
- No snapshotting/versioning within the blackboard itself — that's the persistence layer's job.
- `commit()` is the only mutation path; specialists never mutate directly.

### 1.3 Goal Stack

**File:** `src/workbench/goal-stack.ts` (230 lines)

- Priority-ordered work queue. `peek_next()` returns highest-priority pending goal.
- **Semantic deduplication** via `semantic_key` — prevents duplicate goals from chain re-emission.
- **Prerequisites** via `requires: string[]` — dot-paths checked against blackboard; unmet → `blocked_on_prerequisites`.
- **Max attempts** hard cap (`DEFAULT_GOAL_MAX_ATTEMPTS` from `@retune/types`).
- `reconcile_prerequisites()` called by orchestrator each tick to unblock goals whose deps appeared.
- `hydrate()` for deserialization/replay.

### 1.4 Seed Goals

**File:** `src/workbench/seed-goals.ts` (180 lines)

Shared between in-memory and Temporal paths. Seeds ~18 goals in two layers:
- **Comprehension (priority 90–55):** `hydrate_candidate_memory`, `build_candidate_model`, `plan_proof_questions`, `generate_draft_variants`, `analyze_jd`, `analyze_company`, `extract_spans` (×2), `classify_discourse`, `build_job_model`, `research_company_context`, `extract_voice_fingerprint`, `infer_emotional_state`, `calibrate_honesty`
- **Production (priority 40–10):** `map_gaps` → `solve_evidence` → `propose_arcs` → `select_arc` → `compose_resume` → `compose_cover_letter` / `patch_ats` / `compose_strategy` (all 18) → `render_documents` → `verify_render_integrity` → `decide_refuse_or_ship`

### 1.5 Attention Scheduler

**File:** `src/workbench/attention-scheduler.ts` (100 lines)

EV-based ranking: `priority_factor × competence_factor × evoi_factor − cost_penalty`. Filters by budget affordability. Tie-breaks on lower cost, then registration order.

### 1.6 Specialists — Complete List

**Directory:** `src/specialists/` (22 files)

| File | Goal Kind(s) | Calls LLM? | Calls ML? | Status |
|------|-------------|------------|-----------|--------|
| `gap-mapper.ts` (31.7KB) | `map_gaps` | No (deterministic) | No | ACTIVE |
| `evidence-solver.ts` (26.6KB) | `solve_evidence` | No (deterministic) | No | ACTIVE |
| `bullet-composer.ts` (26.4KB) | `compose_resume` | **Yes** | No | ACTIVE |
| `refuse-or-ship-gate.ts` (24.7KB) | `decide_refuse_or_ship` | No (rule-based) | No | ACTIVE |
| `narrative-arc-proposer.ts` (20.5KB) | `propose_arcs`, `select_arc` | **Yes** | No | ACTIVE |
| `critic-ensemble.ts` (20.6KB) | (trigger-based) | **Yes** | No | ACTIVE |
| `outcome-predictor.ts` (17.5KB) | (post-critic) | **Yes** | No | ACTIVE |
| `theory-of-mind.ts` (11.5KB) | (recruiter belief) | **Yes** | No | ACTIVE |
| `cover-letter-composer.ts` (10.2KB) | `compose_cover_letter` | **Yes** | No | ACTIVE |
| `ats-patch-loop.ts` (11.2KB) | `patch_ats` | **Yes** | No | ACTIVE |
| `application-strategy-composer.ts` (11.1KB) | `compose_strategy` | **Yes** | No | ACTIVE |
| `well-being-monitor.ts` (8.3KB) | (listener) | No | No | ACTIVE |
| `fairness-monitor.ts` (8.5KB) | (listener) | No | No | ACTIVE |
| `narrator.ts` (6.8KB) | (narrative) | **Yes** | No | ACTIVE |
| `voice-drift-monitor.ts` (6.6KB) | (listener) | No | No | ACTIVE |
| `emotional-state-modeler.ts` (5.1KB) | `infer_emotional_state` | No | No | ACTIVE |
| `mood-fingerprint.ts` (4.5KB) | (mood) | No | No | ACTIVE |
| `motivation-modulator.ts` (4.3KB) | (motivation) | No | No | ACTIVE |
| `active-question-handler.ts` (4.0KB) | `request_user_input` | No | No | ACTIVE |
| `document-renderer.ts` (3.3KB) | `render_documents` | No | No | ACTIVE |
| `registry.ts` (2.0KB) | — | — | — | INFRA |
| `index.ts` (1.9KB) | — | — | — | BARREL |

**Directory:** `src/generation-sota/` (8 specialist files — SOTA upgrade path)

| File | Goal Kind(s) | Calls LLM? | Status |
|------|-------------|------------|--------|
| `memory/candidate-memory-hydrator.ts` | `hydrate_candidate_memory` | No | ACTIVE |
| `memory/claim-ledger-locker.ts` | `build_candidate_model` | No | ACTIVE |
| `memory/build-candidate-model.ts` (16.7KB) | (helper) | No | ACTIVE |
| `memory/build-claim-ledger.ts` (10.2KB) | (helper) | No | ACTIVE |
| `job/job-model-builder.ts` | `build_job_model` | **Yes** | ACTIVE |
| `job/company-context-researcher.ts` | `research_company_context` | **Yes** (web search) | ACTIVE |
| `interview/proof-gap-interviewer.ts` | `plan_proof_questions` | **Yes** | ACTIVE |
| `drafting/draft-tournament-runner.ts` | `generate_draft_variants` | **Yes** | ACTIVE |
| `render/application-package-renderer.ts` | `verify_render_integrity` | No | ACTIVE |
| `learning/outcome-learning-ranker.ts` | (helper) | No | ACTIVE |

**Comprehension layer:** `src/comprehension/` (8 subdirs)
- `title/` — TitleSchemaRetriever (ontology lookup, no LLM)
- `company/` — CompanySchemaRetriever (ontology lookup, no LLM)
- `spans/` — JdSpanExtractor (**calls ML**), StubJdSpanExtractor (no-op)
- `discourse/` — DiscourseClassifier (**calls ML**), StubDiscourseClassifier (no-op), BoilerplateStripper, CulturalCalibrator (**calls ML**)
- `voice/` — VoiceFingerprintExtractor (**calls LLM**)
- `honesty/` — HonestyCalibrator (deterministic Bayesian update)
- `credibility/` — CredibilityScanner (deterministic)
- `company/` — (part of comprehension)

**No stubs in production path.** Stubs (`StubJdSpanExtractor`, `StubDiscourseClassifier`) are used only in `workbench-runner.ts` (eval/test mode) and when `ml_client` is not provided.

### 1.7 Persistence Adapters

**Directory:** `src/persistence/` (5 files)

| Adapter | File | What it persists |
|---------|------|-----------------|
| `NullPersistence` | `null-persistence.ts` (25 lines) | Nothing. Used in tests and in-memory runtime. |
| `PostgresPersistence` | `postgres-persistence.ts` (350 lines) | Full tick-level durability. Implements both `TickPersistence` + `GenerationReplayLoader`. |

**No PGlite-specific persistence adapter exists.** The `PostgresPersistence` class accepts a `PgDb` union type that covers both `PgliteDatabase` and `PostgresJsDatabase`. PGlite is used as the test harness DB (see `tests/helpers/pglite-harness.ts`).

**What PostgresPersistence persists per tick (single transaction):**
- `blackboard_snapshots` row (generation_id, seq, full JSONB snapshot)
- `audit_entries` row (specialist, cost, latency, writes)
- `goals` upsert (all goals, any status)
- `generations` counter update (ticks_executed, total_cost_usd, total_latency_ms)

**Additional methods on PostgresPersistence:**
- `record_active_question()` — for user-input flow
- `record_extracted_spans()` — bulk insert evidence spans
- `record_voice_fingerprint()` — upsert voice centroid
- `record_honesty_calibration()` — upsert per-claim trust factor
- `record_gdpr_packet()` — Article 22 audit packet
- `record_conflict()` — queryable conflict rows
- `load_voice_fingerprint()`, `load_honesty_calibrations()`, `load_gdpr_packet()` — read paths

**Replay:** `rehydrate_substrate()` in `src/persistence/replay.ts` reconstructs a full Orchestrator from `ReplayedGeneration`.

### 1.8 Temporal Glue

**Directory:** `src/temporal/` (8 files)

**Task queue:** `retune-cognitive` (constant in `task-queue.ts`)

**Workflow:** `run-generation.workflow.ts` (100 lines)
- Phase 1: `runGeneration` activity (seed + orchestrator pass)
- Phase 2+: if `has_pending_user_input`, suspend via `condition()` waiting for `userAnsweredSignal`
- Loops: `recordAnswer` → `resumeGeneration` until no pending input
- Query handler: `getStatusQuery` returns `{status, ticks_executed, total_cost_usd, last_termination}`
- Activity timeout: 5 minutes, 3 retries, exponential backoff

**Activities:** `make-activities.ts` (130 lines)
- `runGeneration(GenerationSeed)` → builds fresh substrate, seeds goals, runs orchestrator
- `resumeGeneration(ResumeInput)` → loads from DB, rehydrates, continues
- `recordAnswer(RecordAnswerInput)` → atomic DB: mark answered, inject answer into parent goal payload, re-open parent

**Substrate builder:** `activities/substrate.ts` (250 lines)
- `build_fresh_substrate()` — wires all specialists, monitors, conflict staging
- `build_resumed_substrate()` — calls `persistence.load()` then `rehydrate_substrate()`
- `SubstrateDeps` = `{db, persistence, ml_client?, spans_sink?}`

**Worker:** `worker.ts` — `build_worker()` creates a Temporal Worker with `workflowsPath` pointing to the workflow file and `activities` from `make_activities()`.

**Client:** `client.ts` — `build_temporal_client()` returns `{client, connection, close}`.

### 1.9 LLM Client Wrapping

**Files:** `src/lib/ai-provider.ts` (interface), `src/lib/provider.ts` (factory), `src/lib/provider-shared.ts` (shared utils), `src/lib/providers/openai/index.ts`, `src/lib/providers/anthropic/index.ts`

**Provider switch:** `AI_PROVIDER` env var. Default: `anthropic`. Factory in `provider.ts` line 30.

**Model env vars:**
- `AGENT_MODEL` → smart tier (default: `gpt-4o` / `claude-sonnet-4-6`)
- `AGENT_MODEL_FAST` → fast tier (default: `gpt-4o-mini` / `claude-haiku-4`)
- `AGENT_MODEL_FRONTIER` → frontier tier (default: `gpt-5` / `claude-opus-4`)

**Interface (`AIProvider`):**
- `createMessage(agent, params)` — basic completion
- `createMessageWithTool<T>(agent, params, toolName)` — forced tool use
- `createStructuredOutput<T>(agent, params)` — Zod schema → typed JSON (003 SOTA)
- `createReasonedOutput<T>(agent, params)` — structured + reasoning effort knob
- `searchWeb(query, opts)` — hosted web search (Anthropic only currently)
- `searchFiles(query, opts)` — hosted file search (OpenAI only)
- `runBackground<T>(agent, params)` — long-running frontier (OpenAI only)
- `drainModelCallTelemetry()` — pop telemetry buffer

**Retry/backoff:** Handled inside each provider implementation (OpenAI SDK has built-in retries; Anthropic provider has manual retry in `anthropic/index.ts`).

**JSON mode:** Via `createStructuredOutput` which uses forced-tool-use fallback (`structuredOutputViaTool` in `provider-shared.ts` line 70). Zod schema → JSON Schema → tool definition → parse response.

**Telemetry:** Per-call `ModelCallTelemetry` records buffered in `provider-shared.ts`, drained by the persistence layer for `generation_model_calls` table (table NOT in schema yet — **MISSING**).

**Legacy shim:** `src/lib/anthropic.ts` normalizes old Anthropic-specific call shapes to the generic interface.

### 1.10 ML Client Wrapping

**Directory:** `src/ml-client/` (7 files)

**Transport interface:** `MLTransport` with `kind: "http" | "grpc"`

**Operations:**
- `health()` — diagnostic
- `embed(EmbedRequest)` — text → vector
- `extract_spans(ExtractSpansRequest)` — JD/resume → typed spans
- `classify_discourse(ClassifyDiscourseRequest)` — sentence-level discourse function labels

**Transports:**
- `HttpTransport` (`http-transport.ts`, 4.5KB) — against `apps/ml` FastAPI
- `GrpcTransport` (`grpc-transport.ts`, 9.9KB) — against gRPC server using `@connectrpc`

**Retry:** `retry-policy.ts` — exponential backoff with cooperative cancellation via AbortSignal. Default: 3 attempts, 500ms initial, 2x backoff.

**Validation:** Every request AND response validated against Zod schemas from `@retune/types/ml`.

**Env vars:** `RETUNE_ML_BASE_URL` (HTTP), `RETUNE_ML_GRPC_BASE` (gRPC), `RETUNE_ML_TRANSPORT` (switch), `RETUNE_ML_USE_STUBS` (skip real calls).

### 1.11 Eval Hooks

No direct eval harness wiring inside `packages/agent`. The eval package (`packages/eval`) imports `run_cognitive_pipeline` from `@retune/agent` and runs it against canonical cases. The agent itself has no eval-specific code paths.

### 1.12 Tests

**Directory:** `tests/` — 43 test files + `integration/` + `provider-parity/` + `helpers/`

Test runner: `tsx --test` (Node.js built-in test runner). **212/212 passing** per context.

Key test files:
- `orchestrator-e2e.test.ts` — full pipeline with mocked specialists
- `refuse-or-ship-gate.test.ts` (17KB) — gate decision matrix
- `full-pipeline-e2e.test.ts` (13.4KB) — end-to-end with real specialist chain
- `memory-consolidation.test.ts` (18.5KB) — nightly consolidator
- `sota-*.test.ts` (7 files) — SOTA generation module tests
- `provider-parity/` (4 files) — cross-provider output equivalence
- `temporal-workflow.test.ts` — Temporal workflow with mocked activities

---

## 2. packages/db

### 2.1 Drizzle Schema

**File:** `src/pg/schema.ts` (600+ lines)

**Tables (31 total):**

| Table | PK | user_id FK? | Key indexes | Notes |
|-------|-----|------------|-------------|-------|
| `users` | uuid | IS the user | `email` unique (where deleted_at IS NULL) | Auth fields consolidated from legacy |
| `jd_clusters` | uuid | No | `canonical_hash` unique | Dedup clusters |
| `jds` | uuid | No | `content_hash`, `cluster_id` | Raw JD storage |
| `generations` | uuid | Yes (cascade) | `user_id`, `jd_id` | Core generation row |
| `blackboard_snapshots` | uuid | No | `(generation_id, seq)` unique | Full JSONB per tick |
| `audit_entries` | uuid | No | `(generation_id, seq)` unique, `specialist` | Per-tick audit |
| `conflicts` | uuid | No | `generation_id` | Queryable conflict rows |
| `goals` | uuid | No | `generation_id`, `status` | Per-generation goal state |
| `active_questions` | uuid | Yes (cascade) | — | User-input flow |
| `evidence_spans` | uuid | Yes (cascade) | `user_id`, `span_type` | Extracted spans |
| `voice_centroids` | user_id (PK) | IS the PK | — | One per user |
| `honesty_calibrations` | uuid | Yes (cascade) | `(user_id, claim_type)` unique | Bayesian trust |
| `emotional_states` | uuid | Yes (cascade) | `(user_id, created_at)`, `generation_id` | VAD model |
| `emotional_state_corrections` | uuid | Yes (cascade) | — | User feedback |
| `mood_fingerprints` | uuid | Yes (cascade) | `(user_id, computed_at)` | Aggregated mood |
| `motivation_modulators` | uuid | Yes (cascade) | `(user_id, claim_type)` unique | Drive levels |
| `documents` | uuid | No | `(generation_id, kind)` unique | Rendered outputs |
| `applications` | uuid | Yes (cascade) | `(user_id, status)`, `(user_id, createdAt)` | Legacy + cognitive |
| `outcomes` | uuid | No | `application_id` | Outcome tracking |
| `gdpr_packets` | generation_id (PK) | Yes (cascade) | `(user_id, created_at)` | Article 22 |
| `case_base_entries` | uuid | No | `opt_in` | pgvector 1536-dim |
| `ontology_versions` | uuid | No | `semver` unique | Version registry |
| `profiles` | uuid | Yes (cascade, unique) | — | Legacy product profile |
| `onboardingSessions` | uuid | Yes (cascade, unique) | — | Onboarding state |
| `onboardingEvents` | uuid | Yes (cascade) | `userId`, `sessionId`, `traceId` | Telemetry |
| `onboardingConversations` | uuid | Yes (cascade) | — | Legacy conversations |
| `resumeIngestions` | uuid | Yes (cascade) | `(userId, contentHash)` unique | File uploads |
| `subscriptions` (billing_subscriptions) | uuid | Yes (cascade, unique) | — | Plan + credits |
| `passwordResetTokens` | uuid | Yes (cascade) | `token` unique | Auth |
| `processorConsents` | uuid | Yes (cascade) | — | GDPR consent |
| `generationPreflights` | uuid | Yes (cascade) | `(userId, jdHash)`, `expiresAt` | Drift detection |
| `generation_requests` | uuid | Yes (cascade) | `(user_id, idempotency_key)` unique, `jd_hash`, `generation_id` | SOTA request envelope |
| `contestLog` | uuid | Yes (cascade) | — | User contests |
| `abTestAssignments` | uuid | Yes (cascade) | `(userId, experimentId)` | A/B tests |
| `usageRecords` | uuid | Yes (cascade) | `(userId, type, createdAt)` | Credit ledger |
| `resume_extraction_audit` | uuid | Yes (cascade) | `(user_id, created_at)` | OWASP A09 |

**RLS:** Schema comment says "unimplemented in schema (commit #4+)". No Postgres RLS policies defined in Drizzle. Supabase migrations handle RLS separately.

**pgvector:** `case_base_entries` uses 1536-dim vectors. `voice_centroids.vector` is JSONB (comment says "moves to pgvector in commit #4" — **NOT DONE**).

### 2.2 Migrations

**Drizzle migrations:** `src/pg/migrations/` — 12 files (0000–0011), sequential SQL.
- Naming: `NNNN_description.sql`
- Applied via `migrator.ts` which reads files and executes raw SQL
- No drizzle-kit journal/snapshot — migrations are hand-written SQL loaded by `loadMigrations()`
- Migrator supports both PGlite and postgres-js targets

**Supabase migrations:** `supabase/migrations/` — 30 files, timestamp-named (`YYYYMMDDHHMMSS_description.sql`)
- **DIVERGENCE:** Supabase migrations are a SEPARATE migration track. They handle RLS policies, auth triggers, cascade fixes, and production-specific DDL that the Drizzle schema doesn't express.
- No automated sync between the two tracks.

### 2.3 Persistence Adapters / Client

**File:** `src/client.ts` (150 lines)

**Switch logic:**
1. `RETUNE_DB_KIND=pglite` → in-process WASM Postgres (no Docker)
2. `RETUNE_DB_KIND=postgres` → postgres-js against `RETUNE_DATABASE_URL`
3. Auto-detect: if `RETUNE_DATABASE_URL` or `DATABASE_URL` set → postgres; else → pglite

**PGlite setup:** `src/pg/client.ts` — `create_pglite()` with `pgcrypto` + `pg_trgm` extensions. Migrations auto-run on first connect.

**Proxy pattern:** `src/client.ts` exports a `db` Proxy that lazily initializes and chains drizzle builder methods through Promise boxing to avoid premature query execution.

### 2.4 Seed Scripts

**File:** `scripts/migrate.ts` (1.1KB) — runs migrations against the configured DB.
**File:** `data/retune.db` (118KB) — appears to be a leftover SQLite file (legacy).

No dedicated seed script for test data. Tests use PGlite with migrations applied fresh.

### 2.5 Tests

**Directory:** `src/__tests__/` — 3 files:
- `client.smoke.test.ts` (4KB) — PGlite client smoke test
- `compute-completeness.test.ts` (3.1KB)
- `application-status.test.ts` (3.5KB)

Test runner: vitest.

---

## 3. Supporting Packages

### 3.1 packages/types

**13 source files.** Zod-first type definitions. Clean subpath exports in `package.json`.

**Key contracts:**
- `blackboard.ts` (8.1KB) — `Blackboard`, `Hypotheses`, `EvidenceGraph`, `DraftState`, `CostBudget`, `AuditEntry`, `BlackboardEvent` schemas
- `goal.ts` (5.6KB) — `Goal`, `GoalKind`, `GoalStatus`, `DEFAULT_GOAL_MAX_ATTEMPTS`
- `conflict.ts` (1.7KB) — `ConflictRecord` schema
- `generation-sota.ts` (41.4KB) — massive file: `CandidateModelV1`, `ClaimLedgerV1`, `JobModelV1`, `CompanyContextV1`, `ProofGapPlanV1`, `DraftVariantV1`, `ApplicationPackageV1`, `OutcomeLearningV1` schemas
- `ml-contracts.ts` (3.8KB) — `EmbedRequest/Response`, `ExtractSpansRequest/Response`, `ClassifyDiscourseRequest/Response`, `MLHealthResponse` schemas
- `evidence.ts` (2.5KB) — `Claim`, `SpanKind`, `EvidenceSpan`
- `confidence.ts` (1.6KB) — `Confidence` (point + interval), `BetaPrior`
- `narrative-arc.ts` (1.2KB) — `NarrativeArcCandidate`
- `voice.ts`, `honesty.ts`, `persona.ts`, `market.ts` — small domain types

### 3.2 packages/auth

**3 source files.** No Supabase SDK dependency.

- `index.ts` — exports `AuthProvider` interface (`signUp`, `signIn`, `verifyToken`), `Session` type
- `local.ts` (3.9KB) — `LocalAuthProvider`: password hashing (likely bcrypt/scrypt), JWT token generation, DB-backed session verification
- `google.ts` (3.5KB) — `GoogleAuthProvider`: OAuth2 flow, token exchange

**No credits/billing logic here.** No JWT refresh. No Supabase Auth SDK — this is a custom auth layer.

### 3.3 packages/billing

**2 source files.** No Stripe SDK.

- `index.ts` (11.3KB) — Full credit-based billing system:
  - Plans: `free` (30 credits), `pro` (500), `max` (1500)
  - Costs: generation = 10 credits, refinement = 1 credit
  - `getSubscription()`, `canGenerate()`, `canRefine()`, `recordUsage()`, `atomicCheckGeneration()`
  - `claimRefinementAttempt()` — rate limiting (8/10min, 3/1min burst)
  - `upgradeToPro()`, `upgradeToMax()` — direct DB updates, **no Stripe integration**
  - In-memory cache with 5-min TTL
- `concurrency-limiter.ts` (1KB) — simple concurrency gate

**RED FLAG:** No Stripe webhooks, no payment processing, no subscription lifecycle. Plan upgrades are raw DB writes. This is a **stub billing system** suitable only for dev/beta.

### 3.4 packages/eval

**7 source files + 1 JSONL dataset + tests.**

- `runner.ts` (17.5KB) — Full eval harness with CLI flags (`--live`, `--mock`, `--record`, `--json`, `--cell-breakdown`, `--agreement-gate`)
- `fixture-provider.ts` (3.8KB) — Caches provider responses for deterministic replay
- `canonical/cases.jsonl` (334KB) — Canonical evaluation dataset
- `canonical/loader.ts` — Zod-validated case loader
- `metrics/` (7 files):
  - `span-f1.ts` — span extraction F1 score
  - `voice-drift.ts` — cosine similarity metric
  - `provenance.ts` — evidence provenance rate
  - `coach-panel.ts` (8KB) — multi-judge scoring panel
  - `launch-criteria.ts` (8KB) — PRD §1.6 launch gate evaluation
  - `sota-artifact-scoring.ts` (6.6KB) — SOTA artifact quality scoring

**Tests:** `tests/` — 4 test files. Meaningful coverage of metrics and runner.

### 3.5 packages/proto

- `proto/ml.proto` (13.5KB) — Full gRPC service definition for ML layer
  - Services: Health, Embed, ExtractSpans, ClassifyDiscourse, DetectContradiction, SimulateReader, ProposeArcs, SolveEvidence, ComposeBullet, Critique, PredictOutcome, AuditFairness, SimulateATS
- `gen/` — Generated TypeScript bindings (buf/connectrpc)
- `buf.gen.yaml` — buf codegen config
- `tests/` — 1 test file

**Note:** Many proto RPCs (DetectContradiction, SimulateReader, ProposeArcs, SolveEvidence, ComposeBullet, Critique, PredictOutcome, AuditFairness, SimulateATS) are defined in proto but **NOT called by any specialist in packages/agent**. The ML client only exposes `health`, `embed`, `extract_spans`, `classify_discourse`. The rest are **DEAD/ASPIRATIONAL** proto definitions.

### 3.6 packages/ui

**21 cognitive UI components + 1 token file.**

- `src/cognitive/` — React components for the reasoning trace UI:
  - `brain-heatmap.tsx`, `trace-timeline.tsx`, `confidence-dial.tsx`, `conflict-banner.tsx`, `cost-meter.tsx`, `specialist-chip.tsx`, `pipeline-activity.tsx`, `honesty-calibration-table.tsx`, `verdict-card.tsx`, `voice-fingerprint-radar.tsx`, `recruiter-belief-card.tsx`, `provenance-overlay.tsx`, `pipeline-steps.tsx`, `live-narrative-stream.tsx`, `evidence-span-popover.tsx`, `gdpr-packet-viewer.tsx`, `goal-dag.tsx`, `emotional-state-badge.tsx`
- `src/tokens/cognitive-palette.ts` — design tokens

**Status:** These are real React components (not stubs), but whether they're actually rendered in `apps/web` is unclear from this package alone.

### 3.7 packages/onto

**Cognitive ontology package.**

- `src/cognitive.jsonld` (45.7KB) — JSON-LD ontology document (brain regions, specialists, cell types, networks, neurotransmitters)
- `src/runtime.ts` — Loads JSON-LD, builds typed indexes (by id, by class), exposes queries
- `src/types.ts` (7.1KB) — TypeScript types for ontology nodes
- `src/cypher.ts` (4KB) — Cypher query generation (for Neo4j export?)
- `test/` — 2 test files
- `dist/` — pre-built

### 3.8 packages/scripts

Python scripts (NOT TypeScript):
- `generate_resume.py` (28.8KB) — DOCX/PDF resume generation
- `ats_score.py` (10KB) — ATS scoring
- `validate_docx.py` (6.7KB) — DOCX validation
- `requirements.txt` — Python deps

### 3.9 packages/tsconfig

- `base.json` — **strict: true**, `noUncheckedIndexedAccess: true`, `noImplicitReturns: true`, `module: ESNext`, `target: ES2022`, `moduleResolution: bundler`
- `nextjs.json` — extends base for Next.js

---

## 4. Cross-Cutting Concerns

### 4.1 TypeScript Strictness

`strict: true` + `noUncheckedIndexedAccess` across all packages via shared `@retune/tsconfig/base.json`. This is production-grade strictness.

### 4.2 Exports

- `@retune/agent` — 3 subpath exports: `.` (full), `./web` (no Temporal native deps), `./cron`
- `@retune/db` — 4 subpath exports: `.`, `./schema`, `./types`, `./pg`
- `@retune/types` — 12 subpath exports (one per domain)
- All use TypeScript source directly (no pre-compilation for internal packages)
- No deep imports observed — all consumption goes through declared exports

### 4.3 Test Coverage Summary

| Package | Runner | Count | Status |
|---------|--------|-------|--------|
| `@retune/agent` | `tsx --test` | 212/212 | ✅ All passing |
| `@retune/db` | vitest | 3 files | Smoke-level |
| `@retune/eval` | `tsx --test` | 4 files | Meaningful |
| `@retune/onto` | unknown | 2 files | Unknown |
| `@retune/proto` | unknown | 1 file | Minimal |
| `@retune/auth` | — | 0 | **NONE** |
| `@retune/billing` | — | 0 | **NONE** |
| `@retune/ui` | — | 0 | **NONE** |

---

## 5. Red Flags for Charters

### CRITICAL

1. **Dual migration tracks with no sync** — `packages/db/src/pg/migrations/` (12 Drizzle) vs `supabase/migrations/` (30 Supabase). Schema drift is inevitable. Any charter touching DB schema must specify which track owns the change.

2. **No RLS in Drizzle schema** — All `user_id` columns exist but no row-level security policies are defined in the Drizzle layer. Supabase migrations add some, but coverage is unknown. Multi-tenant data isolation depends entirely on application-layer WHERE clauses.

3. **Billing is a stub** — No Stripe, no payment processing, no webhook handlers. `upgradeToPro()` is a raw DB write. Any charter assuming real billing exists will fail.

4. **`generation_model_calls` table missing** — The `ModelCallTelemetry` type exists and telemetry is buffered per-call, but there's no DB table to persist it. Cost attribution at the model-call level is lost after process exit.

5. **voice_centroids still JSONB, not pgvector** — Schema comment says "moves to pgvector in commit #4" but it hasn't happened. Similarity search over voice fingerprints requires a table scan.

### HIGH

6. **Proto RPCs are 70% dead** — 10 of 14 ML proto RPCs have no caller in the agent package. The ML service may implement them, but the cognitive pipeline doesn't use them. Charters referencing "ML-powered critique" or "ML-powered bullet composition" should verify the actual call path.

7. **TraceBus is in-process only** — Comment in `trace-bus.ts` says "Commit #3 replaces this with Redis pub/sub". Not done. SSE streaming breaks across multiple API instances. Any charter assuming horizontal scaling of the API must address this.

8. **No auth tests, no billing tests** — These packages have zero test coverage. Any charter hardening auth or billing starts from scratch.

9. **Budget ceiling mismatch** — `workbench-runner.ts` (eval/test) uses `ceiling_usd: 0.2, hard_kill_usd: 0.5`. Temporal substrate uses `ceiling_usd: 0.05, hard_kill_usd: 0.2`. These are hardcoded, not configurable per-request. Charters about cost control must reconcile this.

10. **`data/retune.db` is a dead SQLite file** — 118KB leftover. The legacy SQLite path was removed but the file persists.

### MEDIUM

11. **Ontology version hardcoded** — `ontology_version: "0.0.1"` is hardcoded in both substrate builders. The `ontology_versions` table exists but nothing reads from it at runtime.

12. **No outbox/inbox pattern** — Schema comment mentions it for "commit #4+" but it doesn't exist. Email integration (mentioned in git log) has no durable delivery guarantee.

13. **`case_base_entries` table exists but no writer** — The pgvector table for outcome-based retrieval is defined but no specialist or cron job populates it. The outcome learning ranker (`outcome-learning-ranker.ts`) is a pure function that doesn't persist.

14. **Comprehension specialists have ML/no-ML split** — When `ml_client` is absent, `JdSpanExtractor` and `DiscourseClassifier` are replaced with stubs that return empty results. Goals that depend on their output (`map_gaps` reads `evidence_graph.requirement_matches`) will produce degraded results silently.

15. **GDPR extended_persistence is optional** — The orchestrator only writes GDPR packets and conflict rows when `extended_persistence` is provided. In the Temporal path it's not wired (only `persistence` is passed). GDPR audit packets may not persist in production.

16. **No rate limiting on LLM calls** — The `ConcurrencyManager` exists but is only exported, not wired into the provider layer. Individual specialists can fire unlimited parallel LLM calls.

17. **Supabase migrations reference tables not in Drizzle schema** — e.g., auth triggers, profile domain ingestions. The Drizzle schema is not the complete picture of what's in production Postgres.
