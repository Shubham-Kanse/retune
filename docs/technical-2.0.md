# RetuneAI — Technical Specification v2.0

**Codename**: Brain-Cell SOTA Hardening
**Status**: Authoritative — supersedes the legacy `technical.md` (deleted)
**Owner**: Cognitive Cycle WG
**Companion**: `prd-2.0.md` (product contract)
**Last revised**: 2026-05-07

> **One-line engineering thesis**
> Make every cognitive specialist already implemented in `packages/agent` reachable from `POST /generate`, with provider parity (Anthropic + OpenAI), correct cross-listener semantics, a green build everywhere, and a `--live` eval harness that proves the system end-to-end.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Process topology](#2-process-topology)
3. [Package boundaries and import graph](#3-package-boundaries-and-import-graph)
4. [LLM provider abstraction (dual Anthropic + OpenAI)](#4-llm-provider-abstraction-dual-anthropic--openai)
5. [Cognitive substrate](#5-cognitive-substrate)
6. [Specialist catalogue (18 specialists)](#6-specialist-catalogue-18-specialists)
7. [Goal seeding chain](#7-goal-seeding-chain)
8. [Trigger-bus listener registration](#8-trigger-bus-listener-registration)
9. [Conflict staging + persistence](#9-conflict-staging--persistence)
10. [Persistence schema](#10-persistence-schema)
11. [Voice fingerprint canonical specification](#11-voice-fingerprint-canonical-specification)
12. [Web build correctness](#12-web-build-correctness)
13. [Anthropic SDK lazy initialization](#13-anthropic-sdk-lazy-initialization)
14. [Eval harness with --live mode](#14-eval-harness-with-live-mode)
15. [Test pyramid](#15-test-pyramid)
16. [CI matrix](#16-ci-matrix)
17. [Dead-code audit](#17-dead-code-audit)
18. [Operational readiness](#18-operational-readiness)
19. [Migration plan — exact patches per file](#19-migration-plan--exact-patches-per-file)
20. [Per-phase acceptance gates](#20-per-phase-acceptance-gates)
21. [Appendix A — Goal kind enumeration v2.0](#appendix-a--goal-kind-enumeration-v20)
22. [Appendix B — Conflict monitor enumeration v2.0](#appendix-b--conflict-monitor-enumeration-v20)
23. [Appendix C — Brain region tag map](#appendix-c--brain-region-tag-map)
24. [Appendix D — Provider parity test cases](#appendix-d--provider-parity-test-cases)

---

## 1. Architecture overview

The system is an **agentic cognitive cycle** with five coarse layers running over a shared blackboard:

```
                         ┌─────────────────────────────────────────────────┐
                         │       Frontend (apps/web — Next.js)             │
                         │   /generate POST → SSE stream subscriber        │
                         └────────────┬─────────────────────────┬──────────┘
                                      │ HTTP                    │ HTTP
                ┌─────────────────────▼──────────┐    ┌─────────▼───────────┐
                │   API (apps/api — Hono)        │    │   Onboarding API    │
                │   - /generate (Temporal start) │    │   - /onboarding/*   │
                │   - /generate/:id/stream (SSE) │    │   - /profile/*      │
                │   - /generate/:id/status       │    │   - /refine/*       │
                │   - /active-questions/:id/...  │    │   - /generate/[id]/* (legacy SQLite)
                └────────────┬───────────────────┘    └─────────────────────┘
                             │ Temporal client
                             │ (or in-process fallback)
                ┌────────────▼─────────────────┐
                │  Worker (apps/worker)        │
                │  Temporal worker            │
                │  - runs runGenerationWorkflow│
                │  - executes activities       │
                └────────────┬─────────────────┘
                             │
            ┌────────────────▼─────────────────────────┐
            │   @retune/agent (cognitive substrate)    │
            │                                          │
            │   ┌───────────────────────────────────┐  │
            │   │ Workbench                          │  │
            │   │  Blackboard, Goals, Audit, Bus     │  │
            │   │  Orchestrator (tick loop)          │  │
            │   └─────────────────┬─────────────────┘  │
            │                     │                    │
            │   ┌─────────────────▼─────────────────┐  │
            │   │ 18 specialists (5 layers)          │  │
            │   │  Comprehension, Reflection,        │  │
            │   │  Strategy, Production, Critique,   │  │
            │   │  Decision                          │  │
            │   └─────────────────┬─────────────────┘  │
            │                     │                    │
            │   ┌─────────────────▼─────────────────┐  │
            │   │ 3 listeners (cross-cutting)        │  │
            │   │  Fairness, VoiceDrift, WellBeing   │  │
            │   └───────────────────────────────────┘  │
            └────────────┬─────────────┬───────────────┘
                         │             │
              ┌──────────▼─────┐   ┌───▼─────────┐
              │   ML server   │   │  Postgres    │
              │ (apps/ml)     │   │  (or pglite) │
              │  HTTP + gRPC  │   └──────────────┘
              │  Python aio   │
              └───────────────┘
```

Layers explained:

1. **Comprehension** — read the world (JD, profile, company).
2. **Reflection** — read the user (voice, honesty, credibility).
3. **Strategy** — decide what to claim (gap map, evidence solver).
4. **Production** — write the documents (narrative arcs, bullet composer).
5. **Critique** — second-guess the work (critic ensemble, theory of mind).
6. **Decision** — refuse, revise, or ship + GDPR packet.

Cross-cutting:

- **Listeners**: fire on every blackboard write. Fairness, voice-drift, well-being.
- **Audit trail**: every write recorded with seq, specialist, micro-stage, cost, latency.
- **Cost budget**: BudgetController enforces a hard kill at $0.20/generation (5× the soft ceiling of $0.05).

## 2. Process topology

```
production:
  apps/web   → Next.js SSR + API routes (legacy onboarding pipeline)
  apps/api   → Hono on Node 22; talks to Temporal via gRPC
  apps/worker → Temporal worker process; loads @retune/agent + executes activities
  apps/ml    → Python aio FastAPI (HTTP) + grpc.aio (gRPC); BGE + GLiNER + DeBERTa
  Temporal server → managed (Temporal Cloud) or self-hosted Docker
  Postgres   → managed (Supabase / Neon) or self-hosted
  Redis (deferred to v2.1) → for SSE pub/sub at scale

local dev:
  pnpm dev runs all four apps concurrently
  pglite replaces Postgres
  Temporal is in-process (apps/api falls through to direct workbench-runtime)
  ML server runs locally; or RETUNE_ML_USE_STUBS=true skips it
  AI_PROVIDER=anthropic|openai picks LLM backend
```

## 3. Package boundaries and import graph

### 3.1 Allowed import edges

```
@retune/types          (no imports from siblings — pure schemas)
   ↑
@retune/proto          (depends on @retune/types implicitly via codegen)
   ↑
@retune/db             (depends on @retune/types — drizzle schemas)
   ↑
@retune/auth           (depends on @retune/db)
@retune/billing        (depends on @retune/db)
   ↑
@retune/agent          (depends on @retune/types, @retune/db, @retune/proto)
   ↑
apps/api               (depends on @retune/agent, @retune/db, @retune/auth, @retune/billing, @retune/types)
apps/worker            (depends on @retune/agent, @retune/db only — never @retune/auth or @retune/billing; the worker is a pure cognitive executor)
apps/web               (depends on @retune/agent/web, @retune/db, @retune/auth, @retune/billing, @retune/types)
apps/ml                (no JS deps — pure Python)

@retune/eval           (depends on @retune/agent, @retune/types, @retune/db)
```

### 3.2 Forbidden edges (enforced via biome rule + manual review)

- `@retune/types` MUST NOT import from any sibling.
- `@retune/agent` MUST NOT import from `apps/*`.
- `apps/web` MUST NOT import from `@retune/agent` directly — only from `@retune/agent/web` (the safe export that excludes `temporal/worker.ts`).
- `apps/worker` MUST NOT import from `@retune/auth` or `@retune/billing` (separation of cognition from auth).
- Any package using a top-level `await`, `process.env` read at module-load, or `new XClient(...)` outside a function is FORBIDDEN. All such reads are lazy.

### 3.3 The `@retune/agent/web` export

`packages/agent/package.json` declares two entry points:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./web": "./src/web-exports.ts"
  }
}
```

- `./` exports everything including `build_worker` from `temporal/index.ts`. Used by `apps/worker` and `apps/api`.
- `./web` excludes `temporal/worker.ts` and its bundler dependencies (`@swc/wasm`, `webpack`, etc.). Used by `apps/web` and any browser-runnable code.

## 4. LLM provider abstraction (dual Anthropic + OpenAI)

### 4.1 Layer cake

```
Specialist code
    ↓ uses
getProvider().createMessageWithTool(agent, params, toolName)
    ↓ delegates to
AnthropicProvider | OpenAIProvider     (chosen by AI_PROVIDER env)
    ↓ wraps
@anthropic-ai/sdk | openai             (vendor SDKs)
```

### 4.2 Models tier

`packages/agent/src/lib/ai-provider.ts` exports the canonical `Models` interface:

```ts
export interface Models {
  smart: string;    // best quality, ~$0.003/1k tok input, ~$0.015/1k tok output
  fast:  string;    // cheap+quick, ~$0.00025/1k tok input, ~$0.00125/1k tok output
  frontier: string; // best-of-best, escalation only. ~$0.015/1k tok input, ~$0.075/1k tok output
}
```

| Tier | Anthropic | OpenAI |
|---|---|---|
| `smart` | `claude-sonnet-4-6` | `gpt-4o` |
| `fast` | `claude-haiku-4-5` | `gpt-4o-mini` |
| `frontier` | `claude-opus-4-1` | `gpt-5` |

Override via env:

```
AGENT_MODEL=claude-sonnet-4-6 | gpt-4o    (smart override)
AGENT_MODEL_FAST=claude-haiku-4-5 | gpt-4o-mini   (fast override)
AGENT_MODEL_FRONTIER=claude-opus-4-1 | gpt-5     (frontier override)
```

### 4.3 The fix — every specialist must use `getModels()`

**v1.0 (BROKEN for OpenAI)**:

```ts
import { MODELS, createMessageWithTool } from "../lib/anthropic";

const response = await createMessageWithTool(this.id, {
  model: MODELS.smart,   // always claude-sonnet-4-6, even when AI_PROVIDER=openai
  ...
});
```

**v2.0 (CORRECT)**:

```ts
import { createMessageWithTool, getModels } from "../lib/anthropic";

const models = getModels();
const response = await createMessageWithTool(this.id, {
  model: models.smart,   // gpt-4o when AI_PROVIDER=openai, claude-sonnet-4-6 otherwise
  ...
});
```

### 4.4 Provider tests (parity invariant)

`packages/agent/tests/provider-parity/` directory. One file per LLM-driven specialist:

- `bullet-composer.test.ts`
- `narrative-arc-proposer.test.ts`
- `critic-ensemble.test.ts`
- `theory-of-mind.test.ts`

Each test:
1. Sets `AI_PROVIDER=anthropic` AND mocks `anthropicProvider.createMessageWithTool` to return canonical fixture.
2. Runs specialist; captures blackboard writes.
3. Sets `AI_PROVIDER=openai` AND mocks `openaiProvider.createMessageWithTool` to return same canonical fixture.
4. Runs specialist; captures blackboard writes.
5. Asserts identical blackboard writes (path + value).

Acceptance: parity tests green for all 4 LLM specialists.

### 4.5 Provider error normalization

Every error from a provider MUST be wrapped in a typed `LlmError`:

```ts
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly kind: 'rate_limit' | 'auth_failed' | '5xx' | 'malformed_response' | 'tool_call_missing',
    public readonly provider: 'anthropic' | 'openai',
    public readonly cause?: unknown,
  ) { super(message); }
}
```

Specialists catch `LlmError` and emit a typed conflict with severity:
- `rate_limit` → low (retry handled by provider)
- `auth_failed` → critical (refuse-or-ship gate refuses)
- `5xx` → medium (retry × 3 then refuse with `provider_5xx`)
- `malformed_response` → medium (fall back to deterministic stub if available)
- `tool_call_missing` → high (LLM didn't call the forced tool — re-prompt with stricter instructions)

## 5. Cognitive substrate

### 5.1 Files and responsibilities

| File | Lines | Responsibility |
|---|---|---|
| `workbench/blackboard.ts` | ~180 | Typed, transactional, deep-frozen state graph |
| `workbench/goal-stack.ts` | ~120 | Priority queue of goals with status |
| `workbench/trigger-bus.ts` | ~100 | Pub/sub for blackboard events; glob-matched listeners |
| `workbench/audit-trail.ts` | ~80 | Append-only log of specialist runs with cost attribution |
| `workbench/budget-controller.ts` | ~100 | Soft + hard cost ceilings; AbortSignal kill |
| `workbench/attention-scheduler.ts` | ~120 | Picks the best specialist for a goal (priority × competence × cost) |
| `workbench/orchestrator.ts` | ~270 | Tick loop: pick goal → run specialist → commit → audit |
| `workbench/conflict-staging.ts` | ~90 | (NEW v2.0) buffer for listener-emitted conflicts; drained per-tick |
| `workbench/types.ts` | ~150 | Specialist + EventListener interfaces |

### 5.2 Tick loop (with v2.0 conflict-staging integration)

```
ORCHESTRATOR.run() pseudocode:

while true:
  if budget.exhausted() OR signal.aborted():
    break

  # 1. Drain any conflicts staged by listeners since last tick
  staged = conflictStaging.drain()
  if staged.length > 0:
    blackboard.commit({
      by_specialist: 'listener_drainer',
      writes: [],
      conflicts: staged,
      audit_entry: <synthetic 'conflict_drain' entry>,
    })

  # 2. Pick the next goal
  goal = goalStack.peek_next()
  if !goal: break

  # 3. Pick the best specialist
  pick = scheduler.pick(goal, registry, blackboard.snapshot())
  if !pick: terminate('no_competent_specialist')

  # 4. Cost gate
  if !budget.can_afford(pick.estimated_cost): terminate('no_affordable_specialist')

  # 5. Run
  result = await pick.specialist.run(ctx, goal)

  # 6. Commit atomically
  blackboard.commit({
    by_specialist: pick.specialist.id,
    writes: result.writes,
    conflicts: result.conflicts ?? [],
    audit_entry: result.audit,
  })

  # 7. Add new goals (chain pattern)
  for new_goal in result.new_goals ?? []:
    goalStack.add(new_goal)

  # 8. Mark satisfied
  for id in result.satisfied_goal_ids:
    goalStack.satisfy(id)

  # 9. Charge cost
  budget.charge(pick.specialist.id, result.audit.cost_usd)

  # 10. Persist tick (if persistence wired)
  if persistence: await persistence.persist_tick(...)

  # 11. Notify trace subscribers
  on_trace?(make_trace_event(pick, result))
```

The `conflictStaging.drain()` step (v2.0 NEW) is the fix for issue #7 in the audit. Without it, listener-emitted conflicts evaporate.

### 5.3 Listener execution semantics

When `blackboard.commit()` publishes events, the trigger bus calls each matching listener's `on_event` asynchronously. Listeners CANNOT mutate the blackboard directly (that would break atomicity). Instead they:
- Record measurements in their own ring buffers.
- Push concerns into `ConflictStagingQueue` (the orchestrator's input channel from listeners).
- Optionally invoke their `on_concern` callback (used by API runtime to forward to SSE trace stream).

The orchestrator drains `ConflictStagingQueue` at the top of each tick.

## 6. Specialist catalogue (18 specialists)

### 6.1 Layer 1 — Comprehension

#### `TitleSchemaRetriever`

- **File**: `comprehension/title/retriever.ts`
- **Goal kind**: `analyze_jd`
- **Brain region**: angular gyrus (canonical resolution)
- **Cost**: $0 (ontology lookup)
- **Reads**: `goal.payload.jd_title`
- **Writes**: `hypotheses.role_schema`
- **Emits**: `extract_spans` (if JD body present), `request_user_input` (if title unknown)

#### `CompanySchemaRetriever`

- **File**: `comprehension/company/retriever.ts`
- **Goal kind**: `analyze_company`
- **Brain region**: angular gyrus
- **Cost**: $0
- **Reads**: `goal.payload.company`
- **Writes**: `hypotheses.company_schema`, `blocking_factors` (if unknown)

#### `JdSpanExtractor`

- **File**: `comprehension/spans/extractor.ts`
- **Goal kind**: `extract_spans`
- **Brain region**: temporal cortex (entity recognition)
- **Cost**: ~$0.0001 (gRPC call to ML server)
- **Reads**: `goal.payload.text`
- **Writes**: `evidence_graph.span_ids`, `evidence_graph.requirement_matches`
- **Emits**: `classify_discourse` (NEW v2.0: chained), `map_gaps` (NEW v2.0: chained)
- **External**: `MLClient.extract_spans` (HTTP/gRPC to apps/ml)

#### `DiscourseClassifier`

- **File**: `comprehension/discourse/classifier.ts`
- **Goal kind**: `classify_discourse`
- **Brain region**: Wernicke's area
- **Cost**: ~$0.0002 (gRPC call to ML server; uses DeBERTa-v3 NLI)
- **Writes**: `hypotheses.discourse_map`
- **Emits**: `strip_discourse_boilerplate`, `calibrate_cultural_vector`

#### `BoilerplateStripper`

- **File**: `comprehension/discourse/boilerplate-stripper.ts`
- **Goal kind**: `strip_discourse_boilerplate`
- **Brain region**: ACC (irrelevant-info suppression)
- **Cost**: $0
- **Reads**: `hypotheses.discourse_map`
- **Writes**: same path with `importance: 0` on legal+boilerplate sentences
- **Idempotent**: yes (sentinel-detected)

#### `CulturalCalibrator`

- **File**: `comprehension/discourse/cultural-calibrator.ts`
- **Goal kind**: `calibrate_cultural_vector`
- **Brain region**: right TPJ + STS
- **Cost**: ~$0.0001 (BGE embed of 8 axis prototypes — cached per process)
- **Writes**: `hypotheses.cultural_vector` (length 8, each ∈ [-1, 1])

### 6.2 Layer 2 — Reflection

#### `VoiceFingerprintExtractor`

- **File**: `comprehension/voice/extractor.ts`
- **Goal kind**: `extract_voice_fingerprint`
- **Brain region**: Broca's area + arcuate fasciculus
- **Cost**: $0
- **Reads**: `goal.payload.profile_texts`
- **Writes**: `hypotheses.voice_fingerprint` (128-dim, L2-normalized)
- **Persistence**: upsert `voice_centroids(user_id, vector, sample_size)`
- **v2.0 fix**: imports `compute_fingerprint()` from `comprehension/voice/fingerprint.ts` (the canonical, single source of truth).

#### `HonestyCalibrator`

- **File**: `comprehension/honesty/calibrator.ts`
- **Goal kind**: `calibrate_honesty`
- **Brain region**: orbitofrontal cortex
- **Cost**: $0
- **Writes**: `hypotheses.honesty_calibration` (Record<string, number>)
- **Persistence**: upsert `honesty_calibrations(user_id, claim_type, trust_factor, sample_size)`

#### `CredibilityScanner`

- **File**: `comprehension/credibility/scanner.ts`
- **Goal kind**: `scan_credibility`
- **Brain region**: STS + ACC
- **Cost**: $0
- **Reads**: `hypotheses.discourse_map`
- **Writes**: `hypotheses.hidden_disqualifiers`

### 6.3 Layer 3 — Strategy

#### `GapMapper`

- **File**: `specialists/gap-mapper.ts`
- **Goal kind**: `map_gaps`
- **Brain region**: DLPFC
- **Cost**: $0
- **Reads**: `evidence_graph.requirement_matches`, `hypotheses.role_schema`, `hypotheses.discourse_map`, `hypotheses.honesty_calibration`, `hypotheses.hidden_disqualifiers`
- **Writes**: `evidence_graph.gap_map`
- **Emits**: `solve_evidence` (NEW v2.0: chained as child goal)

#### `EvidenceSolver`

- **File**: `specialists/evidence-solver.ts`
- **Goal kind**: `solve_evidence`
- **Brain region**: DLPFC + premotor
- **Cost**: $0
- **Algorithm**: branch-and-bound with constraint propagation (docstring updated v2.0; was misleadingly labelled "MaxSAT")
- **Reads**: `evidence_graph.gap_map`, `hypotheses.chosen_narrative_arc` (nullable), `hypotheses.honesty_calibration`
- **Writes**: `evidence_graph.solver_solution`
- **Emits**: `propose_arcs` (NEW v2.0: chained as child goal)

### 6.4 Layer 4 — Production

#### `NarrativeArcProposer`

- **File**: `specialists/narrative-arc-proposer.ts`
- **Goal kind**: `propose_arcs`
- **Brain region**: default mode network
- **Cost**: ~$0.001 (one Sonnet/gpt-4o call with structured output)
- **Writes**: `hypotheses.narrative_arcs_candidates`, `hypotheses.chosen_narrative_arc` (preliminary)
- **Emits**: `model_recruiter_beliefs` (NEW v2.0 goal kind), `select_arc` (after ToM completes)

#### `TheoryOfMindSpecialist`

- **File**: `specialists/theory-of-mind.ts`
- **Goal kind**: `model_recruiter_beliefs` (NEW v2.0 — was incorrectly `select_arc` in v1.0)
- **Brain region**: TPJ + right STS
- **Cost**: ~$0.0008 (Haiku/gpt-4o-mini)
- **Writes**: `hypotheses.recruiter_belief_state`
- **v2.0 fix**: handles its own goal kind, no longer collides with CriticEnsemble.

#### `CriticEnsemble`

- **File**: `specialists/critic-ensemble.ts`
- **Goal kind**: `select_arc`
- **Brain region**: TPJ (theory of mind trio)
- **Cost**: ~$0.0009 (3 parallel Haiku/gpt-4o-mini)
- **Reads**: `hypotheses.narrative_arcs_candidates`, `hypotheses.recruiter_belief_state`
- **Writes**: `hypotheses.chosen_narrative_arc` (overrides preliminary), conflicts (`critic_divergence`)
- **Emits**: `compose_resume`

#### `SequentialBulletComposer`

- **File**: `specialists/bullet-composer.ts`
- **Goal kind**: `compose_resume`
- **Brain region**: Broca's + premotor + cerebellum
- **Cost**: ~$0.0024 (~18 bullets × Sonnet/gpt-4o)
- **Reads**: `evidence_graph.solver_solution`, `hypotheses.chosen_narrative_arc`, `hypotheses.voice_fingerprint`, `hypotheses.honesty_calibration`, `hypotheses.role_schema`
- **Writes**: `draft.bullets.{uuid}`, `draft.sections.{id}`, `draft.pending_revisions`
- **Emits**: `estimate_outcome`

### 6.5 Layer 5 — Decision

#### `OutcomePredictor`

- **File**: `specialists/outcome-predictor.ts`
- **Goal kind**: `estimate_outcome`
- **Brain region**: ventromedial PFC
- **Cost**: $0
- **Reads**: every hypothesis above
- **Writes**: `outcome_estimate` (Confidence with 95% conformal interval)
- **Emits**: `decide_refuse_or_ship`

#### `RefuseOrShipGate`

- **File**: `specialists/refuse-or-ship-gate.ts`
- **Goal kind**: `decide_refuse_or_ship`
- **Brain region**: locus coeruleus + amygdala + meta-cognition
- **Cost**: $0
- **Reads**: ENTIRE blackboard
- **Writes**: `hypotheses.ship_decision`, `hypotheses.gdpr_audit_packet`
- **Emits**: `render_documents` (if ship) | `request_user_input` (if revise) | terminal (if refuse)
- **Persistence**: upsert `gdpr_packets` (NEW v2.0 table)

### 6.6 Auxiliary

#### `ActiveQuestionHandler`

- **File**: `specialists/active-question-handler.ts`
- **Goal kind**: `request_user_input`
- **Brain region**: ACC + TPJ
- **Persistence**: upsert `active_questions(generation_id, parent_goal_id, question_text)`

### 6.7 Listeners (3, cross-cutting)

#### `FairnessMonitor`

- **File**: `specialists/fairness-monitor.ts`
- **Path glob**: `**` (broad) + internal regex filter on `hypotheses.discourse_map | draft.bullets.* | draft.sections.*`
- **Brain region**: right vlPFC
- **v2.0 fix**: now pushes concerns into `ConflictStagingQueue` (was: in-memory only)

#### `VoiceDriftMonitor`

- **File**: `specialists/voice-drift-monitor.ts`
- **Path glob**: `draft.bullets.*`
- **Brain region**: cerebellum
- **v2.0 fix**: imports `compute_fingerprint()` from `comprehension/voice/fingerprint.ts`. Pushes drift concerns into `ConflictStagingQueue`.

#### `WellBeingMonitor`

- **File**: `specialists/well-being-monitor.ts`
- **Path glob**: `audit_trail.*` (NEW pseudo-path; orchestrator emits synthetic events for tick boundaries) OR `draft.pending_revisions`
- **Brain region**: insula (interoception) + vmPFC
- **v2.0 fix**: pushes `well_being` conflicts into `ConflictStagingQueue` when retry rate > 30% OR pending_revisions > 5

## 7. Goal seeding chain

### 7.1 The chain (v2.0 canonical)

Goals chain via specialist `result.new_goals`. Initial seeding happens once at the API layer.

```
API seeds:
  - analyze_jd (priority 80)              if jd_title
  - analyze_company (priority 80)         if company
  - extract_voice_fingerprint (priority 60)  if profile_text
  - calibrate_honesty (priority 55)       always
  - extract_spans (priority 75)           if jd_text >= 50 chars
                                           AND profile_text >= 50 chars (separate goal each)

Specialists chain:
  TitleSchemaRetriever (analyze_jd)
    → if known: nothing further (just writes role_schema)
    → if unknown: emits request_user_input

  JdSpanExtractor (extract_spans)
    → emits classify_discourse
    → emits map_gaps  (NEW v2.0)

  DiscourseClassifier (classify_discourse)
    → emits strip_discourse_boilerplate
    → emits calibrate_cultural_vector
    → emits scan_credibility  (NEW v2.0)

  CredibilityScanner (scan_credibility)
    → no further chain (just writes hidden_disqualifiers)

  GapMapper (map_gaps)
    → emits solve_evidence

  EvidenceSolver (solve_evidence)
    → emits propose_arcs

  NarrativeArcProposer (propose_arcs)
    → emits model_recruiter_beliefs    (NEW v2.0)
    → emits select_arc                  (after ToM)
    Note: emits both at once with priority(model_recruiter_beliefs) > priority(select_arc)
    so AttentionScheduler picks ToM first, then critic ensemble.

  TheoryOfMindSpecialist (model_recruiter_beliefs)
    → no further chain (just writes recruiter_belief_state)

  CriticEnsemble (select_arc)
    → emits compose_resume

  SequentialBulletComposer (compose_resume)
    → emits estimate_outcome

  OutcomePredictor (estimate_outcome)
    → emits decide_refuse_or_ship

  RefuseOrShipGate (decide_refuse_or_ship)
    → if ship: emits render_documents (deferred to v2.1; no specialist yet)
    → if revise: emits request_user_input
    → if refuse: terminal (no chain)
```

### 7.2 Priority hygiene

Priorities decay along the chain so newer/deeper goals don't starve. AttentionScheduler picks max priority first.

```
analyze_jd                  80
analyze_company             80
extract_spans               75
extract_voice_fingerprint   60
calibrate_honesty           55
classify_discourse          74 (from extract_spans)
scan_credibility            53 (from classify_discourse)
strip_discourse_boilerplate 73 (from classify_discourse)
calibrate_cultural_vector   72 (from classify_discourse)
map_gaps                    73 (from extract_spans)
solve_evidence              72 (from map_gaps)
propose_arcs                71 (from solve_evidence)
model_recruiter_beliefs     70 (from propose_arcs)
select_arc                  69 (from propose_arcs)
compose_resume              68 (from select_arc)
estimate_outcome            67 (from compose_resume)
decide_refuse_or_ship       66 (from estimate_outcome)
request_user_input          90 (always high — user-blocking work)
```

### 7.3 Failure handling

If any specialist throws:
- Its goal is marked `abandoned` (not `satisfied`).
- The chain is broken at that point.
- The orchestrator continues running other independent goals (e.g. `analyze_company` runs even if `analyze_jd` throws).
- The terminal `decide_refuse_or_ship` goal is NEVER seeded by API directly. It only runs if the chain reached `OutcomePredictor` successfully, which means every specialist before it succeeded.

This is the cleanest backpressure: a missing strategy/production layer means no `decide_refuse_or_ship` goal exists, so the cycle terminates `no_open_work` with a partial blackboard. The API surfaces "Generation incomplete — your job description couldn't be analyzed" rather than refusing-and-explaining.

### 7.4 Goal seeding wiring — exact patches

#### `apps/api/src/runtime/workbench-runtime.ts`

REPLACE the goal-seeding block (lines ~250–292 in v1.0) with:

```ts
// ──────────── Goal seeding (v2.0) ────────────
// We seed only the entry-point goals here. Specialists chain the rest
// via result.new_goals (see technical-2.0.md §7.1 for the canonical chain).

if (payload.jd_title) {
  goals.add({
    kind: "analyze_jd",
    priority: 80,
    emitted_by: "api",
    payload: { jd_title: payload.jd_title },
  });
}
if (payload.company) {
  goals.add({
    kind: "analyze_company",
    priority: 80,
    emitted_by: "api",
    payload: { company: payload.company },
  });
}
if (payload.jd_text && payload.jd_text.length >= 50) {
  goals.add({
    kind: "extract_spans",
    priority: 75,
    emitted_by: "api",
    payload: {
      text: payload.jd_text,
      source_doc_kind: "jd",
      span_kinds: [],
    },
  });
}
if (payload.profile_text) {
  if (payload.profile_text.length >= 50) {
    goals.add({
      kind: "extract_spans",
      priority: 75,
      emitted_by: "api",
      payload: {
        text: payload.profile_text,
        source_doc_kind: "profile",
        span_kinds: [],
      },
    });
  }
  goals.add({
    kind: "extract_voice_fingerprint",
    priority: 60,
    emitted_by: "api",
    payload: { profile_texts: [payload.profile_text] },
  });
}
goals.add({
  kind: "calibrate_honesty",
  priority: 55,
  emitted_by: "api",
  payload: {},
});
```

REMOVE the `scan_credibility` API-level seed (it's now chained from `classify_discourse`).

#### `packages/agent/src/temporal/activities/make-activities.ts`

Same goal-seeding block applies; copy from `workbench-runtime.ts` to keep them in lockstep. A future v2.1 refactor moves this to a shared `seed_initial_goals(payload)` helper in `@retune/agent`.

## 8. Trigger-bus listener registration

### 8.1 Where listeners subscribe

API runtime (`apps/api/src/runtime/workbench-runtime.ts`):

```ts
const fairness = new FairnessMonitor((concern) => {
  bus_trace.publish({ kind: 'trace', event: <synthetic trace event from concern> });
});
trigger_bus.subscribe(fairness);

const voice_drift = new VoiceDriftMonitor({
  on_drift: (m) => {
    bus_trace.publish({ kind: 'trace', event: <synthetic trace event> });
  },
});
trigger_bus.subscribe(voice_drift);

// Set the baseline lazily once VoiceFingerprintExtractor has run.
// Pattern: voice_drift listens for hypotheses.voice_fingerprint writes,
// then calls voice_drift.set_baseline().
trigger_bus.subscribe({
  id: 'voice_baseline_setter',
  path_glob: 'hypotheses.voice_fingerprint',
  listener_kind: 'monitor',
  on_event: (ev) => {
    if (ev.type === 'write' && Array.isArray(ev.after)) {
      voice_drift.set_baseline(ev.after as number[]);
    }
  },
});

const well_being = new WellBeingMonitor({
  conflict_staging: conflict_staging_queue,
});
trigger_bus.subscribe(well_being);
```

Temporal substrate (`packages/agent/src/temporal/activities/substrate.ts`): same three subscriptions, but with no-op trace handlers (no SSE in worker mode) — concerns flow only via `ConflictStagingQueue` to `conflicts` table.

### 8.2 Path-glob semantics

`path_matches(path, glob)` from `workbench/trigger-bus.ts:87` already handles:
- exact match
- single `*` (one segment)
- double `**` (any number of segments)

It does NOT handle alternation (`a|b`). Listeners that need to match multiple paths either subscribe with `**` and filter inside `on_event` (FairnessMonitor pattern) or subscribe multiple times.

## 9. Conflict staging + persistence

### 9.1 The queue

`packages/agent/src/workbench/conflict-staging.ts`:

```ts
import type { ConflictRecord } from '@retune/types';

export class ConflictStagingQueue {
  private buffer: ConflictRecord[] = [];

  push(conflict: ConflictRecord): void {
    this.buffer.push(conflict);
  }

  drain(): ConflictRecord[] {
    const out = this.buffer;
    this.buffer = [];
    return out;
  }

  size(): number { return this.buffer.length; }
}
```

### 9.2 Listener pattern

Each of the 3 listeners receives a `ConflictStagingQueue` in its constructor and pushes there instead of (or in addition to) calling its on_concern callback.

```ts
// FairnessMonitor v2.0
constructor(
  on_concern: FairnessConcernHandler = () => {},
  conflict_staging: ConflictStagingQueue,
  path_glob = '**',
) {
  this.on_concern = on_concern;
  this.conflict_staging = conflict_staging;
  this.path_glob = path_glob;
}

async on_event(event: BlackboardEvent): Promise<void> {
  // ... existing detection logic ...
  if (matched) {
    const conflict: ConflictRecord = { ... };
    this.conflict_staging.push(conflict);   // NEW v2.0
    await this.on_concern({ conflict, ... });
  }
}
```

### 9.3 Orchestrator drain

`workbench/orchestrator.ts:run()` adds at the top of the loop:

```ts
while (true) {
  // 0. Drain staged conflicts from listeners (v2.0 NEW)
  const staged = this.deps.conflict_staging?.drain() ?? [];
  if (staged.length > 0) {
    await this.deps.blackboard.commit({
      by_specialist: 'listener_drainer',
      writes: [],
      conflicts: staged,
      audit_entry: {
        seq: -1,                  // synthetic
        timestamp: new Date().toISOString(),
        specialist: 'listener_drainer',
        micro_stage: 'drain_staged_conflicts',
        inputs_hash: AuditTrail.hash({ n: staged.length }),
        output_hash: AuditTrail.hash({ ids: staged.map(c => c.id) }),
        justification: `drained ${staged.length} conflict(s) from listener staging queue`,
        latency_ms: 0,
        cost_usd: 0,
        writes: [],
      },
    });
  }
  // 1. Budget check ... (existing)
}
```

Persistence: `BlackboardStore.commit` already records `conflicts` to the in-memory state. Persistence happens via the `persist_tick` call at the end of the tick loop. The conflicts are part of the persisted blackboard snapshot AND get a row in `conflicts` table via `record_conflict` (NEW v2.0; see §10).

## 10. Persistence schema

### 10.1 Existing tables (carried from v1.0; no schema change)

- `users`
- `jds`
- `generations`
- `audit_entries`
- `blackboard_snapshots`
- `goals`
- `active_questions`
- `evidence_spans`
- `voice_centroids`
- `honesty_calibrations`
- `documents`
- `applications`
- `outcomes`

### 10.2 New tables (v2.0)

#### `conflicts`

```sql
CREATE TABLE conflicts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id   uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  monitor         varchar(64) NOT NULL,           -- enum: fairness_concern, voice_drift, well_being, ...
  severity        varchar(16) NOT NULL,           -- low, medium, high, critical
  payload         jsonb NOT NULL,
  resolved_by     varchar(64),
  resolution_log  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX conflicts_gen_idx ON conflicts(generation_id, created_at DESC);
CREATE INDEX conflicts_monitor_idx ON conflicts(monitor, created_at DESC);
```

#### `gdpr_packets`

```sql
CREATE TABLE gdpr_packets (
  generation_id   uuid PRIMARY KEY REFERENCES generations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict         varchar(16) NOT NULL,           -- ship, revise, refuse
  packet          jsonb NOT NULL,                 -- the full GdprAuditPacket
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX gdpr_packets_user_idx ON gdpr_packets(user_id, created_at DESC);
```

### 10.3 Persistence helpers (PostgresPersistence v2.0)

Add to `packages/agent/src/persistence/postgres-persistence.ts`:

```ts
async record_conflict(input: {
  generation_id: string;
  conflict: ConflictRecord;
}): Promise<void> {
  const { conflicts } = await import('@retune/db/pg');
  await this.db.insert(conflicts).values({
    id: input.conflict.id,
    generation_id: input.generation_id,
    monitor: input.conflict.monitor,
    severity: input.conflict.severity,
    payload: input.conflict.payload,
    resolved_by: input.conflict.resolved_by,
    resolution_log: input.conflict.resolution_log,
    created_at: new Date(input.conflict.created_at),
    resolved_at: input.conflict.resolved_at ? new Date(input.conflict.resolved_at) : null,
  }).onConflictDoNothing();   // idempotent on retry
}

async record_gdpr_packet(input: {
  generation_id: string;
  user_id: string;
  packet: GdprAuditPacket;
}): Promise<void> {
  const { gdpr_packets } = await import('@retune/db/pg');
  await this.db.insert(gdpr_packets).values({
    generation_id: input.generation_id,
    user_id: input.user_id,
    verdict: input.packet.verdict,
    packet: input.packet as unknown as Record<string, unknown>,
  }).onConflictDoUpdate({
    target: gdpr_packets.generation_id,
    set: { packet: input.packet as unknown as Record<string, unknown> },
  });
}

async load_gdpr_packet(generation_id: string): Promise<GdprAuditPacket | null> {
  const { gdpr_packets } = await import('@retune/db/pg');
  const rows = await this.db.select().from(gdpr_packets)
    .where(eq(gdpr_packets.generation_id, generation_id)).limit(1);
  return (rows[0]?.packet as GdprAuditPacket) ?? null;
}
```

### 10.4 Tick persistence integration

`PostgresPersistence.persist_tick` already records `audit_entries`, `blackboard_snapshots`, `goals`. v2.0 adds the conflicts persistence:

```ts
async persist_tick(input: PersistTickInput): Promise<void> {
  await this.db.transaction(async (tx) => {
    // ... existing audit_entry + blackboard_snapshot + goals upserts ...

    // NEW v2.0: persist all conflicts emitted this tick
    for (const c of input.tick_conflicts ?? []) {
      await tx.insert(conflicts).values({ ... }).onConflictDoNothing();
    }
  });
}
```

## 11. Voice fingerprint canonical specification

### 11.1 The single source of truth

NEW file: `packages/agent/src/comprehension/voice/fingerprint.ts`

Owns:
- `FUNCTION_WORDS_64` — the canonical 64-word list, alphabetical, immutable.
- `COORDINATORS`, `CONNECTORS`, `INTENSIFIERS`, `HEDGES` — canonical sets.
- `compute_fingerprint(text: string): number[]` — returns a 128-dim L2-normalized vector.
- `tokenize(text: string): string[]`
- `split_sentences(text: string): string[]`
- `voice_drift_cosine(a: readonly number[], b: readonly number[]): number` — moved from `eval/src/metrics/voice-drift.ts` to here so it's reusable across packages.
- `VOICE_FINGERPRINT_DIM = 128` — the constant.

### 11.2 Dimension semantics (frozen)

```
Index   Semantic
0..63   FUNCTION_WORDS_64[i] relative frequency in tokens
64..71  Sentence-length stat raw (mean, std, p10, p25, p50, p75, p90, count)
72..79  Sentence-length stat squared
80..87  Sentence-length stat log1p
88..95  Sentence-length stat sqrt
96..99  COORDINATORS density (per_1000, log1p, per_sentence, per_sqrt_token)
100..103 CONNECTORS density (same 4)
104..107 INTENSIFIERS density (same 4)
108..111 HEDGES density (same 4)
112..115 TTR (raw, sq, log1p, sqrt)
116..119 hapax_ratio (same 4)
120..123 avg_token_len (same 4)
124..127 capitalization_rate (same 4)
```

### 11.3 The function-word list (immutable)

```ts
export const FUNCTION_WORDS_64: readonly string[] = [
  'a', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be',
  'been', 'but', 'by', 'can', 'do', 'down', 'even', 'every', 'for', 'from',
  'had', 'has', 'have', 'her', 'his', 'if', 'in', 'into', 'is', 'it',
  'its', 'may', 'more', 'must', 'my', 'no', 'not', 'now', 'of', 'on',
  'one', 'only', 'or', 'our', 'shall', 'should', 'so', 'some', 'such', 'than',
  'that', 'the', 'their', 'then', 'there', 'things', 'this', 'to', 'up', 'upon',
  'was', 'were', 'what', 'when',
];
```

### 11.4 Migration

- `comprehension/voice/extractor.ts` — DELETE local `FUNCTION_WORDS_64` and `compute_fingerprint`; IMPORT from `comprehension/voice/fingerprint.ts`.
- `specialists/voice-drift-monitor.ts` — DELETE local `FUNCTION_WORDS` (different list!) and inline `compute_fingerprint`; IMPORT from `comprehension/voice/fingerprint.ts`.
- `eval/src/metrics/voice-drift.ts` — DELETE; replace with re-export `export { voice_drift_cosine } from '@retune/agent/comprehension/voice/fingerprint';` (or keep a copy as a numerical-only utility for the eval harness; pick one and document).

### 11.5 Test

NEW: `packages/agent/tests/voice-fingerprint-canonical.test.ts`

```ts
test('extractor and drift monitor produce byte-identical fingerprints for same text', () => {
  const text = 'the quick brown fox jumps over the lazy dog. ...';
  const v_extractor = compute_fingerprint(text);   // imported from fingerprint.ts
  // The drift monitor's per-bullet fingerprint must equal the extractor's per-bullet fingerprint:
  const v_drift = compute_fingerprint(text);
  assert.equal(v_extractor.length, 128);
  assert.equal(v_drift.length, 128);
  for (let i = 0; i < 128; i++) {
    assert.ok(Math.abs(v_extractor[i]! - v_drift[i]!) < 1e-12);
  }
});

test('voice_drift_cosine is 1.0 for identical text', () => {
  const text = '...';
  const v = compute_fingerprint(text);
  assert.ok(Math.abs(voice_drift_cosine(v, v) - 1.0) < 1e-9);
});

test('voice_drift_cosine is high for paraphrase, low for different style', () => {
  const v_baseline = compute_fingerprint(BASELINE_PROFILE);
  const v_similar = compute_fingerprint(BASELINE_PROFILE + ' Additional sentence.');
  const v_different = compute_fingerprint(VERY_DIFFERENT_VOICE_TEXT);
  const sim_to_paraphrase = voice_drift_cosine(v_baseline, v_similar);
  const sim_to_different = voice_drift_cosine(v_baseline, v_different);
  assert.ok(sim_to_paraphrase > 0.85);
  assert.ok(sim_to_different < 0.65);
});
```

## 12. Web build correctness

### 12.1 The bug

`apps/web/src/app/api/onboarding/upload/route.ts:109`:

```ts
const { assembleSystemPrompt } = await import('@retune/agent');   // BAD
```

This dynamic import resolves through `packages/agent/src/index.ts` → `sota-exports.ts` → `temporal/index.ts` → `temporal/worker.ts`, which transitively imports `@temporalio/worker` whose webpack-bundled fallback wants `@swc/wasm` (not installed).

### 12.2 The fix

Replace with the safe export:

```ts
const { assembleSystemPrompt } = await import('@retune/agent/web');
```

`@retune/agent/web` is `packages/agent/src/web-exports.ts` which deliberately omits `temporal/worker`.

### 12.3 Vitest mocks

8 web vitest files mock `@retune/agent`:

```ts
vi.mock('@retune/agent', () => ({ ... }));   // BAD — also pulls Temporal worker into the Vitest module graph
```

Replace with:

```ts
vi.mock('@retune/agent/web', () => ({ ... }));
```

In each of:
- `apps/web/src/app/api/monitoring/__tests__/stats.route.test.ts:7,28,57`
- `apps/web/src/app/api/onboarding/__tests__/message.route.test.ts:25`
- `apps/web/src/app/api/onboarding/__tests__/message.extra.test.ts:27`
- `apps/web/src/app/api/onboarding/__tests__/upload.extra.test.ts:40`
- `apps/web/src/app/api/generate/__tests__/stream.docx.test.ts:33,234,269,315,352,386,423,459`

### 12.4 Acceptance

```sh
pnpm --filter @retune/web build       # exits 0, no @swc/wasm error
pnpm --filter @retune/web test --run  # 0 failures
```

## 13. Anthropic SDK lazy initialization

### 13.1 The bug

`packages/agent/src/lib/providers/anthropic/index.ts:25`:

```ts
const sdkClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

Top-level. Runs at module load. In jsdom (vitest default env), the Anthropic SDK detects a "browser-like" runtime (presence of `window`) and throws unless `dangerouslyAllowBrowser: true`. Throws break 130/389 web vitest tests.

### 13.2 The fix

```ts
let _sdkClient: Anthropic | null = null;
function getSdkClient(): Anthropic {
  if (!_sdkClient) {
    _sdkClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _sdkClient;
}
```

Replace every `sdkClient.X(...)` call site with `getSdkClient().X(...)`.

This mirrors the existing OpenAI provider pattern (`providers/openai/index.ts:18-21`).

### 13.3 Bonus: also handle the case where API key is missing

```ts
function getSdkClient(): Anthropic {
  if (!_sdkClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new LlmError(
        'ANTHROPIC_API_KEY not set; set AI_PROVIDER=openai or provide an Anthropic key',
        'auth_failed',
        'anthropic',
      );
    }
    _sdkClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _sdkClient;
}
```

This way, modules can load without the key (for tests), and only at first LLM call do we throw a typed error.

### 13.4 Acceptance

- Module load in jsdom does not throw.
- Web vitest 0 failures.
- Calling Anthropic without `ANTHROPIC_API_KEY` throws a `LlmError` with `kind: 'auth_failed'`.

## 14. Eval harness with `--live` mode

### 14.1 Three modes

```sh
# Default: --mock
pnpm --filter @retune/eval eval

# Mock — uses prompt-hash-keyed fixture cache; deterministic
pnpm --filter @retune/eval eval --mock

# Live — runs the real agent with provider chosen by AI_PROVIDER env
AI_PROVIDER=anthropic pnpm --filter @retune/eval eval --live
AI_PROVIDER=openai    pnpm --filter @retune/eval eval --live

# Canonical-vs-expert (legacy v1.0) — kept for canonical-set sanity check
pnpm --filter @retune/eval eval --canonical-vs-expert
```

### 14.2 Fixture cache (--mock mode)

`packages/eval/src/fixtures/llm-fixtures/{provider}/<prompt-hash>.json`

For each LLM call:
1. Compute `sha256(serialized_prompt)` deterministically.
2. Look up fixture file. If absent, fail with "missing fixture; run `--live --record` to populate".
3. If present, return the fixture as the LLM response.

### 14.3 `--record` flag

```sh
AI_PROVIDER=anthropic pnpm --filter @retune/eval eval --live --record
```

Runs the agent in `--live` mode AND writes every LLM response to its prompt-hash-keyed file. After this, subsequent `--mock` runs are deterministic. Re-recording is required when prompts change.

### 14.4 Implementation outline

`packages/eval/src/runner.ts` v2.0:

```ts
interface EvalOptions {
  baseline_only?: boolean;
  mode: 'mock' | 'live' | 'canonical-vs-expert';
  record?: boolean;
  json?: boolean;
}

async function run(opts: EvalOptions): Promise<void> {
  const cases = load_canonical();

  if (opts.baseline_only) {
    return print_baseline(cases);
  }

  if (opts.mode === 'canonical-vs-expert') {
    return run_canonical_vs_expert(cases);
  }

  // mock or live
  const provider = opts.mode === 'live'
    ? get_real_provider()
    : new FixtureBackedProvider({ record: opts.record });

  const per_case_results: Array<CaseResult> = [];
  for (const c of cases) {
    const result = await run_agent_against_case(c, provider);
    per_case_results.push(result);
  }

  const summary = aggregate_eval_results(per_case_results);
  const gate = evaluate_launch_criteria(summary);

  if (opts.json) console.log(JSON.stringify({ summary, gate }, null, 2));
  else print_human_report(summary, gate);

  process.exit(gate.passed ? 0 : 1);
}
```

`run_agent_against_case` builds a fresh `Blackboard`, seeds the entry-point goals, runs the orchestrator with all 18 specialists registered (via `build_fresh_substrate`), and returns the resulting blackboard + verdict for scoring.

### 14.5 Acceptance

- `pnpm --filter @retune/eval eval --baseline-only` reports 200 cases.
- `pnpm --filter @retune/eval eval --mock` runs in < 30s for the full set.
- `AI_PROVIDER=anthropic pnpm --filter @retune/eval eval --live` runs in < 30 minutes for the full set.
- Both `--mock` and `--live` print the same launch criteria gate result on the same canonical set (within fixture freshness; if fixtures are stale, `--mock` reports it).
- Verdict agreement between `AI_PROVIDER=anthropic --live` and `AI_PROVIDER=openai --live` ≥ 95% (PRD 2.0 §10.4 launch gate).

## 15. Test pyramid

### 15.1 Unit tests — `tests/<specialist>.test.ts`

One file per specialist. Every test:
- Builds a fresh blackboard with hand-crafted hypotheses.
- Hand-crafts the goal payload.
- Runs the specialist directly (not via orchestrator).
- Asserts blackboard writes, audit entry shape, and child-goal emissions.

Coverage target: every specialist has ≥ 5 unit tests covering happy path, missing-input refusal, edge cases, error path, idempotency.

### 15.2 Integration tests — `tests/<flow>.test.ts`

Cover specialist-to-specialist chains. Examples (existing or to-add):
- `discourse-pipeline.test.ts` — classifier → stripper → calibrator
- `gap-mapper-solver.test.ts` — gap mapper → evidence solver
- `narrative-bullet-composer.test.ts` — arc proposer → bullet composer
- `voice-honesty-credibility.test.ts` — voice + honesty + credibility
- **NEW v2.0**: `tests/full-pipeline-e2e.test.ts` — end-to-end with mocked LLM:

```ts
test('full pipeline: JD + profile → ship verdict', async () => {
  const blackboard = ...;
  const goal_stack = ...;
  const registry = build_full_registry({ ml_client: mockMLClient(), provider: mockProvider() });
  const orchestrator = new Orchestrator({ blackboard, goal_stack, registry, ... });

  goal_stack.add({ kind: 'analyze_jd', ... });
  goal_stack.add({ kind: 'analyze_company', ... });
  goal_stack.add({ kind: 'extract_spans', ..., payload: { text: JD_TEXT, source_doc_kind: 'jd' } });
  goal_stack.add({ kind: 'extract_spans', ..., payload: { text: PROFILE_TEXT, source_doc_kind: 'profile' } });
  goal_stack.add({ kind: 'extract_voice_fingerprint', ... });
  goal_stack.add({ kind: 'calibrate_honesty', ... });

  const result = await orchestrator.run({ max_ticks: 64 });

  // Chain progressed all the way to the gate
  const snap = blackboard.snapshot();
  assert.ok(snap.hypotheses.role_schema);
  assert.ok(snap.hypotheses.discourse_map);
  assert.ok(snap.hypotheses.gap_map);
  assert.ok(snap.hypotheses.solver_solution);
  assert.ok(snap.hypotheses.narrative_arcs_candidates.length >= 3);
  assert.ok(snap.hypotheses.recruiter_belief_state);
  assert.ok(snap.hypotheses.chosen_narrative_arc);
  assert.ok(Object.keys(snap.draft.bullets).length >= 6);
  assert.ok(snap.outcome_estimate);
  assert.ok(snap.hypotheses.ship_decision);
  assert.ok(snap.hypotheses.gdpr_audit_packet);
  assert.equal(snap.hypotheses.ship_decision.verdict, 'ship');
  assert.equal(result.termination, 'no_open_work');
});
```

### 15.3 Provider parity tests — `tests/provider-parity/`

See §4.4.

### 15.4 Cross-language E2E — `tests/cross-lang-e2e.test.ts`

Covers HTTP + gRPC paths to the Python ML server. Existing v1.0 tests carry forward.

### 15.5 Heavy CI

Real DeBERTa + GLiNER + BGE. Gated behind `run-heavy` PR label or nightly schedule. Existing v1.0 job carries forward.

### 15.6 Web vitest

`apps/web` Next.js + tRPC routes. Currently 130 failures; target 0.

### 15.7 Specialist-registration-parity test (NEW v2.0)

`tests/specialist-registration-parity.test.ts`:

```ts
import { build_full_registry as api_registry } from '@retune/api/runtime/workbench-runtime';
import { build_registry as temporal_registry } from '@retune/agent/temporal/activities/substrate';

test('every specialist registered in API runtime is also registered in Temporal substrate', () => {
  const api_ids = api_registry({...mockDeps}).list_specialist_ids();
  const temporal_ids = temporal_registry({...mockDeps}).list_specialist_ids();
  assert.deepEqual(api_ids.sort(), temporal_ids.sort());
});

test('no two specialists handle the same goal kind', () => {
  const r = api_registry({...mockDeps});
  const goal_kinds_to_specialists = new Map<string, string[]>();
  for (const id of r.list_specialist_ids()) {
    const sp = r.get(id)!;
    for (const kind of sp.handles_goal_kinds) {
      const existing = goal_kinds_to_specialists.get(kind) ?? [];
      existing.push(id);
      goal_kinds_to_specialists.set(kind, existing);
    }
  }
  for (const [kind, ids] of goal_kinds_to_specialists) {
    assert.equal(ids.length, 1, `Goal kind "${kind}" handled by multiple: ${ids.join(', ')}`);
  }
});
```

This is the static safety net for issue #1, #3, and the entire "drift" class of bugs.

## 16. CI matrix

`.github/workflows/cognitive-cycle.yml` v2.0:

```yaml
jobs:
  test-ts:
    strategy:
      matrix:
        ai_provider: [anthropic, openai]
        ml_use_stubs: [true, false]
        node_version: ['22']
    env:
      AI_PROVIDER: ${{ matrix.ai_provider }}
      RETUNE_ML_USE_STUBS: ${{ matrix.ml_use_stubs }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_TEST }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_TEST }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r exec tsc --noEmit
      - run: pnpm test
      - run: pnpm --filter @retune/eval eval --mock

  test-python:
    runs-on: ubuntu-latest
    steps: [...]   # apps/ml pytest

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @retune/web test --run
      - run: pnpm --filter @retune/web build

  cognitive-cycle-heavy:
    if: contains(github.event.pull_request.labels.*.name, 'run-heavy') || github.event_name == 'schedule'
    needs: [test-ts, test-python]
    steps: [...]   # heavy real-models cross-lang E2E

  eval-live-nightly:
    if: github.event_name == 'schedule'
    strategy:
      matrix:
        ai_provider: [anthropic, openai]
    env:
      AI_PROVIDER: ${{ matrix.ai_provider }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY_PROD }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY_PROD }}
    steps:
      - run: pnpm --filter @retune/eval eval --live
      - if: failure()
        uses: # post Slack alert: "live eval regressed on ${{ matrix.ai_provider }}"
```

Acceptance: matrix runs on every PR; both providers must pass.

## 17. Dead-code audit

### 17.1 `packages/agent/src/openai-agents/`

A separate orchestrator built around the OpenAI Agents SDK. Used by the legacy `apps/web` pipeline (`apps/web/src/app/api/generate/[id]/stream/route.ts`).

**v2.0 decision**: KEEP. It's the legacy resume generator that the existing `apps/web` UI consumes. The new cognitive cycle (`@retune/agent` proper) will replace it in v2.1 when the web UI is rebuilt. Document its scope in `technical-2.0.md` §3.3:

> `packages/agent/src/openai-agents/` is the legacy structured-output pipeline used by the v1 web UI. It is independent of the cognitive cycle. v2.1 will deprecate it once the new web UI lands.

### 17.2 `apps/web/src/app/api/onboarding/__tests__/upload.route.test.ts` and friends

These test the legacy onboarding pipeline. They use vitest mocks of `@retune/agent`. v2.0 fixes the mocks to use `@retune/agent/web`. They are NOT dead code.

### 17.3 `packages/agent/src/lib/anthropic.ts`

The legacy shim that translates `LegacyParams` to `MessageParams`. Specialists still call `createMessageWithTool` from this shim (which delegates to `getProvider()`). The shim is alive but the comment is misleading — it's no longer Anthropic-specific. v2.0 renames the file to `lib/legacy-shim.ts` and updates imports. Backwards-compatible re-export from `lib/anthropic.ts` for any external consumer.

### 17.4 No other dead code

`grep -r 'TODO|FIXME|XXX|HACK' packages/agent/src/` shows ~40 hits. All are documentation hints, not abandoned code. Acceptance: zero `XXX|HACK` remaining after v2.0 cleanup pass.

## 18. Operational readiness

### 18.1 One-command dev

`package.json` root v2.0:

```json
{
  "scripts": {
    "dev": "concurrently --names 'api,web,worker,ml' --prefix-colors 'cyan,magenta,yellow,green' --kill-others-on-fail 'pnpm --filter @retune/api dev' 'pnpm --filter @retune/web dev' 'pnpm --filter @retune/worker dev' 'cd apps/ml && uvicorn retune_ml.main:app --port 8001 --reload'",
    "dev:lite": "concurrently --names 'api,web' 'pnpm --filter @retune/api dev' 'pnpm --filter @retune/web dev'"
  }
}
```

`dev` requires Postgres + Temporal locally (Docker compose).
`dev:lite` runs api + web only with pglite + in-process orchestrator + ML stubs. Useful for frontend-only work.

### 18.2 Docker compose

`docker-compose.yml` v2.0:

```yaml
services:
  postgres:
    image: postgres:16
    ports: ['5432:5432']
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: retune
  temporal:
    image: temporalio/auto-setup:1.24
    ports: ['7233:7233', '8088:8088']
    environment:
      DB: postgresql
      DB_PORT: 5432
      POSTGRES_USER: postgres
      POSTGRES_PWD: dev
      POSTGRES_SEEDS: postgres
    depends_on: [postgres]
  ml:
    build: ./apps/ml
    ports: ['8001:8001', '50051:50051']
    environment:
      RETUNE_ML_USE_STUBS: 'true'  # default; set to false to use real models
```

`pnpm dev` assumes these are running.

### 18.3 `.env.example` v2.0

```bash
# LLM provider
AI_PROVIDER=anthropic   # or openai
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
AGENT_MODEL=claude-sonnet-4-6
AGENT_MODEL_FAST=claude-haiku-4-5
AGENT_MODEL_FRONTIER=claude-opus-4-1

# Persistence
RETUNE_PERSIST=pglite   # pglite | postgres
RETUNE_DATABASE_URL=postgresql://postgres:dev@localhost:5432/retune

# Temporal
RETUNE_TEMPORAL=0   # 0 = in-process orchestrator | 1 = Temporal worker
RETUNE_TEMPORAL_ADDRESS=localhost:7233
RETUNE_TEMPORAL_NAMESPACE=default

# ML server
RETUNE_ML_HTTP_BASE=http://localhost:8001
RETUNE_ML_GRPC_BASE=http://localhost:50051
RETUNE_ML_USE_STUBS=true
RETUNE_ML_MODEL_CACHE_DIR=~/.cache/retune-ml

# Auth (apps/web)
AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Billing (apps/web)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# API
API_PORT=8787
WEB_PORT=3000
ML_PORT=8001
```

### 18.4 Production deployment

- Frontend: Vercel (apps/web Next.js).
- API: Railway (apps/api Hono Node 22).
- Worker: Railway (apps/worker Temporal worker Node 22).
- ML: Modal or Replicate (apps/ml; needs GPU for real DeBERTa/GLiNER inference at scale; CPU fine for stub mode).
- Postgres: Neon.
- Temporal: Temporal Cloud.

### 18.5 RUNBOOK.md

NEW: `RUNBOOK.md` at repo root. Contains:
- "Generation stuck mid-flight" — query Temporal UI, find workflow, terminate.
- "Cost runaway" — set lower `BUDGET_HARD_KILL_USD` env, redeploy, the controller picks it up next request.
- "Switch AI_PROVIDER live" — set env on api+worker via Railway dashboard, restart pods. Existing in-flight workflows continue with their started provider.
- "Bypass refuse-or-ship gate" — emergency only; set `RETUNE_BYPASS_REFUSE_GATE=1` on api+worker for 1 hour max; logs all bypassed generations to `incidents` table.
- "Postgres failover" — Neon handles automatically; if manual, update `RETUNE_DATABASE_URL` on all services.
- "ML server down" — falls back to stubs automatically when `RETUNE_ML_USE_STUBS=auto` (NEW v2.0); document this env var.

## 19. Migration plan — exact patches per file

### 19.1 Files to create

| Path | Lines | Reason |
|---|---|---|
| `packages/agent/src/comprehension/voice/fingerprint.ts` | ~250 | Canonical voice fingerprint module (issue #5) |
| `packages/agent/src/lib/llm-error.ts` | ~30 | Typed `LlmError` (§4.5) |
| `packages/agent/tests/full-pipeline-e2e.test.ts` | ~200 | Integration test (issue #1, #2) |
| `packages/agent/tests/specialist-registration-parity.test.ts` | ~80 | Static safety net (issue #1, #3) |
| `packages/agent/tests/voice-fingerprint-canonical.test.ts` | ~60 | Voice fingerprint correctness (issue #5) |
| `packages/agent/tests/listener-conflict-persistence.test.ts` | ~100 | Persistence of listener concerns (issue #7) |
| `packages/agent/tests/provider-parity/bullet-composer.test.ts` | ~80 | Provider parity (§4.4) |
| `packages/agent/tests/provider-parity/narrative-arc-proposer.test.ts` | ~80 | same |
| `packages/agent/tests/provider-parity/critic-ensemble.test.ts` | ~80 | same |
| `packages/agent/tests/provider-parity/theory-of-mind.test.ts` | ~80 | same |
| `packages/db/migrations/0010_conflicts_and_gdpr_packets.sql` | ~30 | New tables (§10.2) |
| `packages/eval/src/fixtures/llm-fixtures/anthropic/.gitkeep` | 0 | Mock fixture cache |
| `packages/eval/src/fixtures/llm-fixtures/openai/.gitkeep` | 0 | Mock fixture cache |
| `packages/eval/src/fixture-provider.ts` | ~120 | `FixtureBackedProvider` for `--mock` mode |
| `packages/eval/src/canonical/cases.jsonl` | +186 lines | Eval corpus expansion (issue #14) |
| `RUNBOOK.md` | ~150 | Production runbook |
| `prd-2.0.md` | ~700 | Product contract (this file) |
| `technical-2.0.md` | ~1500 | Engineering contract (this file) |

### 19.2 Files to modify

#### `apps/api/src/runtime/workbench-runtime.ts`

PATCH:
- Import all 12 new specialists + 2 listeners from `@retune/agent`.
- Register all 14 cognitive specialists in the registry.
- Subscribe `VoiceDriftMonitor`, `WellBeingMonitor` to bus.
- Wire `ConflictStagingQueue`, pass to listeners and orchestrator.
- Replace goal-seeding block per §7.4.

DELTA: ~120 lines.

#### `packages/agent/src/temporal/activities/substrate.ts`

PATCH:
- Same as workbench-runtime.ts above.
- Already mostly correct in v1.0; just align with API runtime per parity test.
- Pass `ConflictStagingQueue` through.

DELTA: ~40 lines.

#### `packages/agent/src/comprehension/voice/extractor.ts`

PATCH:
- DELETE `FUNCTION_WORDS_64`, `compute_fingerprint`, `tokenize`, `split_sentences`, helper math functions.
- IMPORT from `comprehension/voice/fingerprint.ts`.

DELTA: -200 lines, +5 lines (imports).

#### `packages/agent/src/specialists/voice-drift-monitor.ts`

PATCH:
- DELETE local `FUNCTION_WORDS` (the wrong one).
- DELETE local cohesion-marker sets.
- DELETE inline `compute_fingerprint`.
- IMPORT from `comprehension/voice/fingerprint.ts`.

DELTA: -170 lines, +5 lines.

#### `packages/agent/src/specialists/theory-of-mind.ts`

PATCH:
- Change `HANDLES = ["select_arc"]` → `HANDLES = ["model_recruiter_beliefs"]`.
- Update docstring.

DELTA: -1 line, +1 line.

#### `packages/agent/src/specialists/narrative-arc-proposer.ts`

PATCH:
- After `propose_arcs` writes, emit BOTH `model_recruiter_beliefs` AND `select_arc` as child goals (priority of `model_recruiter_beliefs` higher so it runs first).

DELTA: ~15 lines.

#### `packages/agent/src/specialists/{bullet-composer,critic-ensemble,narrative-arc-proposer,theory-of-mind}.ts`

PATCH:
- Replace `MODELS.smart` → `getModels().smart`.
- Replace `MODELS.fast` → `getModels().fast`.
- Replace any future `MODELS.frontier` references.
- Add `import { getModels } from '../lib/anthropic';` (or rename `lib/legacy-shim`).

DELTA: ~10 lines per file × 4 files = 40 lines.

#### `packages/agent/src/lib/providers/anthropic/index.ts`

PATCH:
- Convert top-level `new Anthropic({apiKey})` to `getSdkClient()` lazy pattern (§13).

DELTA: ~10 lines.

#### `packages/agent/src/specialists/fairness-monitor.ts`

PATCH:
- Add `conflict_staging: ConflictStagingQueue` constructor param.
- In `on_event`, after detecting a concern, call `this.conflict_staging.push(conflict)`.

DELTA: ~10 lines.

#### `packages/agent/src/specialists/voice-drift-monitor.ts`, `well-being-monitor.ts`

Same conflict-staging integration as FairnessMonitor.

DELTA: ~10 lines per file × 2 files.

#### `packages/agent/src/workbench/orchestrator.ts`

PATCH:
- Add `conflict_staging?: ConflictStagingQueue` to `OrchestratorDeps`.
- At the top of each tick, call `this.deps.conflict_staging?.drain()` and commit them.

DELTA: ~30 lines.

#### `packages/agent/src/persistence/postgres-persistence.ts`

PATCH:
- Add `record_conflict`, `record_gdpr_packet`, `load_gdpr_packet` methods.
- In `persist_tick`, persist conflicts emitted by the tick.

DELTA: ~80 lines.

#### `packages/db/src/pg/schema.ts`

PATCH:
- Add `conflicts` and `gdpr_packets` table definitions.

DELTA: ~40 lines.

#### `apps/web/src/app/api/onboarding/upload/route.ts:109`

PATCH:
- `await import('@retune/agent')` → `await import('@retune/agent/web')`.

DELTA: 1 line.

#### `apps/web/src/app/api/**/__tests__/*.test.ts` (8 files)

PATCH:
- `vi.mock('@retune/agent', ...)` → `vi.mock('@retune/agent/web', ...)`.

DELTA: ~16 lines total.

#### `packages/agent/tests/mapper-evidence-map.test.ts`

PATCH:
- Lines 28, 39: `assert.deepEqual(parsed.data.roleToRequirementsMap, {})` → `assert.deepEqual(parsed.data.roleToRequirementsMap, [])`.

DELTA: 2 lines.

#### `apps/api/tests/api-smoke.test.ts:178`

PATCH:
- `assert.equal(replayed.audit_entries.length, 2)` → `assert.ok(replayed.audit_entries.length >= 2)`.

DELTA: 1 line.

#### `packages/agent/src/specialists/evidence-solver.ts:21-26`

PATCH:
- Update docstring from "MaxSAT" → "branch-and-bound with constraint propagation".

DELTA: ~5 lines.

#### `package.json` (root)

PATCH:
- Add `dev` and `dev:lite` scripts (§18.1).

DELTA: ~5 lines.

#### `.env.example`

PATCH: rewrite per §18.3.

DELTA: replace.

#### `docker-compose.yml`

PATCH: rewrite per §18.2.

DELTA: replace.

#### `.github/workflows/cognitive-cycle.yml`

PATCH: add matrix strategy per §16.

DELTA: ~50 lines.

### 19.3 Files to delete

| Path | Reason |
|---|---|
| `packages/eval/src/metrics/voice-drift.ts` | Logic moved into `comprehension/voice/fingerprint.ts`; replace with re-export OR delete and update consumers. |

### 19.4 Total churn

| Category | New | Modified | Deleted | Net |
|---|---|---|---|---|
| Source code | ~750 | ~330 | ~370 | +710 |
| Tests | ~860 | ~3 | 0 | +863 |
| Migrations | 30 | 0 | 0 | +30 |
| Eval fixtures | ~3000 (200 cases) | 0 | 0 | +3000 |
| Documentation | ~2200 | 0 | 0 | +2200 |
| CI / config | ~150 | ~20 | 0 | +170 |

Roughly: **~5000 LoC of code + 3000 LoC of fixtures + 2200 lines of docs**.

## 20. Per-phase acceptance gates

### Phase 1 — Provider parity

- [ ] `packages/agent/src/lib/providers/anthropic/index.ts` uses `getSdkClient()` lazy pattern.
- [ ] All 4 LLM specialists call `getModels()` instead of `MODELS`.
- [ ] `getModels().frontier` tier added.
- [ ] `tests/provider-parity/*.test.ts` (4 files) all pass with both providers.
- [ ] `AI_PROVIDER=openai pnpm --filter @retune/agent test` exits 0.
- [ ] `AI_PROVIDER=anthropic pnpm --filter @retune/agent test` exits 0.

### Phase 2 — Wiring fix

- [ ] `apps/api/src/runtime/workbench-runtime.ts` registers all 14 specialists + 3 listeners.
- [ ] `packages/agent/src/temporal/activities/substrate.ts` registers same set.
- [ ] `tests/specialist-registration-parity.test.ts` green.
- [ ] `tests/full-pipeline-e2e.test.ts` green (mocked LLM, completes ship verdict in < 5s).
- [ ] `TheoryOfMindSpecialist.handles_goal_kinds` is `["model_recruiter_beliefs"]`.
- [ ] `model_recruiter_beliefs` is in `GoalKindSchema`.
- [ ] Goal-seeding chain matches §7.1 exactly (verified by integration test).

### Phase 3 — Correctness bugs

- [ ] `packages/agent/src/comprehension/voice/fingerprint.ts` is the single source of truth.
- [ ] `tests/voice-fingerprint-canonical.test.ts` green.
- [ ] `eval/voice-drift.ts` re-exports from agent or is deleted.
- [ ] `ConflictStagingQueue` wired to all 3 listeners.
- [ ] Orchestrator drains queue at start of each tick.
- [ ] `tests/listener-conflict-persistence.test.ts` green.
- [ ] `conflicts` and `gdpr_packets` tables migrated.

### Phase 4 — Web app build + vitest

- [ ] `pnpm --filter @retune/web build` exits 0.
- [ ] `pnpm --filter @retune/web test --run` reports 0 failures.

### Phase 5 — Stale tests + dead code

- [ ] `pnpm --filter @retune/agent test` reports 0 failures.
- [ ] `pnpm --filter @retune/api test` reports 0 failures.
- [ ] Docstring updates committed (EvidenceSolver, voice-drift metric).
- [ ] `lib/anthropic.ts` renamed to `lib/legacy-shim.ts` (with re-export shim) OR documentation updated.

### Phase 6 — Eval `--live` + 200 cases

- [ ] `cases.jsonl` has 200 lines.
- [ ] All 200 cases pass `--baseline-only` schema validation.
- [ ] `--mock` mode works against fixture cache.
- [ ] `--live` mode runs the agent and produces a launch-criteria-gate result.
- [ ] Provider verdict agreement on canonical set ≥ 95% (`--live` × `AI_PROVIDER` × 2).

### Phase 7 — Operational readiness

- [ ] `pnpm dev` boots full stack from clean checkout in < 2 min.
- [ ] `RUNBOOK.md` reviewed by ops.
- [ ] `.env.example` documents every required var.
- [ ] `docker-compose.yml` brings up postgres + temporal + ml.

### Phase 8 — CI matrix

- [ ] `.github/workflows/cognitive-cycle.yml` has matrix on `[anthropic, openai] × [stub, real-ml]`.
- [ ] All matrix combinations green on a sample PR.
- [ ] `eval-live-nightly` job scheduled.

## Appendix A — Goal kind enumeration v2.0

```ts
export const GoalKindSchema = z.enum([
  // Comprehension
  'analyze_jd',
  'analyze_profile',
  'analyze_company',
  'extract_spans',
  'classify_discourse',
  'strip_discourse_boilerplate',
  'calibrate_cultural_vector',

  // Reflection
  'extract_voice_fingerprint',
  'calibrate_honesty',
  'scan_credibility',
  'audit_fairness',

  // Strategy
  'map_gaps',
  'solve_evidence',

  // Production
  'propose_arcs',
  'select_arc',
  'compose_resume',
  'compose_cover_letter',         // deferred to v2.1
  'compose_linkedin_about',       // deferred to v2.1
  'compose_outreach',             // deferred to v2.1

  // Critique
  'model_recruiter_beliefs',      // NEW v2.0

  // Decision
  'estimate_outcome',
  'decide_refuse_or_ship',
  'render_documents',             // deferred to v2.1

  // Meta — affect / motivation (NEW v2.0; see §24)
  'infer_emotional_state',        // NEW v2.0 — EmotionalStateModeler
  'compute_mood_fingerprint',     // NEW v2.0 — MoodFingerprint (cron + on-demand)
  'update_motivation_modulator',  // NEW v2.0 — MotivationModulator (listener)

  // Meta — narration / metacognition
  'narrate_layer',                // NEW v2.0 — Narrator emits per-layer paragraphs
  'request_user_input',           // ActiveQuestionHandler
  'resolve_conflict',             // deferred to v2.1
]);
```

## Appendix B — Conflict monitor enumeration v2.0

```ts
export const ConflictMonitorSchema = z.enum([
  'coherence',
  'number_plausibility',
  'scope_vs_title',
  'repetition',
  'voice_drift',
  'novelty_ood',
  'threat_prompt_injection',
  'well_being',
  'cost_runaway',
  'fabrication',
  'fairness_concern',
  'critic_divergence',            // NEW v2.0 (CriticEnsemble emits)
  'hidden_disqualifier_blocker',  // NEW v2.0 (RefuseOrShipGate emits)
]);
```

## Appendix C — Brain region tag map

Canonical tags consumed by `<BrainHeatmap />` region IDs (§28.1). Every entry's region phrase resolves to one or more SVG region IDs from §28.1.

| Brain region | Specialist | Layer | SVG region IDs |
|---|---|---|---|
| DLPFC tick loop | `Orchestrator` | substrate | `dlpfc` |
| RAS / amygdala (cost kill) | `BudgetController` | substrate | `ras`, `amygdala` |
| Angular gyrus (canonical resolution) | `TitleSchemaRetriever`, `CompanySchemaRetriever` | comprehension | `angular_gyrus` |
| Temporal cortex (entity recognition) | `JdSpanExtractor` | comprehension | `temporal` |
| Wernicke's (lexical/discourse) | `DiscourseClassifier` | comprehension | `wernicke` |
| ACC (irrelevant-info suppression) | `BoilerplateStripper` | comprehension | `acc` |
| Right TPJ + STS (cultural inference) | `CulturalCalibrator` | comprehension | `tpj_right`, `sts` |
| Broca's + arcuate fasciculus (writing-style imprint) | `VoiceFingerprintExtractor` | reflection | `broca`, `arcuate` |
| Orbitofrontal cortex (trust valuation) | `HonestyCalibrator` | reflection | `ofc` |
| STS + ACC (implicit-cue inference) | `CredibilityScanner` | reflection | `sts`, `acc` |
| DLPFC (working memory) | `GapMapper` | strategy | `dlpfc` |
| DLPFC + premotor (planning under constraints) | `EvidenceSolver` | strategy | `dlpfc`, `premotor` |
| Default mode network (narrative imagination) | `NarrativeArcProposer` | production | `dmn` |
| TPJ + right STS (mental state attribution) | `TheoryOfMindSpecialist` | critique | `tpj_right`, `sts` |
| TPJ + ACC (theory of mind trio + dissent) | `CriticEnsemble` | critique | `tpj_right`, `acc` |
| Broca's + premotor + cerebellum (sequential production) | `SequentialBulletComposer` | production | `broca`, `premotor`, `cerebellum` |
| Ventromedial PFC + frontopolar (value-based decision + uncertainty) | `OutcomePredictor` | decision | `vmpfc`, `frontopolar` |
| Locus coeruleus + amygdala + frontopolar (meta-cognitive gate) | `RefuseOrShipGate` | decision | `locus_coeruleus`, `amygdala`, `frontopolar` |
| Right vlPFC (cross-cutting bias detection) | `FairnessMonitor` (listener) | cross-cutting | `vlpfc_right` |
| Cerebellum (fine motor adjustment) | `VoiceDriftMonitor` (listener) | cross-cutting | `cerebellum` |
| Insula + vmPFC (interoception + valuation) | `WellBeingMonitor` (listener) | cross-cutting | `insula`, `vmpfc` |
| Insula + amygdala + vmPFC (affect inference) | `EmotionalStateModeler` | meta | `insula`, `amygdala`, `vmpfc` |
| Amygdala + insula + nucleus accumbens (limbic aggregate) | `MoodFingerprint` | meta | `amygdala`, `insula`, `nucleus_accumbens` |
| VTA + nucleus accumbens (dopaminergic RPE) | `MotivationModulator` | meta | `vta`, `nucleus_accumbens` |
| ACC + TPJ (active-question loop) | `ActiveQuestionHandler` | meta | `acc`, `tpj_right` |
| Broca's (left inferior frontal gyrus — narration) | `Narrator` | meta | `broca` |
| Primary motor (action selection) | API response writer + SSE emitter | substrate | `motor` |
| Hippocampus (episodic encoding) | `PostgresPersistence` | substrate | `hippocampus` |
| Corpus callosum (cross-lang transport) | `tests/cross-lang-e2e.test.ts` | infrastructure | `corpus_callosum` |
| Thalamus + cerebellum (cross-cortex transport) | `MLClient` (HTTP/gRPC) | infrastructure | `thalamus`, `cerebellum` |
| Hippocampal consolidation across processes | `runGenerationWorkflow` (Temporal) | infrastructure | `hippocampus` |

Cross-checked: every `BrainRegion` ID in §28.1 (26 IDs) is referenced by ≥ 1 row above. UX-3 (§29) verifies this in CI.

## Appendix D — Provider parity test cases

For each LLM-driven specialist (4 files in `tests/provider-parity/`):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anthropicProvider,
  openaiProvider,
} from '@retune/agent/lib/providers';

const FIXTURE = {
  // Hand-crafted canonical response that both providers should produce
  arcs: [...],
  // ...
};

test('SequentialBulletComposer behaves identically on both providers', async () => {
  const captures: Array<{ provider: string; writes: SpecialistResult['writes'] }> = [];

  for (const [name, provider] of [['anthropic', anthropicProvider], ['openai', openaiProvider]] as const) {
    // Mock the provider to return FIXTURE
    const orig = provider.createMessageWithTool;
    provider.createMessageWithTool = async () => FIXTURE as unknown;

    const composer = new SequentialBulletComposer();
    const blackboard = ...;
    const goal = ...;
    const result = await composer.run(makeCtx(blackboard), goal);

    captures.push({ provider: name, writes: result.writes });

    provider.createMessageWithTool = orig;
  }

  // Identical writes
  assert.deepEqual(
    captures[0]!.writes.map(w => ({ path: w.path, value: w.value })),
    captures[1]!.writes.map(w => ({ path: w.path, value: w.value })),
  );
});
```

---

## 21. UX implementation contract

PRD 2.0 §16–§19 specify *what* the UI must show. This section specifies *how* it is built so the cognitive cycle is faithfully reflected in code.

### 21.1 Frontend topology

Two web surfaces co-exist during the v2.0 → v2.1 transition; the cognitive contract is identical across both.

```
apps/
  web/                        Next.js 14 App Router (legacy carry-over). Build only fix in v2.0.
    src/app/(marketing)       Public pages.
    src/app/(authed)          Authed routes: /dashboard, /generate, /settings, /brain.
    src/app/api/              Edge/Node route handlers; SSE lives here.
  spa/                        NEW v2.1 — Vite + React 18 + shadcn/ui SPA. Stub package added in v2.0.
    src/routes/               File-based routing via TanStack Router.
    src/components/cognitive/ BrainHeatmap, GoalDag, TraceTimeline, ConfidenceDial, …
    src/components/ux/        Design-system primitives (Button, Card, Modal, …) — wraps shadcn/ui.
    src/store/                Zustand slices; one per cognitive concern.
    src/hooks/                useGenerationStream, useVoiceFingerprint, useEmotionalState.
    src/lib/sse/              Typed SSE client; auto-resume; backpressure.
packages/
  ui/                         NEW v2.0 — shared component library used by both apps/web and apps/spa.
    src/cognitive/            Cognitive-cycle widgets (only place BrainHeatmap, GoalDag, … live).
    src/primitives/           Buttons, inputs, dialogs (shadcn-derived).
    src/tokens/               Tailwind preset + design tokens (colors, spacing, motion).
    src/icons/                Lucide re-exports + brain-region SVGs.
    src/index.ts              Public surface: only re-exports; no Node-only deps.
```

`packages/ui` MUST be browser-pure: no `fs`, no `path`, no `@retune/agent` import. The cognitive widgets accept *plain JSON* props derived from SSE events; they do not import the agent runtime.

### 21.2 Design tokens (Tailwind preset)

`packages/ui/src/tokens/index.ts`:

```ts
export const tokens = {
  color: {
    // Surface palette — calm neutrals (Tailwind slate scale, locked).
    surface: { 0: '#ffffff', 1: '#f8fafc', 2: '#f1f5f9', 3: '#e2e8f0' },
    ink:     { 0: '#0f172a', 1: '#334155', 2: '#64748b', 3: '#94a3b8' },

    // Cognitive-state palette — bound to cycle layers; never mixed with brand colors.
    layer: {
      comprehension: '#3b82f6', // blue-500   — temporal lobe ingestion
      reflection:    '#a855f7', // purple-500 — Broca/Wernicke imprint
      strategy:      '#22c55e', // green-500  — DLPFC working memory
      production:    '#f59e0b', // amber-500  — premotor sequencing
      critique:      '#ef4444', // red-500    — TPJ + ACC dissent
      decision:      '#0ea5e9', // sky-500    — vmPFC valuation
    },

    // Conflict severity (matches `Conflict.severity` enum).
    severity: { low: '#facc15', medium: '#fb923c', high: '#dc2626' },

    // Affect palette (matches §24 emotion model). Used only for ambient cues, never decorative.
    affect: {
      calm:        '#10b981',
      engaged:     '#3b82f6',
      uncertain:   '#a3a3a3',
      strained:    '#f97316',
      distressed:  '#ef4444',
    },
  },
  motion: {
    // Activation pulse mirrors firing rate, not arbitrary animation.
    pulseFastMs: 280,   // hot specialist
    pulseSlowMs: 1200,  // ambient
    fadeMs:      180,
    crossfadeMs: 320,
    // Reduced-motion override: when prefers-reduced-motion, all pulses become opacity-only.
  },
  radius: { sm: 4, md: 8, lg: 16, pill: 9999 },
  type: {
    // System font; one weight axis. Optional 'Inter Variable' web font.
    base: 'Inter Variable, ui-sans-serif, system-ui, sans-serif',
    mono: 'JetBrains Mono, ui-monospace, monospace',
  },
} as const;
```

Constraints (lint-enforced via custom Tailwind plugin in `packages/ui/src/tokens/lint.ts`):
- No raw hex in component code; all colors must be referenced through `tokens.color.*` or the equivalent Tailwind class (e.g. `text-layer-strategy`).
- No `animate-*` decorative class on a node that does not represent a live cognitive event.
- All cognitive widgets must respect `prefers-reduced-motion`.

### 21.3 Component contracts (cognitive widgets)

All cognitive widgets are **pure projection components**: props in, JSX out, no global side effects, no fetches. The page binds them to live store slices.

#### 21.3.1 `<BrainHeatmap />`

```ts
// packages/ui/src/cognitive/BrainHeatmap.tsx
export interface BrainHeatmapProps {
  /** Active activations keyed by brain-region tag (Appendix C). */
  activations: Record<BrainRegion, ActivationLevel>;
  /** Optional: highlighted region from hover/keyboard nav. */
  focusedRegion?: BrainRegion;
  /** Click handler for accessibility / drill-down. */
  onSelect?: (r: BrainRegion) => void;
  /** Aggregate vs. live mode controls pulse cadence. */
  mode: 'live' | 'aggregate';
  /** Reduced-motion fallback: opacity-only updates. */
  reducedMotion?: boolean;
}

export type ActivationLevel = {
  intensity: number;     // 0..1 — last 1s firing rate normalised
  lastSpikeMs: number;   // monotonic timestamp
  neurotransmitter: NeurotransmitterTag; // §27 mapping
};
```

Implementation: a single `<svg>` with 26 `<g data-region="…">` groups (one per brain-region tag in Appendix C). Each group has a base fill bound to `--layer-color` and an `opacity` driven by `intensity`. A keyframe pulse (`pulseFastMs`) is applied only when `lastSpikeMs` is within the last 600ms.

Accessibility:
- `role="img"` with `aria-label` describing the most-recent specialist (`"Last activation: SequentialBulletComposer in premotor cortex, 240ms ago"`).
- Keyboard focusable; arrow keys move `focusedRegion` along a fixed cortical traversal order; `Enter` triggers `onSelect`.
- A `<table>` fallback (visually hidden, screen-reader only) lists every region with its current intensity.

#### 21.3.2 `<GoalDag />`

Force-directed DAG of goals; nodes are emitted via `goal_emitted` SSE events, edges from `parent_goal_id`. Node states: `pending | running | satisfied | abandoned | suppressed`. Layout is deterministic for the same generation (seed = `generation_id`). Hover surfaces the producing specialist + brain region. Width-bounded; horizontal scroll on overflow.

#### 21.3.3 `<TraceTimeline />`

Horizontal timeline of ticks. Each tick renders as a column; rows correspond to specialists active during that tick. Click → opens an audit-entry drawer (one row per blackboard write or conflict). Cursor advances on `tick_start`/`tick_end` events. Time axis is wallclock (ms) — not tick number — to expose latency outliers visually.

#### 21.3.4 `<ConfidenceDial />`

A dial whose needle position is `outcome_estimate.point ∈ [0,1]` and whose 1σ band is the `[lower, upper]` interval. Color: `severity.low` if `point < 0.20`, `severity.medium` if `0.20 ≤ point < 0.35`, `affect.engaged` if `≥ 0.35`. Updates on every `outcome_predicted` event with a 220ms tween (or instant if reduced-motion).

#### 21.3.5 `<CostMeter />`

Linear meter with two thresholds: soft ceiling ($0.05) and hard kill ($0.20). Three-state color: green `< soft`, amber `[soft, hard)`, red `≥ hard`. On hard kill, the meter shakes once (200ms, only if motion enabled) and an inline warning chip appears.

#### 21.3.6 `<LiveNarrativeStream />`

A reverse-chronological stream of paragraphs emitted by the **Narrator** subsystem (§17 in PRD 2.0). Each paragraph carries `layer: CognitiveLayer`, which colors the left border (`layer.*` token). Auto-scroll is opt-out; the user can pin the scroll. Each paragraph is also written to the audit trail and replayable from `/generate/:id/audit`.

#### 21.3.7 `<ConflictBanner />`

Surfaces the most recent `conflict_emitted` event for **30s** (timeout configurable). Severity drives color and icon. Stacking: at most three concurrent banners; older banners collapse into a "+N more" affordance that opens a panel listing every conflict in this generation.

#### 21.3.8 `<EmotionalStateBadge />`

A passive, dismissible badge surfaced on `/dashboard` and `/generate/:id` when `EmotionalStateModeler` (§24) reports a non-`calm` state. Copy uses third-person voice: *"The system noticed you've retried this section several times. A short break might help."* The badge has `Dismiss` and `Why am I seeing this?` actions; the latter opens a panel with the underlying signals (retry rate, pending revisions, time-on-task) — never the raw inferred emotion alone.

#### 21.3.9 `<VoiceFingerprintRadar />`

128-dim fingerprint reduced to a 12-axis radar (UMAP into 12 stable clusters; cluster centers persisted under `voice_fingerprint_axes` table — see §10.6). The user can hover any axis to see contributing function-word features (Mosteller-Wallace tokens). A second translucent shape overlays the latest draft's fingerprint; cosine similarity is shown numerically. Reset button restores baseline (revocable for 14 days).

#### 21.3.10 `<HonestyCalibrationTable />`

Per-claim-type rows (`metric`, `team_size`, `tenure`, `tech_proficiency`) showing prior, posterior, count, last-updated. Inline sparkline visualises the posterior over time. CSV export uses the `gdpr_packet` schema (§10.5) so it round-trips with audit.

#### 21.3.11 `<GdprPacketViewer />`

JSON tree with type-aware rendering: tabular for arrays of records, key/value for objects, monospace for large strings, syntax-highlighted for embedded code/JSON. Top toolbar offers `Replay` (loads the packet into the live visualizer in deterministic playback mode), `Export PDF`, and `Verify hash`.

### 21.4 Page assembly

Each route in the `(authed)` segment composes cognitive widgets from the store; never instantiates business logic locally:

```tsx
// apps/spa/src/routes/generate/$id.tsx (TanStack Router)
import { useGenerationStream } from '@/hooks/useGenerationStream';
import {
  BrainHeatmap, GoalDag, TraceTimeline,
  ConfidenceDial, CostMeter, LiveNarrativeStream,
  ConflictBanner, EmotionalStateBadge,
} from '@retune/ui/cognitive';

export function GenerationPage({ id }: { id: string }) {
  const { activations, goals, ticks, outcome, cost, narrative, conflicts, emotion } =
    useGenerationStream(id);

  return (
    <div className="grid grid-cols-12 gap-4 p-6">
      <BrainHeatmap activations={activations} mode="live" className="col-span-5 row-span-2" />
      <ConfidenceDial value={outcome} className="col-span-3" />
      <CostMeter value={cost} className="col-span-4" />
      <GoalDag goals={goals} className="col-span-7 h-[420px]" />
      <TraceTimeline ticks={ticks} className="col-span-12 h-[160px]" />
      <LiveNarrativeStream paragraphs={narrative} className="col-span-12" />
      <ConflictBanner conflict={conflicts.latest} />
      <EmotionalStateBadge state={emotion} />
    </div>
  );
}
```

### 21.5 Routing and route guards

| Route | Guard | Failure UX |
|---|---|---|
| `/auth/*` | `requiresAnon` | redirect to `/dashboard` |
| `/onboarding/*` | `requiresAuth` + `requiresOnboardingState(step)` | redirect to current step |
| `/generate/new` | `requiresOnboardingComplete` + `consent.atLeastOneProvider` | redirect to `/settings/data` with banner |
| `/generate/:id` | `requiresOwnership(id)` | 404 |
| `/generate/:id/refused` | server-routed when `verdict='refuse'` | n/a |
| `/settings/*` | `requiresAuth` | redirect |
| `/brain` | `requiresAuth` + 30-day data window | empty-state card |

Guards run in `apps/spa/src/routes/_layout.tsx` (TanStack Router `beforeLoad`) and as middleware in `apps/web/src/middleware.ts`. They consult `/api/me` (cached 60s) and the local consent slice.

### 21.6 Performance budgets (frontend)

- First contentful paint ≤ 1.2s on cable, ≤ 2.5s on regular 4G.
- Interaction-to-next-paint (INP) ≤ 200ms P75 across all routes.
- `<BrainHeatmap />` paint cost ≤ 4ms/frame; activation update ≤ 1ms.
- SSE event handler ≤ 500µs P95 from receive to store dispatch (no JSON re-parse per subscriber).
- Bundle: `packages/ui` browser bundle ≤ 90kB gz; `apps/spa` initial route ≤ 220kB gz.
- Long-task budget: zero >50ms tasks on `/generate/:id` during streaming (verified by Playwright + Long Task API).

Performance tests live in `apps/spa/perf/*.spec.ts` (Playwright + Lighthouse CI).

## 22. SSE → UI event pipeline

The SSE stream defined in PRD 2.0 Appendix D is the **only** transport between the cognitive cycle and the UI. There is no second channel; everything that happens in the brain is observable through this one wire.

### 22.1 Server emission

`apps/api/src/runtime/sse-emitter.ts`:

```ts
export class SseEmitter {
  constructor(private readonly response: ServerResponse) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',          // disable nginx buffering
    });
    // Heartbeat every 15s so proxies do not close idle streams.
    this.heartbeat = setInterval(() => this.write({ type: 'heartbeat' }), 15_000);
  }

  emit<E extends CognitiveEvent>(event: E): void {
    this.write(event);
  }

  private write(event: CognitiveEvent): void {
    // Single JSON.stringify; deterministic key order for replay determinism.
    const line = `id: ${event.seq}\nevent: ${event.type}\ndata: ${stableStringify(event)}\n\n`;
    this.response.write(line);
  }
}
```

The orchestrator (`packages/agent/src/workbench/orchestrator.ts`) emits events through a `CognitiveEventBus` interface that the API runtime injects with an `SseEmitter`-backed implementation. Tests inject an in-memory bus.

### 22.2 Client transport

`apps/spa/src/lib/sse/typedEventSource.ts`:

```ts
export function createTypedEventSource(url: string, lastEventId?: string): TypedEventSource {
  const es = new EventSource(url + (lastEventId ? `?since=${lastEventId}` : ''));
  const subs = new Map<EventType, Set<(payload: unknown) => void>>();

  es.onmessage = (e) => {
    const evt = JSON.parse(e.data) as CognitiveEvent;
    const set = subs.get(evt.type);
    if (set) for (const f of set) f(evt.payload);
  };

  // Auto-resume on disconnect using Last-Event-ID.
  let lastSeen = lastEventId ?? '';
  es.addEventListener('error', () => {
    es.close();
    setTimeout(() => createTypedEventSource(url, lastSeen), 1_500);
  });

  return {
    on<K extends EventType>(k: K, f: (p: PayloadOf<K>) => void) { /* … */ },
    close() { es.close(); },
  };
}
```

Server resume: the API route reads `?since=<seq>` and replays buffered events from the **per-generation ring buffer** (`apps/api/src/runtime/event-ring.ts`, capacity 4096 events; older events sourced from the audit trail). This guarantees no event loss across reconnects.

### 22.3 Store dispatch

The SPA uses Zustand with one slice per cognitive concern; the SSE handler is the only writer:

```ts
// apps/spa/src/store/index.ts
export const useCognitiveStore = create<CognitiveState>((set) => ({
  activations: {},
  goals: { byId: {}, edges: [] },
  ticks: [],
  outcome: { point: 0, lower: 0, upper: 0, calibration_method: 'temperature' },
  cost: 0,
  narrative: [],
  conflicts: { byId: {}, latest: null },
  emotion: { state: 'calm', signals: {} },

  // Dispatch is the only writer; one reducer per event type.
  dispatch: (event: CognitiveEvent) => set((s) => reduce(s, event)),
}));
```

`reduce` is exhaustive over the discriminated union of `CognitiveEvent`; TypeScript's `never` check enforces compile-time completeness when new events are added.

### 22.4 Event → component table

PRD 2.0 Appendix D lists which event drives which component. The full implementation table including subscriber list:

| Event | Store slice updated | Components rerendered |
|---|---|---|
| `tick_start` | `ticks[].start` | `TraceTimeline` |
| `specialist_picked` | `activations[region]`, last-spike map | `BrainHeatmap`, `TraceTimeline` |
| `blackboard_write` | none directly (audit) | `LiveNarrativeStream` (if narrator paragraph) |
| `goal_emitted` | `goals.byId`, `goals.edges` | `GoalDag` |
| `goal_satisfied` / `goal_abandoned` | `goals.byId[id].state` | `GoalDag` |
| `conflict_emitted` | `conflicts.byId`, `conflicts.latest` | `ConflictBanner` |
| `listener_concern` | toast queue (transient slice) | `<Toaster />` |
| `cost_charge` | `cost` | `CostMeter` |
| `outcome_predicted` | `outcome` | `ConfidenceDial` |
| `narrative_paragraph` | `narrative[]` | `LiveNarrativeStream` |
| `emotional_state_changed` | `emotion` | `EmotionalStateBadge`, `BrainHeatmap` (insula) |
| `tick_end` | `ticks[].end`, `ticks[].latencyMs` | `TraceTimeline` |
| `complete` | finalises generation | navigation |
| `error` | error queue | `<ErrorPanel />` |
| `external_abort` | finalises | navigation |
| `heartbeat` | none | none (keep-alive) |

`emotional_state_changed` is NEW v2.0 (see §24).

### 22.5 Backpressure and ordering

- Events carry monotonic `seq`; client drops out-of-order events (logs to telemetry).
- Server enforces a soft cap of 50 events / 100ms / generation. If exceeded, low-importance events (`blackboard_write` whose path matches `/^audit\./`) are coalesced.
- Heartbeats are not counted toward backpressure.
- Reduced-motion clients receive the same events but skip animation transitions.

### 22.6 Replay determinism

Every `CognitiveEvent` is also persisted to the audit trail (§10) keyed by `(generation_id, seq)`. The `/generate/:id/audit` route can replay the stream into a `ReplayEventSource` that emits events at original wallclock pacing (or 4× speed with a toggle). This is how `<GdprPacketViewer />`'s `Replay` button works.

## 23. Frontend state machine

### 23.1 Slice definitions

```ts
type ActivationsSlice   = Record<BrainRegion, ActivationLevel>;
type GoalsSlice         = { byId: Record<GoalId, GoalNode>; edges: Array<[GoalId, GoalId]> };
type TicksSlice         = Array<{ tick: number; startMs: number; endMs?: number; latencyMs?: number; spans: SpanSummary[] }>;
type OutcomeSlice       = { point: number; lower: number; upper: number; calibration_method: CalibrationMethod };
type CostSlice          = number;
type NarrativeSlice     = Array<{ id: string; layer: CognitiveLayer; text: string; timestampMs: number }>;
type ConflictsSlice     = { byId: Record<ConflictId, Conflict>; latest: Conflict | null };
type EmotionSlice       = { state: EmotionalState; signals: EmotionalSignals; lastUpdatedMs: number };
type ConsentSlice       = { providers: { anthropic: boolean; openai: boolean; ml: boolean; postgres: boolean }; cookies: 'all' | 'essential' };
type SessionSlice       = { user: User | null; onboardingStep: OnboardingStep; voiceFingerprint: VoiceFingerprint | null };
```

### 23.2 Lifecycle states per generation

```
idle ─► requesting ─► streaming ─► (complete | refused | cancelled | errored)
              │           │
              │           └─► reconnecting (SSE drop) ─► streaming
              └─► validation_failed
```

State transitions are derived from the SSE event stream; the store does not encode them imperatively. A selector `useGenerationStatus(id)` computes the current state from the latest event.

### 23.3 Hooks (public to pages)

```ts
useGenerationStream(id)       // returns slices + status; opens SSE, manages cleanup
useEmotionalState()           // session-scoped EmotionSlice with dismiss/correct mutators
useVoiceFingerprint()         // current baseline; updates on /settings/voice mutations
useHonestyCalibration()       // posterior table + sparkline data
useConsent()                  // read/write consent; throws if no provider enabled
useReducedMotion()            // matchMedia('(prefers-reduced-motion: reduce)') with SSR fallback
useBrainAggregate({days=30})  // /brain page; aggregated activations across last N generations
```

All hooks are SSR-safe: they hydrate from `__INITIAL_STATE__` injected by `apps/web` or use empty defaults under `apps/spa`.

### 23.4 Error boundaries

- Top-level `<RouteErrorBoundary />` catches loader/guard errors → friendly page with retry + diagnostic ID (the audit trail's `generation_id` if applicable).
- Per-widget `<CognitiveErrorBoundary widget="BrainHeatmap" />` isolates UI faults so a single broken widget cannot black out the live visualizer; the boundary renders a compact "This view is temporarily unavailable" card and emits a `frontend_widget_error` telemetry event.
- SSE errors with `kind='auth_failed'` log the user out and route to `/auth/sign-in?next=…`.
- SSE errors with `kind='cost_runaway'` route to `/generate/:id/refused` with the budget reason pre-rendered.

### 23.5 Accessibility contract

- All interactive elements reachable via keyboard; focus order matches DOM order; visible focus rings (token: `ring/2 ring-layer-strategy`).
- WCAG 2.2 AA: contrast ratios ≥ 4.5:1 for text, ≥ 3:1 for non-text; verified by `@axe-core/playwright` in CI.
- Live regions: `<ConflictBanner />` and `<EmotionalStateBadge />` use `aria-live="polite"`; `<ConfidenceDial />` updates do not announce (rate-limited).
- Reduced-motion: every animation has an opacity-only fallback; no cognitive information is conveyed by motion alone.
- Color is never the sole channel: every layer color is paired with an icon and text label.
- Skip-to-content link present on all pages; `<main>` landmark wraps page body.

### 23.6 Telemetry

Frontend telemetry is emitted to `/api/telemetry/frontend` (batched, sendBeacon on unload):

| Event | When | Fields |
|---|---|---|
| `route_view` | route mount | path, referrer, ttfb, fcp, inp |
| `widget_error` | error boundary trips | widget, message, generation_id |
| `sse_disconnect` | SSE error or close | duration_ms, last_seq, reconnects |
| `cognitive_dismiss` | user dismisses badge/banner | kind, dwell_ms |
| `consent_change` | settings | before, after |
| `accessibility_fallback_used` | reduced-motion or screen-reader fallback rendered | which |

No PII; user is identified only by an opaque session token.

## 24. Affect and emotion specialists

PRD 2.0 §18 promises an emotional/well-being UX layer that surfaces candidate state without diagnosing or labelling. This section specifies the three new specialists that produce the signals the UI consumes.

### 24.1 `EmotionalStateModeler`

**Brain region**: insula + amygdala + ventromedial PFC (interoception × valence × valuation).
**Layer**: meta (cross-cutting; runs on listener trigger, not orchestrator tick).
**Goal kind**: `infer_emotional_state` (seeded once per generation at `tick=0`, re-seeded by listener on threshold cross).

Inputs (read from blackboard + persistence):
- `audit.retry_rate_60s` — `(retry_count / total_attempts)` over the last 60s of audit-trail entries.
- `audit.pending_revisions_count` — outstanding pending revisions on `draft.bullets`.
- `session.time_on_task_ms` — user-active time on the current generation.
- `session.dismiss_history` — count of dismissed badges across the last 14 days.
- `outcome_history.last_30d_verdicts` — `[ship | revise | refuse]` distribution.
- `voice.cohesion_drift_30d` — drift of recent voice fingerprints from baseline.

Output (written to `cognitive.emotion`):
```ts
type EmotionalState = 'calm' | 'engaged' | 'uncertain' | 'strained' | 'distressed';
interface EmotionalStateRecord {
  state: EmotionalState;
  confidence: number;          // 0..1; calibrated via Platt scaling
  signals: {
    retry_rate_60s: number;
    pending_revisions_count: number;
    time_on_task_ms: number;
    refuse_streak_30d: number;
    voice_cohesion_drift_30d: number;
  };
  threshold_crossed: keyof EmotionalStateRecord['signals'] | null;
  reasoning_summary: string;   // ≤ 280 chars; rendered verbatim in "Why am I seeing this?" panel
  surfaced: boolean;           // whether UI should show the badge
}
```

Decision rule (deterministic, no LLM):
```
if retry_rate_60s ≥ 0.5  AND pending_revisions_count ≥ 3  → 'distressed'
elif retry_rate_60s ≥ 0.3  AND time_on_task_ms ≥ 20*60_000 → 'strained'
elif refuse_streak_30d ≥ 3                                   → 'strained'
elif outcome_history.last_30d.uncertain_band_share ≥ 0.6     → 'uncertain'
elif retry_rate_60s ≤ 0.1  AND pending_revisions_count ≤ 1  → 'calm'
else                                                          → 'engaged'
```

`surfaced = state in ['strained', 'distressed']` AND `dismiss_history.last_24h < 2`. The dismiss budget prevents nag.

**Persistence**: `emotional_state` table (`user_id`, `generation_id`, `state`, `signals_jsonb`, `surfaced`, `created_at`). Read-only after write; corrections happen via `emotional_state_correction` table (append-only with `correction_state` and `user_note`).

**Privacy**: `signals` are redacted from any export that crosses tenant boundary; only `state` and `confidence` ever leave the tenant scope.

### 24.2 `MoodFingerprint`

**Brain region**: limbic system aggregate (longitudinal affect signature).
**Layer**: meta.
**Goal kind**: `compute_mood_fingerprint` (nightly cron + on-demand from `/settings/data`).

Computes a 32-dim mood vector from the last 30 days of `EmotionalStateRecord` rows — used internally by `EmotionalStateModeler` as a prior, and exposed to the user only as an aggregate sparkline on `/brain` (no per-day timestamps to discourage rumination).

Vector dimensions:
- 5 dims: state distribution (one-hot averaged).
- 8 dims: retry-rate quantiles (P10, P25, P50, P75, P90, P95, P99, max).
- 8 dims: pending-revision quantiles.
- 8 dims: voice cohesion drift quantiles.
- 3 dims: time-of-day distribution centroid (cyclic sin/cos + variance).

L2-normalised, persisted in `mood_fingerprint` table. Auto-deleted after 90 days unless user opts in to retain.

### 24.3 `MotivationModulator`

**Brain region**: ventral tegmental area + nucleus accumbens (dopaminergic reward prediction error).
**Layer**: meta (listener subscribes to `outcome` writes).
**Goal kind**: `update_motivation_modulator`.

Listens for `outcome_estimate` writes and `outcome_log` rows. Maintains a per-claim-type `reward_prediction_error` accumulator:
```
RPE_t = actual_outcome_t - predicted_outcome_t
modulator_t = (1 - α) * modulator_{t-1} + α * RPE_t        # α = 0.15
```

The modulator value is multiplied into `priority` of `Strategy`-layer goals (boost when calibration is warm, dampen when we are over-confidently failing). Bounded to `[0.5, 1.5]` to prevent runaway feedback. Persisted in `motivation_modulator` table per `(user_id, claim_type)`.

This is the only place where outcome history *causally* affects future generation behaviour; it implements §11.5 (calibration-driven adaptation) of PRD 2.0 without any LLM step.

### 24.4 SSE event added by §24

```ts
{
  type: 'emotional_state_changed';
  payload: {
    state: EmotionalState;
    confidence: number;
    surfaced: boolean;
    threshold_crossed: string | null;
    summary: string;     // == reasoning_summary
  };
}
```

Server emits at most once per 60s per generation per user (debounce). Emitted only when `state` changes OR `surfaced` flips.

### 24.5 Dimensional projection (valence × arousal) and OCC appraisal

Categorical states (`calm | engaged | uncertain | strained | distressed`) are projected to a Russell-circumplex dimensional pair `(valence ∈ [-1, 1], arousal ∈ [0, 1])` for downstream consumers that need continuous values (e.g. `MotivationModulator` priority weighting, `<EmotionalStateBadge />` colour interpolation):

| State | Valence | Arousal |
|---|---|---|
| `calm`       | +0.5 | 0.20 |
| `engaged`    | +0.6 | 0.55 |
| `uncertain`  |  0.0 | 0.40 |
| `strained`   | −0.4 | 0.65 |
| `distressed` | −0.8 | 0.85 |

**OCC appraisal** (Ortony-Clore-Collins): the categorical assignment in §24.1 is the result of an implicit appraisal over three appraisal variables — `goal_congruence` (outcome trend), `agency` (user vs system), `certainty` (confidence interval width). The signals `signals.refuse_streak_30d`, `signals.retry_rate_60s`, and `signals.outcome_history` map onto these appraisal variables; the decision rule in §24.1 is the appraisal-to-state collapse. This is documented so that future v2.x revisions can swap categorical states for an OCC-style structured appraisal record without breaking the SSE contract.

## 25. Thinking components decomposition

Human thinking decomposes (per cognitive psychology canon — Anderson, Kahneman, Baddeley, Miller, Squire, Tulving) into 17 components spanning the canonical declarative / non-declarative split (Squire), Baddeley's working-memory model, dual-process theory (Kahneman), and the standard problem-solving / decision / metacognition trio. v2.0 names every specialist's role against this taxonomy so the system covers cognition end-to-end. §25.5–25.7 add the orthogonal mindset / thought / action axes.

### 25.1 Component → specialist mapping

| Thinking component | Definition | Specialists | Brain region |
|---|---|---|---|
| **Perception** | Encoding raw input into structured tokens | `JdSpanExtractor`, `ResumeParser` (in `apps/api`), `DiscourseClassifier` | primary visual + auditory + Wernicke's |
| **Attention** | Selecting which input gets processed (top-down + bottom-up) | `BoilerplateStripper` (suppression), `Orchestrator` priority queue (selection), `BudgetController` (vigilance) | ACC + parietal attention network + locus coeruleus |
| **Working memory** | Holding & manipulating information for ≤ 30s | `BlackboardStore` deep-frozen state, `GapMapper` | DLPFC + IPS |
| **Long-term semantic memory** | Knowledge base of meanings, schemas | `TitleSchemaRetriever`, `CompanySchemaRetriever`, `CulturalCalibrator` | angular gyrus + temporal cortex + STS |
| **Long-term episodic memory** | Autobiographical / event memory | `PostgresPersistence` (audit trail, outcomes, voice baseline) | hippocampus + medial temporal lobe |
| **Procedural memory** | Non-declarative skill / habit memory; "how-to" knowledge | `BoilerplateStripper` regex rules, ATS keyword-match heuristics, prompt-hash response cache, `VoiceFingerprintExtractor` motor-imprint vectors | basal ganglia + cerebellum + supplementary motor area |
| **Categorisation / concept formation** | Mapping instances to canonical types | `TitleSchemaRetriever`, `CompanySchemaRetriever`, `DiscourseClassifier` | angular gyrus + ventral temporal cortex |
| **Problem solving** | Means-ends search; sub-goal generation | `EvidenceSolver` (B&B search), `GapMapper` (sub-goal generation), `Orchestrator` (search expansion) | DLPFC + IPS + premotor |
| **Mental simulation / counterfactual** | Imagining alternative outcomes | `OutcomePredictor` (forward simulation), `CriticEnsemble` ("what would the recruiter say?"), `TheoryOfMindSpecialist` (perspective-taking) | DMN + medial PFC + hippocampus |
| **Reasoning** | Inference, deduction, induction, abduction | `EvidenceSolver` (constraint solver), `HonestyCalibrator` (Bayesian), `CredibilityScanner` | DLPFC + premotor + STS |
| **Planning** | Goal decomposition, sequencing under constraints | `Orchestrator` (goal-DAG scheduler), `GapMapper`, `NarrativeArcProposer` | DLPFC + premotor + supplementary motor area |
| **Decision** | Value-based selection among alternatives | `OutcomePredictor`, `RefuseOrShipGate`, `MotivationModulator` | vmPFC + ventral striatum |
| **Production / language** | Articulating thought into output | `SequentialBulletComposer`, `Narrator` (LiveNarrativeStream emitter) | Broca's + arcuate fasciculus + premotor |
| **Critique / monitoring** | Detecting errors, conflicts, divergence | `CriticEnsemble`, `TheoryOfMindSpecialist`, listener fleet (`FairnessMonitor`, `VoiceDriftMonitor`, `WellBeingMonitor`) | ACC + right TPJ + anterior insula |
| **Metacognition** | Thinking about thinking; uncertainty quantification | `OutcomePredictor` (calibration), `CriticEnsemble` (divergence), `Narrator` (self-explanation), `EmotionalStateModeler` (system-self awareness), `ActiveQuestionHandler` (asking when stuck) | rostrolateral PFC + frontopolar cortex |
| **Affect / emotion** | Valence, arousal, motivation | `EmotionalStateModeler`, `MoodFingerprint`, `MotivationModulator`, `WellBeingMonitor` | amygdala + insula + VTA + nucleus accumbens |
| **Action selection** | Translating decisions into externalised behaviour | API response writer, SSE emitter, `apps/web` route handlers | primary motor cortex + basal ganglia |

Every specialist has a `@thinking` JSDoc tag in addition to its `@brain` tag, lint-checked by `tools/lint/cognitive-tags.ts`.

### 25.2 Coverage proof

A test in `tests/thinking-coverage.test.ts` enumerates the union of `@thinking` tags across the registered specialist set and asserts that every entry in the table above has at least one specialist. Failure = either a missing specialist or a stale taxonomy entry; both fail CI.

```ts
test('thinking taxonomy is fully covered by registered specialists', () => {
  const required = THINKING_COMPONENTS;          // 17 keys (table 25.1)
  const seen = new Set<ThinkingComponent>();
  for (const s of registry.all()) for (const t of s.thinking) seen.add(t);
  for (const r of required) assert.ok(seen.has(r), `Uncovered thinking component: ${r}`);
});
```

### 25.3 Dual-process model (System 1 / System 2)

The cycle implements Kahneman's dual-process model explicitly:

| System | Characterisation | Specialists | Trigger |
|---|---|---|---|
| **System 1** (fast, automatic) | Heuristics, pattern matching | `BoilerplateStripper`, `DiscourseClassifier`, `VoiceFingerprintExtractor`, listeners | Trigger-bus path-match |
| **System 2** (slow, deliberate) | Search, simulation, tool-using LLM calls | `EvidenceSolver`, `CriticEnsemble`, `SequentialBulletComposer`, `OutcomePredictor` | Goal seeding from orchestrator |

The `Orchestrator` arbitrates: System 2 specialists run by goal pick; System 1 listeners run on every relevant blackboard write. The hard-kill `BudgetController` enforces System 2 rationing — if cost ≥ soft ceiling, only System 1 paths remain available, mirroring cognitive depletion.

### 25.4 Theory of mind explicitness

`TheoryOfMindSpecialist` (commit #11) holds three explicit submodels:

| Submodel | Represents | Output dimension |
|---|---|---|
| `recruiter_model` | The screener's likely scan pattern + objection set | 64-dim belief vector + objection list |
| `hiring_manager_model` | The decision-maker's value priorities | 64-dim value vector |
| `ats_model` | Keyword + format expectations | tagged keyword set + format constraint list |

Each submodel is consumed by `CriticEnsemble` as a perspective; divergence between submodels triggers `critic_divergence` conflicts. Every claim in the final draft must clear all three perspectives.

### 25.5 Mindset taxonomy

Mindset (Dweck, Bandura, Rotter) is *not* a separate specialist; it emerges from the interaction of existing components. Each mindset axis maps to a measurable runtime quantity:

| Mindset axis | Definition | Implementation locus | User-visible surface |
|---|---|---|---|
| **Growth vs fixed mindset** | Belief that abilities are malleable | Voice-fingerprint baseline is *revocable for 14 days* (§21.3.9); honesty calibration shows posterior change over time | `<HonestyCalibrationTable />` sparkline, `<VoiceFingerprintRadar />` reset |
| **Self-efficacy** | Belief in one's own capability | `MotivationModulator.modulator` value (per-claim-type; bounded `[0.5, 1.5]`) | implicit — surfaces as `<ConfidenceDial />` posterior trend |
| **Locus of control (internal vs external)** | Attribution of outcomes to self vs environment | Dismiss-history weighting in `EmotionalStateModeler`; passive third-person voice (§21.3.8) preserves user agency | `<EmotionalStateBadge />` copy: "the system noticed…" never "you are…" |
| **Goal orientation (mastery vs performance)** | Focus on learning vs proving | Outcome log accepts both `interview` and `learning_takeaway` outcomes; calibration warms regardless of ship/refuse | `/generate/:id/outcome` form |
| **Self-image / identity** | Coherent sense of self over time | `voice_fingerprint` baseline + `WellBeingMonitor.self_image_divergence` signal | `<WellBeingMonitor />` conflict + retention controls (§19) |

Design rule: the system *never* labels the user with a mindset, and never recommends a mindset shift. It only surfaces signals; the user does the interpretation.

### 25.6 Thought taxonomy

Seven thought modes (Baars, Killingsworth) — each maps to a runtime construct:

| Thought mode | Runtime construct | Brain region |
|---|---|---|
| **Verbal / inner speech** | `Narrator` paragraphs, narrative-stream events | left inferior frontal gyrus + Broca's |
| **Visual / imagery** | `<BrainHeatmap />` + `<GoalDag />` rendering of system state (the *user's* visual mental aid) | occipital + parietal (user-side, not system) |
| **Conceptual / non-verbal** | Blackboard typed records (e.g. `goal.priority`, `outcome_estimate`) before verbalisation | DLPFC |
| **Counterfactual** | `CriticEnsemble` ("what if a recruiter scanned this?"), `TheoryOfMindSpecialist` perspectives | medial PFC + DMN |
| **Prospective (future)** | `OutcomePredictor` callback-probability estimate | medial PFC + hippocampus |
| **Retrospective (past)** | `HonestyCalibrator` posterior over claim history; outcome log review | hippocampus + ventromedial PFC |
| **Self-referential** | `WellBeingMonitor`, `EmotionalStateModeler`, `MoodFingerprint` | DMN (medial PFC + posterior cingulate) |
| **Other-referential** | `TheoryOfMindSpecialist` (recruiter / hiring manager / ATS) | TPJ + STS |

### 25.7 Action taxonomy

Four action classes (Dickinson-Balleine, basal ganglia models). Every output the system produces is classified into exactly one:

| Action class | Definition | Runtime examples | Brain region |
|---|---|---|---|
| **Reflexive** | Stimulus-driven, no deliberation | Listener fires on blackboard write (`FairnessMonitor`, `VoiceDriftMonitor`); SSE heartbeat | reticular formation + spinal-reflex analogues |
| **Habitual** | Cached pattern; fast; runs on previously-learned input shape | Prompt-hash response cache hit, `BoilerplateStripper` regex matches, ATS keyword-match heuristics | basal ganglia (caudate → putamen loop) |
| **Goal-directed** | Deliberative; involves search / simulation | Orchestrator goal pick, `EvidenceSolver` B&B, `CriticEnsemble` ensemble call | DLPFC → premotor → SMA |
| **Communicative** | Externalised linguistic / visual output | Resume bullets, cover letter, narrator paragraphs, SSE event emission, refused page reasons | Broca's + premotor + motor cortex |

Every audit-trail entry carries an `action_class` field; the brain dashboard (`/brain`) shows the per-day mix to expose system regression toward habit (efficient but rigid) vs deliberation (expensive but adaptive).

## 26. Neural signaling and activation

This is the formal model that underlies the *brain* metaphor — not decorative, but the operational semantics of the runtime. Every concept here maps to a concrete code construct.

### 26.1 The mapping (overview)

| Neural concept | System construct | Code locus |
|---|---|---|
| Neuron | `Specialist` instance | `packages/agent/src/specialists/*` |
| Cell type | `SpecialistKind` enum (`projection`, `local_inhibitory`, `modulatory`, `monitor`) | §27 |
| Action potential (spike) | `CognitiveEvent` published on the event bus | `runtime/sse-emitter.ts` |
| Synapse | Goal-kind binding (one specialist's emit → another's accept) | registry `acceptsGoalKind` |
| Synaptic weight | `priority` on `Goal` × `MotivationModulator` factor | `goal.priority` |
| Dendritic input | Trigger-bus subscription path | `triggerBus.subscribe(pattern, …)` |
| Axon hillock threshold | `Specialist.shouldRun(ctx)` predicate | every specialist |
| Refractory period | Per-(specialist, goal-kind) rate limit | `RateLimiter` in `workbench/scheduler.ts` |
| Membrane potential | Goal queue priority sum for a region | scheduler internal |
| Long-term potentiation (LTP) | Posterior updates in `HonestyCalibrator`, `MotivationModulator` | calibrators |
| Spike-timing dependent plasticity (STDP) | RPE update rule (§24.3) and Bayesian updates | `MotivationModulator`, `HonestyCalibrator` |
| Lateral inhibition | `BoilerplateStripper` suppressing noisy sentences | suppression writes |
| Feedforward inhibition | `BudgetController` capping downstream goals on cost spike | budget pre-check |
| Recurrent connection | Goal that re-emits its parent kind on partial output | `EvidenceSolver` partial-fit re-seed |
| Gap junction | `BlackboardStore.commit` atomic patch broadcast | persistence |
| Gating (thalamus → cortex) | `MLClient` HTTP/gRPC bridge filtering ML calls | `lib/ml-client.ts` |
| Cortical column | A specialist's per-tick scratch state | specialist `run()` locals |
| White matter (cross-cortex) | Temporal activity invocations | `temporal/activities/substrate.ts` |
| Corpus callosum | Cross-language TS↔Python RPC | `cross-lang-e2e.test.ts` |
| Hippocampal consolidation | Generation-end persistence + audit ship to long-term store | `persist_tick` + Temporal workflow finalisation |
| Reward prediction error (dopaminergic) | `MotivationModulator.RPE` | §24.3 |
| Norepinephrine (vigilance) | `BudgetController` alarm escalation | budget controller |
| Serotonin (mood baseline) | `MoodFingerprint` longitudinal vector | §24.2 |
| Acetylcholine (attentional gain) | `Goal.priority` boost from active question | `ActiveQuestionHandler` |
| GABA (inhibition) | Boilerplate / fairness suppression writes | `BoilerplateStripper`, `FairnessMonitor` |
| Glutamate (excitation) | Default goal emission | every emitter |

### 26.2 Spiking model

Every event the orchestrator emits is a typed *spike*:

```ts
interface Spike<E extends CognitiveEvent = CognitiveEvent> {
  event: E;
  source: SpecialistId | 'orchestrator' | 'listener:<id>';
  brainRegion: BrainRegion;
  layer: CognitiveLayer;
  neurotransmitter: NeurotransmitterTag;     // §27
  cellType: CellType;
  amplitude: number;        // proxy for cost-of-this-spike (latency_ms or cost_usd)
  seq: number;              // monotonic
  timestampMs: number;
}
```

The SSE emitter is the *axon* that propagates spikes from the brain process to the UI process. Replay determinism (§22.6) holds because spikes are immutable, totally ordered by `seq`, and persisted.

### 26.3 Activation level (per-region firing rate)

For each `BrainRegion` r, the runtime maintains a sliding window:

```ts
class ActivationModel {
  private readonly window = new Map<BrainRegion, number[]>();   // timestamps in last 1000ms
  private readonly maxAgeMs = 1000;

  recordSpike(r: BrainRegion, t: number) {
    const w = this.window.get(r) ?? [];
    while (w.length && t - w[0]! > this.maxAgeMs) w.shift();
    w.push(t);
    this.window.set(r, w);
  }

  intensity(r: BrainRegion, now: number): number {
    const w = this.window.get(r) ?? [];
    const recent = w.filter(t => now - t <= this.maxAgeMs).length;
    // Normalise: max design rate is 20 spikes/s/region.
    return Math.min(1, recent / 20);
  }
}
```

`<BrainHeatmap />` reads `intensity(r, now)` for every region every frame (rAF-throttled to 60fps; 30fps under reduced-motion).

### 26.4 Refractory period (rate limiting)

Each `(specialist, goal_kind)` pair has a refractory window — minimum interval between successive runs — to prevent runaway recursion:

```ts
const REFRACTORY_MS: Record<SpecialistId, number> = {
  Orchestrator: 0,                             // no refractory; the substrate
  EvidenceSolver: 50,                          // expensive; protect cost
  CriticEnsemble: 100,                         // 3 LLM calls; protect budget
  SequentialBulletComposer: 30,
  OutcomePredictor: 200,                       // very stable; rarely re-runs
  // … all 27 registry entries enumerated (see §27.1)
};
```

A specialist whose refractory has not elapsed is skipped by the scheduler with audit reason `refractory_skip`. This is observable as a faded pulse in `<BrainHeatmap />`.

### 26.5 Neuromodulator analogues — runtime effects

| Neuromodulator | Runtime analogue | Effect |
|---|---|---|
| Dopamine | `MotivationModulator.modulator` | Multiplies Strategy-layer goal `priority` |
| Norepinephrine | `BudgetController.alarm_level` | Lowers refractory threshold; raises Decision-layer priority |
| Serotonin | `MoodFingerprint`-derived prior | Sets baseline `EmotionalStateModeler.state` floor |
| Acetylcholine | `ActiveQuestionHandler.attention_boost` | +0.3 priority on goals matching the open question |
| GABA | Suppression writes (`importance: -1`) | Removes content from downstream consideration |
| Glutamate | Default emission | n/a — baseline excitation |
| Endorphin | None directly modelled (intentional) | The system never rewards itself; only the user's outcome log moves dopamine |

### 26.6 Plasticity (learning)

Only three places mutate persistent priors:
1. **`HonestyCalibrator`** — Bayesian posterior over claim trust.
2. **`MotivationModulator`** — exponentially-weighted RPE.
3. **`VoiceFingerprintExtractor`** — baseline update on accepted ship + user-confirmed authorship (never automatic).

All three are written through `PostgresPersistence.persistPrior()` which records a `prior_update` audit row — every change to the brain's long-term weights is auditable.

Long-term *depression* (LTD) — the negative-direction analogue of LTP — is implemented in the same three places: a Bayesian posterior can shrink (claim trust falling after contradicting evidence), a `MotivationModulator` value can drop below 1.0 (RPE negative), and a voice-fingerprint baseline can be reset (user-initiated). LTD is auditable identically to LTP via the `prior_update` audit row's `direction: 'depress'` field.

**Homeostatic plasticity** — to prevent runaway potentiation, all priors are clamped: `MotivationModulator ∈ [0.5, 1.5]`, `HonestyCalibrator` posterior ∈ `[ε, 1−ε]` with `ε = 0.02`, voice fingerprint normalised to unit L2. Clamps are enforced inside `PostgresPersistence.persistPrior()` and are part of the calibration determinism guarantee (§12).

### 26.7 Network topology constraints

- **No cycles in the goal-DAG within a single tick.** The orchestrator rejects goal emissions whose `parent_goal_id` chain forms a cycle. Static check in `tests/orchestrator-acyclic.test.ts`.
- **Bounded fan-out per spike.** A specialist emits at most `MAX_GOALS_PER_RUN = 8` new goals; excess is dropped with `goal_fanout_exceeded` audit.
- **Bounded fan-in per goal.** Listeners see all blackboard writes but a single tick allocates at most `MAX_LISTENER_SPIKES = 32` listener invocations; excess is queued for next tick.

These mirror cortical fan-out/in bounds (~10⁴ synapses/neuron in cortex; the runtime equivalent is far smaller because spikes are coarse semantic events, not millisecond pulses).

### 26.8 Failure modes — neural framing

| Neural pathology | System symptom | Detection | Mitigation |
|---|---|---|---|
| Seizure (runaway excitation) | Cost runaway, goal explosion | `BudgetController` hard kill | refuse-or-ship gate (§13 PRD) |
| Tonic inhibition (silence) | Zero specialist activations for > 5 ticks | `WatchdogTimer` in orchestrator | terminate generation with `no_progress` |
| Synaptic loss | Specialist registered but never picked | `tests/specialist-registration-parity.test.ts` + runtime audit | static check fails build |
| Excitotoxicity (overload) | Listener fan-out > MAX_LISTENER_SPIKES sustained | scheduler throttle | drop low-priority listener fires; emit `listener_overload` |
| Hallucinatory firing | Specialist writes paths it cannot prove | `CriticEnsemble` divergence + `fabrication` monitor | refuse |

### 26.9 Network oscillations (tick rhythms)

The runtime exposes four nested rhythms that loosely mirror cortical oscillation bands. They are not decorative — they are the timing constraints CI verifies:

| Band | Period | Runtime analogue | Code locus |
|---|---|---|---|
| Delta (0.5–4 Hz) | 250–2000ms | SSE heartbeat (15s in production; 250ms in test) | `runtime/sse-emitter.ts` |
| Theta (4–8 Hz) | 125–250ms | Orchestrator tick cadence target P50 | `workbench/orchestrator.ts` |
| Alpha (8–12 Hz) | 80–125ms | Frontend rAF cluster (60fps = 16ms; reduced-motion 30fps = 32ms; activation aggregation window 100ms) | `<BrainHeatmap />` |
| Gamma (30–100 Hz) | 10–30ms | SSE backpressure window (50 events / 100ms = 500Hz max) | `runtime/sse-emitter.ts` backpressure |

Each rhythm has a CI gate: tick-cadence violations (e.g. P50 > 250ms) fail the latency suite; SSE heartbeat absence > 30s fails the reconnect test.

### 26.10 Sleep / offline consolidation

Not every cognitive task happens in real time. The system has explicit *offline* paths analogous to sleep-driven consolidation:

| Sleep analogue | Runtime mechanism | Frequency |
|---|---|---|
| Slow-wave / NREM consolidation | Audit-trail → long-term `gdpr_packets` table + outcome aggregation | end of every generation |
| REM / dream replay | `MoodFingerprint` nightly cron — replays last-30-day emotional records | nightly @ 03:00 UTC |
| Synaptic homeostasis (Tononi SHY) | Prior-clamp pass — normalises drifted priors back into bounds | nightly @ 03:15 UTC |
| Memory pruning | Deletion of expired emotional signals (90-day retention) and dismissed-banner history (14-day retention) | nightly @ 03:30 UTC |
| Procedural-memory consolidation | Prompt-hash cache rotation; cold entries evicted | continuous LRU |

Cron jobs live in `apps/api/src/cron/*` and emit `cron_run` audit entries identical in shape to `tick_end`, so the offline path is observable from `/brain`.

### 26.11 Functional brain networks (overlay)

Individual regions (§28.1) compose into five canonical functional networks. `<BrainHeatmap />` exposes a network-overlay toggle that highlights the constituent regions:

| Network | Regions | Runtime role |
|---|---|---|
| **Default Mode Network (DMN)** | `dmn` (composite of medial PFC + posterior cingulate + angular_gyrus subset) | Narrative imagination (`NarrativeArcProposer`), self-referential thought (`MoodFingerprint`) |
| **Salience Network** | `acc`, `insula` | Conflict detection (`CriticEnsemble`, `WellBeingMonitor`), affect interoception (`EmotionalStateModeler`) |
| **Central Executive Network** | `dlpfc`, `vmpfc`, `frontopolar` | Working memory + planning + decision (`Orchestrator`, `EvidenceSolver`, `OutcomePredictor`, `RefuseOrShipGate`) |
| **Dorsal Attention Network** | `dlpfc`, parietal subset (mapped to `dlpfc`) | Top-down attention (`Orchestrator` priority queue, `ActiveQuestionHandler`) |
| **Ventral Attention Network** | `tpj_right`, `vlpfc_right` | Bottom-up salience reorientation (listeners firing on blackboard writes) |

Network overlays are URL-persisted (`?networks=dmn,salience`), composable with layer filters (§28.2).

## 27. Cell-type catalogue

Every specialist is annotated with a cell type that captures its computational role. Encoded as `@cellType` JSDoc and re-exported from registry metadata.

```ts
type CellType =
  | 'pyramidal_projection'        // long-range excitatory; emits goals to other layers
  | 'local_excitatory'            // within-layer goal emission
  | 'local_inhibitory'            // suppresses content (lateral inhibition)
  | 'feedforward_inhibitory'      // gates downstream by cost / safety
  | 'modulatory'                  // adjusts priority / posterior; does not emit content
  | 'monitor'                     // listener; does not occupy the goal queue
  | 'integrative'                 // aggregates multiple inputs into one verdict
  | 'gating';                     // routes between subsystems (thalamic relay analogue)

type NeurotransmitterTag =
  | 'glutamate'                   // default excitation
  | 'gaba'                        // suppression
  | 'dopamine'                    // reward / motivation
  | 'norepinephrine'              // alarm / vigilance
  | 'serotonin'                   // mood baseline
  | 'acetylcholine'               // attentional gain
  | 'mixed';                      // explicitly multi-modulator
```

### 27.1 Catalogue (all 27 registry entries)

| Specialist | Layer | Cell type | Neurotransmitter | Brain region |
|---|---|---|---|---|
| `Orchestrator` | substrate | `gating` | mixed | DLPFC tick-loop |
| `BudgetController` | substrate | `feedforward_inhibitory` | norepinephrine | RAS + amygdala |
| `JdSpanExtractor` | comprehension | `local_excitatory` | glutamate | temporal cortex |
| `TitleSchemaRetriever` | comprehension | `pyramidal_projection` | glutamate | angular gyrus |
| `CompanySchemaRetriever` | comprehension | `pyramidal_projection` | glutamate | angular gyrus |
| `DiscourseClassifier` | comprehension | `local_excitatory` | glutamate | Wernicke's |
| `BoilerplateStripper` | comprehension | `local_inhibitory` | gaba | ACC |
| `CulturalCalibrator` | comprehension | `pyramidal_projection` | glutamate | right TPJ + STS |
| `VoiceFingerprintExtractor` | reflection | `pyramidal_projection` | glutamate | Broca's + arcuate |
| `HonestyCalibrator` | reflection | `modulatory` | mixed | orbitofrontal cortex |
| `CredibilityScanner` | reflection | `monitor` | norepinephrine | STS + ACC |
| `GapMapper` | strategy | `local_excitatory` | glutamate | DLPFC |
| `EvidenceSolver` | strategy | `pyramidal_projection` | glutamate | DLPFC + premotor |
| `NarrativeArcProposer` | production | `pyramidal_projection` | glutamate | default mode network |
| `SequentialBulletComposer` | production | `pyramidal_projection` | glutamate | Broca's + premotor + cerebellum |
| `TheoryOfMindSpecialist` | critique | `integrative` | mixed | TPJ + right STS |
| `CriticEnsemble` | critique | `integrative` | mixed | TPJ + ACC |
| `OutcomePredictor` | decision | `modulatory` | dopamine | vmPFC |
| `RefuseOrShipGate` | decision | `gating` | norepinephrine | locus coeruleus + amygdala + meta |
| `FairnessMonitor` | cross-cutting | `monitor` | gaba | right vlPFC |
| `VoiceDriftMonitor` | cross-cutting | `monitor` | norepinephrine | cerebellum |
| `WellBeingMonitor` | cross-cutting | `monitor` | serotonin | insula + vmPFC |
| `EmotionalStateModeler` | meta | `modulatory` | mixed | insula + amygdala + vmPFC |
| `MoodFingerprint` | meta | `modulatory` | serotonin | limbic aggregate |
| `MotivationModulator` | meta | `modulatory` | dopamine | VTA + nucleus accumbens |
| `ActiveQuestionHandler` | meta | `gating` | acetylcholine | ACC + TPJ |
| `Narrator` | meta | `pyramidal_projection` | glutamate | left inferior frontal gyrus |

**Count**: 25 cognitive specialists + `Orchestrator` + `BudgetController` = **27 registry entries**. §6 enumerates the 18-specialist v2.0-baseline subset; §24 adds 3 affect specialists (`EmotionalStateModeler`, `MoodFingerprint`, `MotivationModulator`); v1.0 carry-overs `ActiveQuestionHandler` + `Narrator` complete the meta layer; the 3 cross-cutting listeners (`FairnessMonitor`, `VoiceDriftMonitor`, `WellBeingMonitor`) are part of the 18. The substrate pair (`Orchestrator`, `BudgetController`) is excluded from §6's count because it is the runtime, not a domain specialist.

### 27.2 Static enforcement

`tests/cell-type-coverage.test.ts`:
```ts
test('every registered specialist has a cell type and neurotransmitter', () => {
  for (const s of registry.all()) {
    assert.ok(s.cellType,         `${s.id} missing cellType`);
    assert.ok(s.neurotransmitter, `${s.id} missing neurotransmitter`);
    assert.ok(s.brainRegion,      `${s.id} missing brainRegion`);
    assert.ok(s.thinking?.length, `${s.id} missing thinking tags`);
  }
});
```

This is part of the registration parity gate — same suite that prevents the v1.0 wiring drift.

### 27.3 Glia and supporting cells

Neurons are not the whole brain. Roughly half the cells in human cortex are glia. The runtime has direct analogues that were previously categorised as "infrastructure" — making the mapping explicit closes the cell-coverage gap:

```ts
type GliaType =
  | 'astrocyte'                   // metabolic + ionic homeostasis + tripartite synapse
  | 'oligodendrocyte'             // myelination → conduction speed
  | 'microglia'                   // immune surveillance + synaptic pruning
  | 'ependymal';                  // CSF circulation + waste clearance
```

| Glia type | Function | Runtime analogue | Code locus |
|---|---|---|---|
| **Astrocyte** | Metabolic support; reuptake; Ca2+ signalling | Connection pool (Postgres / Temporal / provider HTTP); resource quota tracking; cost telemetry aggregation | `lib/db.ts`, `lib/temporal-client.ts`, `runtime/cost-telemetry.ts` |
| **Oligodendrocyte** | Myelination → fast saltatory conduction | Caching layer: prompt-hash response cache, SSE ring buffer, voice-fingerprint LRU, ML-server response cache | `lib/cache/*`, `runtime/event-ring.ts` |
| **Microglia** | Immune surveillance; synaptic pruning of unused / damaged synapses | Security middleware (auth, rate limit, prompt-injection detection); dead-code reaper that fails CI when a registered specialist hasn't fired in 30 days; `FairnessMonitor` (pruning biased outputs) | `apps/api/src/middleware/*`, `tools/dead-specialist-reaper.ts`, `specialists/fairness-monitor.ts` |
| **Ependymal** | CSF flow; waste clearance | Audit-trail rotation; log compaction; expired-record GC (cron in §26.10) | `apps/api/src/cron/audit-rotation.ts`, `apps/api/src/cron/gc.ts` |

Coverage assertion (`tests/glia-coverage.test.ts`):

```ts
test('every glia type has at least one infrastructure registrant', () => {
  for (const g of GLIA_TYPES) {
    assert.ok(infrastructure.gliaRegistrants(g).length > 0, `Uncovered glia type: ${g}`);
  }
});
```

Why this matters: production incidents that look like "the brain is misfiring" are often glial — connection pool exhaustion, cache stampede, security middleware blocking, audit-trail backlog. Naming them as glia in the runbook (`RUNBOOK.md` §3) collapses the mental gap between "app infra" and "cognitive runtime".

## 28. UI brain-heatmap region map

`<BrainHeatmap />` renders a stylised lateral-view brain SVG (mirrored for cortex/sub-cortex split-view toggle). Region IDs are stable; they are the same strings used as `BrainRegion` enum values.

### 28.1 Region inventory (SVG `<g id="…">`)

| ID | Display label | Cortex / sub-cortex | Layer association |
|---|---|---|---|
| `dlpfc` | Dorsolateral PFC | cortex | strategy / working memory |
| `vmpfc` | Ventromedial PFC | cortex | decision |
| `vlpfc_right` | Right vlPFC | cortex | cross-cutting (fairness) |
| `acc` | Anterior cingulate | cortex (medial) | critique / attention |
| `frontopolar` | Frontopolar | cortex | metacognition |
| `broca` | Broca's area | cortex | production |
| `premotor` | Premotor | cortex | production |
| `motor` | Primary motor | cortex | action selection |
| `wernicke` | Wernicke's area | cortex | comprehension |
| `angular_gyrus` | Angular gyrus | cortex | semantic memory |
| `tpj_right` | Right TPJ | cortex | theory of mind |
| `sts` | Superior temporal sulcus | cortex | cultural / theory of mind |
| `temporal` | Temporal cortex | cortex | comprehension |
| `insula` | Insula | cortex | affect (interoception) |
| `dmn` | Default mode network | cortex (composite) | narrative imagination |
| `arcuate` | Arcuate fasciculus | white matter | reflection (voice) |
| `cerebellum` | Cerebellum | sub-cortex | production / drift monitor |
| `hippocampus` | Hippocampus | sub-cortex | episodic memory |
| `amygdala` | Amygdala | sub-cortex | affect / alarm |
| `nucleus_accumbens` | Nucleus accumbens | sub-cortex | motivation |
| `vta` | Ventral tegmental area | sub-cortex | motivation (RPE) |
| `locus_coeruleus` | Locus coeruleus | sub-cortex | vigilance |
| `ras` | Reticular activating system | sub-cortex | budget alarm |
| `thalamus` | Thalamus | sub-cortex | gating (ML transport) |
| `corpus_callosum` | Corpus callosum | white matter | cross-language transport |
| `ofc` | Orbitofrontal cortex | cortex | trust valuation |

26 regions — exactly matches the cell-type catalogue (§27). Every region visually pulses iff a specialist tagged with that region produced a spike in the last 600ms.

### 28.2 Layer toggle

Above the SVG, a `<LayerLegend />` lets the user filter activations by `CognitiveLayer` (`comprehension | reflection | strategy | production | critique | decision | meta | cross-cutting | substrate`). When a layer is filtered, regions whose specialists are not tagged with that layer fade to 30% opacity. Filters are URL-persisted (`?layers=strategy,production`) for shareable diagnostics.

### 28.3 Drill-down

Clicking a region opens `<RegionPanel />` which lists:
1. The specialists tagged with that region (link to source path).
2. The last 10 spikes from that region in this generation (timestamp, goal kind, latency).
3. The associated `@thinking` components.
4. A "Why is this region active?" plain-language explanation generated by `Narrator`.

### 28.4 Aggregate mode

`/brain` route renders the same SVG with `mode="aggregate"`. `intensity` is replaced by *daily firing rate* over the last 30 days. Hover surfaces a sparkline. Used to spot regional under-utilisation (e.g. `tpj_right` rarely firing → theory-of-mind code path may be dead).

This is the operational analogue to fMRI: the system literally shows the user which parts of its brain are working.

## 29. UX acceptance gates

These gates extend §10 (PRD 2.0) with frontend-specific criteria that must pass for v2.0 release.

| Gate | Criterion | Verification |
|---|---|---|
| UX-1 | Every cognitive widget renders for an empty/zero state without error | Storybook + Playwright snapshot, all stories pass |
| UX-2 | Every SSE event type has a store reducer + at least one consumer component | `tests/sse-coverage.test.ts` discriminated-union exhaustiveness |
| UX-3 | All 26 brain regions in §28.1 have an SVG group AND at least one entry in Appendix C | `tests/brain-region-coverage.test.ts` |
| UX-4 | All 17 thinking components are covered (§25.2) | `tests/thinking-coverage.test.ts` |
| UX-5 | Reduced-motion fallback verified for every widget that animates | `@axe-core/playwright` + custom motion-policy check |
| UX-6 | WCAG 2.2 AA across every authed route | axe scan in CI, zero violations |
| UX-7 | INP P75 ≤ 200ms during streaming | Playwright + Long Task API on `e2e-streaming.spec.ts` |
| UX-8 | SSE reconnect resumes without missed events | Playwright kills network mid-stream; final state hash matches |
| UX-9 | Emotional badge surfaces only under §24.1 rules; respects dismiss budget | `tests/emotional-badge.spec.ts` (deterministic fixtures) |
| UX-10 | Replay from audit packet produces identical UI state | Visual diff between live recording and replay snapshot |
| UX-11 | Provider switch (`AI_PROVIDER=anthropic` ↔ `openai`) yields visually identical brain heatmap region set | Cross-provider Playwright matrix |
| UX-12 | Consent slice gates `/generate/new`; no provider enabled → block with help link | `tests/consent-gate.spec.ts` |
| UX-13 | `<GdprPacketViewer />` `Verify hash` matches server-computed SHA-256 of the packet | Round-trip test |
| UX-14 | i18n extraction passes (no untranslated literal strings in components) | `pnpm i18n:lint` |
| UX-15 | All 4 glia types have an infrastructure registrant (§27.3) | `tests/glia-coverage.test.ts` |
| UX-16 | All 5 functional networks (§26.11) render under their overlay toggle | `tests/network-overlay.spec.ts` |
| UX-17 | All 4 action classes (§25.7) tagged on every audit entry; per-day mix renders on `/brain` | `tests/action-class-coverage.test.ts` |
| UX-18 | All 5 mindset axes (§25.5) have at least one user-visible surface AND zero "you are" voice in copy | `tests/mindset-voice-policy.spec.ts` |

Failing any UX-N blocks release.

---

## Completion stamp

**Complete: Neural Signaling and Activation.**

Every cognitive and neural concept has a corresponding implementation locus in this document:

- **Mindset** (5 axes: growth/fixed, self-efficacy, locus of control, goal orientation, self-image) → §25.5 mindset taxonomy + §27 cell types + §26.6 plasticity (LTP/LTD/homeostatic).
- **Emotion** → §24.1–3 (three affect specialists), §24.5 (dimensional projection + OCC appraisal), §26.5 (neuromodulator analogues), §21.3.8 (UI surface).
- **Thinking (all 17 components)** → §25.1: perception, attention, working memory, semantic memory, episodic memory, **procedural memory**, **categorisation**, **problem solving**, **mental simulation / counterfactual**, reasoning, planning, decision, production, critique, metacognition, affect, action selection.
- **Thoughts (7 modes)** → §25.6: verbal, visual, conceptual, counterfactual, prospective, retrospective, self-referential, other-referential.
- **Actions (4 classes)** → §25.7: reflexive, habitual, goal-directed, communicative — every audit entry carries `action_class`.
- **Brain cells** → §27.1 (8 neuron cell types × 7 neurotransmitters across 27 registry entries) + §27.3 (4 glia types: astrocytes, oligodendrocytes, microglia, ependymal).
- **Neural signaling** → §26.2 spiking, §26.3 activation, §26.4 refractory, §26.5 neuromodulators, §26.6 plasticity (LTP + LTD + homeostatic), §26.7 topology bounds, §26.8 pathologies, §26.9 oscillations (delta/theta/alpha/gamma), §26.10 offline consolidation, §26.11 functional networks (DMN/salience/CEN/DAN/VAN).
- **Activation** → §26.3 firing-rate model + §28 UI render path + §22.4 event-to-component table + §28.5 functional-network overlay.

A specialist cannot be merged unless it carries `@brain`, `@thinking`, `@cellType`, `@neurotransmitter`, `@layer`, and `@actionClass` JSDoc tags; CI enforces presence (`tests/cell-type-coverage.test.ts`, `tests/glia-coverage.test.ts`) and consistency (`tests/specialist-registration-parity.test.ts`, `tests/brain-region-coverage.test.ts`, `tests/thinking-coverage.test.ts`, `tests/action-class-coverage.test.ts`, `tests/mindset-voice-policy.spec.ts`, `tests/network-overlay.spec.ts`).

**Coverage closure**: 17 thinking components + 5 mindset axes + 8 thought modes + 4 action classes + 8 neuron cell types + 4 glia types + 7 neurotransmitters + 26 brain regions + 5 functional networks + 4 oscillation bands + 5 plasticity mechanisms (LTP, LTD, STDP, homeostatic, sleep consolidation) + 5 pathology modes = **98 distinct cognitive/neural primitives**, each with a code locus, a CI gate, and a node in the canonical knowledge graph (§30).

---

## 30. Canonical knowledge graph (`@retune/onto`)

The cognitive and neural taxonomies in §24–§28 are not just markdown documentation; they are materialised as a versioned, machine-readable knowledge graph. This is what makes the architecture genuinely SOTA: every primitive is a queryable node with cross-references to canonical biomedical ontologies.

### 30.1 Single source of truth

`@/Users/shubhamkanse/retune/packages/onto/src/cognitive.jsonld` is the **authoritative source** for every cognitive/neural primitive. The markdown tables in §24–§28 and PRD Appendix E are now *derived views*; the JSON-LD is the contract.

- **Format**: JSON-LD 1.1 (W3C standard).
- **Vocabulary**: `https://retune.dev/onto/cognitive/v1#` with custom predicates (`tagsRegion`, `coversThinking`, `embodiesCellType`, `participatesIn`, `actionClass`, `emitsGoal`, …).
- **Reused vocabularies**: `rdfs`, `owl`, `skos`, `dcterms`.
- **Cross-references** (`skos:exactMatch` / `skos:closeMatch`) to OBO Foundry and related canonical ontologies:
  - **UBERON** — anatomical brain regions (`uberon:0013528` for DLPFC, etc.)
  - **ChEBI** — neurotransmitters (`chebi:18243` for dopamine, etc.)
  - **GO** — biological processes (`go:0060079` for LTP, `go:0060080` for LTD, etc.)
  - **DOID** — pathology modes (`doid:1826` for seizure, etc.)
  - **MFOEM** (Mental Functioning / Emotion Ontology) — emotional states
  - **CogPO** — functional networks and cognitive concepts
  - **NIFSTD / NeuroLex** — neuroscience entities (cell types, glia)

### 30.2 Counts (authoritative)

| Class | Count | Cross-references |
|---|---|---|
| `Specialist` | 27 | — |
| `BrainRegion` | 26 | UBERON, NIFSTD |
| `Network` | 5 | CogPO |
| `CellType` | 8 | NIFSTD |
| `GliaType` | 4 | NIFSTD |
| `Neurotransmitter` | 7 | ChEBI |
| `ThinkingComponent` | 17 | CogPO |
| `MindsetAxis` | 5 | — |
| `ThoughtMode` | 8 | — |
| `ActionClass` | 4 | — |
| `OscillationBand` | 4 | — |
| `PlasticityMechanism` | 5 | GO |
| `PathologyMode` | 5 | DOID, GO |
| `EmotionalState` | 5 | MFOEM |
| `GoalKind` | 24 | — |
| `ConflictMonitor` | 13 | — |
| `SseEventKind` | 16 | — |
| `Layer` | 9 | — |
| **Total nodes** | **192** | — |
| **Total typed relationships** | **250** | — |

### 30.3 Materialisations

The JSON-LD compiles to multiple consumer-friendly forms; all are deterministic (byte-identical on re-run for unchanged input):

| Output | Path | Consumer |
|---|---|---|
| Compacted JSON-LD | `packages/onto/src/cognitive.jsonld` | RDF tooling (Apache Jena, Oxigraph), external integrators |
| Cypher CREATE statements | `packages/onto/dist/cognitive.cypher` | Neo4j 5.x — graph algorithms (Louvain, centrality, shortest path) |
| Summary JSON | `packages/onto/dist/summary.json` | CI dashboards |
| TypeScript types | `packages/onto/src/types.ts` | Compile-time safety in `apps/api`, `apps/web`, specialists |
| Typed runtime accessor | `packages/onto/src/runtime.ts` | `import { ontology } from "@retune/onto"` |

### 30.4 CI gates (anti-drift)

`packages/onto/test/coverage.test.ts` runs in CI and fails the build if:

- Any of the 18 class counts in §30.2 drifts from the markdown.
- Any `Specialist` node is missing a required relationship (`actsAt`, `embodiesCellType`, `usesNeurotransmitter`, `tagsRegion`, `actionClass`, `coversThinking`).
- Any `BrainRegion` has zero specialists tagging it AND is not on the documented infrastructure-bridge allowlist (`motor`, `hippocampus`, `thalamus`, `corpus_callosum`).
- Any `ThinkingComponent` is uncovered AND not on the infrastructure-bridge allowlist (`actionSelection`).
- Any `CellType` is unembodied (except `relay`, which is realised by infrastructure).
- Any `Neurotransmitter` is unused.
- Any cross-reference IRI is malformed (must match `^(uberon|chebi|go|doid|mfoem|cogpo|nlx):[A-Za-z0-9_/.-]+$`).

`packages/onto/test/cypher.test.ts` additionally enforces:

- Cypher export is byte-identical on re-run.
- Node count in Cypher equals total graph node count.
- Every Specialist has exactly one `ACTS_AT` relationship.

### 30.5 Querying the graph

**From TypeScript** (compile-time-checked):

```ts
import { ontology } from "@retune/onto";

// Forward query
const orch = ontology.specialist("retune:specialist.Orchestrator");
console.log(orch?.tagsRegion); // ["retune:region.dlpfc"]

// Inverse queries
ontology.specialistsForRegion("retune:region.dlpfc");
ontology.specialistsForThinking("retune:thinking.metacognition");
ontology.specialistsInNetwork("retune:network.salience");
ontology.specialistsForNeurotransmitter("retune:nt.dopamine");
```

**From Neo4j Cypher**:

```cypher
// What does the Salience Network do?
MATCH (n:Network {id: 'retune:network.salience'})<-[:PARTICIPATES_IN]-(s:Specialist)
RETURN s.label;

// Which thinking components are uncovered?
MATCH (t:ThinkingComponent)
WHERE NOT (:Specialist)-[:COVERS_THINKING]->(t)
RETURN t.label;

// Shortest cognitive-pathway: from JD perception to ship decision
MATCH p = shortestPath(
  (a:Specialist {id:'retune:specialist.JdSpanExtractor'})
  -[*]-
  (b:Specialist {id:'retune:specialist.RefuseOrShipGate'})
)
RETURN p;

// Community detection over functional networks
CALL gds.louvain.stream({
  nodeProjection: ['Specialist', 'BrainRegion', 'Network'],
  relationshipProjection: ['TAGS_REGION', 'PARTICIPATES_IN']
}) YIELD nodeId, communityId
RETURN gds.util.asNode(nodeId).label AS node, communityId
ORDER BY communityId;
```

**From any RDF tool** (SPARQL, after JSON-LD → Turtle conversion via `riot` or `pyld`):

```sparql
PREFIX retune: <https://retune.dev/onto/cognitive/v1#>
PREFIX skos:   <http://www.w3.org/2004/02/skos/core#>

SELECT ?specialist ?uberonRegion WHERE {
  ?specialist a retune:Class.Specialist ;
              retune:tagsRegion ?region .
  ?region skos:exactMatch ?uberonRegion .
  FILTER(STRSTARTS(STR(?uberonRegion), "http://purl.obolibrary.org/obo/UBERON_"))
}
```

### 30.6 Versioning

The ontology follows SemVer (`@retune/onto/package.json` + `@version` on the JSON-LD root + `dcterms:hasVersion`):

- **Patch** — fix a wrong cross-reference IRI, typo in label, missing `comment`.
- **Minor** — add a new node, new relationship type, new optional property.
- **Major** — remove or rename a node (consumers must migrate); change a class hierarchy; change a relationship's range.

A breaking change requires:
1. Bump `version` in `cognitive.jsonld` and `package.json`.
2. Update `EXPECTED_COUNTS` in `coverage.test.ts`.
3. Update §30.2 of this document.
4. Update markdown tables in §24–§28 to mirror.
5. Add a migration note to `packages/onto/CHANGELOG.md`.

### 30.7 Roadmap

- v0.2 — Add SHACL shapes (`shapes.shacl.ttl`) for formal semantic-web validation.
- v0.3 — Uplift the 8 recruitment ontologies in `packages/agent/assets/*.json` to JSON-LD with the same `@context`.
- v0.4 — Generate an interactive HTML viewer (D3 force layout + Louvain communities) at `dist/explorer.html`.
- v1.0 — Publish the graph to a public SPARQL endpoint (Oxigraph) for external integrators; commit to a stable IRI scheme.

---

**End of `technical-2.0.md`.** See `prd-2.0.md` for the product contract; `@/Users/shubhamkanse/retune/packages/onto/README.md` for the ontology's developer guide.
