# ADR-001 — Architecture Style: Cognitive Substrate Over CRUD Service

**Status**: Accepted
**Date**: 2026-05-23
**Owner**: Founding engineering
**Charter**: 02-Core-Features

## Context

Retune produces tailored job applications. The naive shape is a CRUD service: receive a request, run a single LLM prompt, store the output, return it. This is what most "AI wrapper" startups ship.

Two problems with the naive shape:

1. **No internal critique.** A single LLM call produces fluent text but has no mechanism to detect when it lies, exaggerates, or skips evidence. The user sees the output and trusts it.
2. **No explainability.** When something goes wrong (hallucinated company, misread JD, embellished claim), there's no audit trail. The system is a black box even to its operators.

## Decision

Retune is built as a **cognitive substrate**: an orchestrator runs many small specialists over a shared blackboard, each writing structured hypotheses, evidence, and conflicts. Generation only ships when an explicit refuse-or-ship gate signs off. Every tick is auditable.

Concretely:

- A **blackboard** (`packages/agent/src/workbench/blackboard.ts`) is the shared state.
- A **goal stack** (`packages/agent/src/workbench/goal-stack.ts`) is the work queue.
- An **orchestrator** (`packages/agent/src/workbench/orchestrator.ts`) loops: pick a goal → dispatch to a specialist → merge writes → check conflicts → repeat.
- A **specialist registry** (`packages/agent/src/specialists/`) holds 30+ small, single-purpose specialists (TitleSchemaRetriever, CredibilityScanner, RefuseOrShipGate, etc.).
- A **trigger bus** (`packages/agent/src/workbench/trigger-bus.ts`) lets monitors subscribe to blackboard writes and stage conflicts asynchronously.
- A **persistence layer** (`packages/agent/src/persistence/`) writes every tick to Postgres so generations are durable, replayable, and queryable for audit.

## Consequences

**Positive**:

- Each specialist is small (~100-500 lines) and individually testable.
- Hypotheses, conflicts, and decisions are queryable rows. Audit screen renders in real time from `audit_entries`.
- New specialists slot in without touching unrelated code (registration is a one-liner).
- The refuse-or-ship gate can hard-stop a generation that doesn't meet the evidence threshold, surfacing a structured refusal to the user.

**Negative**:

- Higher coordination cost per request than a single LLM call (≈10-30 ticks per generation, each with budget checks and persistence).
- Onboarding requires understanding the blackboard / goal-stack / orchestrator triad before any non-trivial change.
- Operating cost is higher per generation (multiple LLM calls). Mitigated by `concurrency-manager.ts` (5 global / 2 per user) and the prompt cache (Charter 09).

## Alternatives Considered

1. **Single-prompt generation with prompt engineering.** Rejected: cannot self-critique; failures are silent; no audit.
2. **Chain-of-prompts (LangChain-style).** Rejected: linear chains miss the "monitor" role (FairnessMonitor, VoiceDriftMonitor) and don't model conflicts as first-class data.
3. **Multi-agent debate (AutoGen-style).** Rejected: agents-as-LLM-personas is too non-deterministic for production; specialists-as-typed-functions is simpler to reason about.

## References

- `packages/agent/src/workbench/orchestrator.ts`
- `packages/agent/src/specialists/refuse-or-ship-gate.ts`
- `docs/technical-2.0.md` §3 (the substrate model)
- `docs/charters/02-core-features/README.md`
