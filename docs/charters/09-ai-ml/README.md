# Charter 09 — AI/ML Excellence

## Purpose

Establish production-grade AI/ML infrastructure for the Retune cognitive pipeline: versioned prompt management, resilient multi-provider model routing, and granular cost tracking with per-user daily limits.

## Current State

| Area | Status |
|------|--------|
| Prompt Management | Template literals embedded directly in specialist source files (26KB bullet-composer, 31KB gap-mapper, 24KB refuse-or-ship-gate, 20KB narrative-arc-proposer, 10KB cover-letter-composer). No versioning, no A/B testing. |
| Prompt Caching | `packages/agent/src/caching/prompt-cache.ts` exists (4885 bytes) but is NOT wired into any specialist. |
| Model Routing | `AI_PROVIDER` env var switches between OpenAI and Anthropic — only one active at a time, no fallback on errors. |
| Cost Controls | `packages/agent/src/workbench/budget-controller.ts` enforces per-generation ceiling ($0.20 soft, $0.50 kill). No per-user or per-day aggregate cost tracking. No `ai_cost_records` table. |
| Provider Abstraction | `packages/agent/src/lib/ai-provider.ts` (9440 bytes) — clean abstract interface, but no retry/fallback logic. |

## Target State

1. **Prompt Registry** — all specialist prompts extracted into versioned markdown files, loaded via a `PromptRegistry` class. Specialists reference prompts by name, enabling versioning and future A/B testing.
2. **Model Routing & Fallback** — primary provider with automatic fallback to a secondary provider on rate-limit or overload errors. Zero-downtime during provider outages.
3. **Cost Controls** — per-invocation cost records persisted to `ai_cost_records` table, daily per-user cost limits enforced at the generation gate.

## Epics

| # | Epic | Scope |
|---|------|-------|
| 01 | [Prompt Registry](./epic-01-prompt-registry.md) | Extract prompts, build registry, wire specialists, version support |
| 02 | [Model Routing & Fallback](./epic-02-model-routing.md) | Fallback chain in ai-provider, automatic retry on rate-limit/overload |
| 03 | [Cost Controls](./epic-03-cost-controls.md) | `ai_cost_records` table, per-specialist cost persistence, daily user limits |

## Success Metrics

- 100% of specialist prompts loaded from the registry (zero inline template literals for main prompts).
- Provider failover completes in < 2 seconds with zero user-visible errors.
- Every LLM invocation produces an `ai_cost_records` row when persistence is available.
- Users exceeding daily cost limits are blocked within the same tick (no overshoot beyond one specialist call).

## Dependencies

- `packages/agent` (specialists, orchestrator, ai-provider)
- `packages/db` (schema, migrations)
- `packages/billing` (atomicCheckGeneration gate)

## Environment Variables Introduced

| Variable | Service | Purpose |
|----------|---------|---------|
| `AGENT_MODEL_FALLBACK_PROVIDER` | packages/agent | Secondary provider for fallback (`openai` or `anthropic`) |
| `MAX_DAILY_AI_COST_USD` | packages/billing | Per-user daily AI cost ceiling (default `5.00`) |

## Owner

AI Platform Engineering

## Timeline

Target: 3 sprints (6 weeks)
- Sprint 1: Epic 01 (Prompt Registry)
- Sprint 2: Epic 02 (Model Routing & Fallback)
- Sprint 3: Epic 03 (Cost Controls)


## Architect addenda (2026-05-22)

- **Missing `generation_model_calls` table** — `packages/agent/src/lib/provider-shared.ts` already records per-call `ModelCallTelemetry` (cost, tokens, latency, model used) into a buffer. There is no DB target — the buffer is dropped on process exit. Epic 03 (Cost Controls) must include the schema migration AND the persistence-layer hook that drains the buffer per generation. Verified: no `generation_model_calls` or `ai_cost_records` table in `packages/db/src/pg/schema.ts`.
- **`ConcurrencyManager` exists but is unwired** — `packages/agent/src/lib/concurrency-manager.ts` is exported from the agent package but not used by any provider. Specialists fire unlimited parallel LLM calls today. Wire it into the `AIProvider` factory so per-provider concurrency caps are enforced.
- **Provider parity tests already cover Anthropic ↔ OpenAI equivalence** for the four LLM-driven specialists (verified in `.github/workflows/cognitive-cycle.yml` `provider-parity` job). Epic 02 (Model Routing) should reuse this harness as the regression suite for the fallback router.
- **Prompt-cache wiring debt** — `packages/agent/src/caching/prompt-cache.ts` exists but is not imported by `packages/agent/src/lib/provider.ts`. Epic 01 must wire it (NOT a separate epic) — the cache exists, just plug it in.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 9.
