# Charter 28 — Breakthrough SOTA

**Status:** Active (2026-06-13).
**Authority:** Anchored to the June 2026 architecture audit. Every epic targets a verified gap between Retune's current "good generator with a SOTA spine" and a future-proof, learning, agentic platform. No claim survives without a code anchor.

> **Thesis.** Retune's substrate (auditable ticks, refuse-or-ship gate, verdict-first, evidence ledger, BYOK) is best-in-category. Its *intelligence* is thin: 7 of 19 specialists call an LLM, nothing learns from the `outcomes` funnel, the `career_facts` ledger is written but never read, and the live runtime is the in-memory path while Temporal sits unused. This charter closes the gap in three movements — **Reliability**, **The Moat**, **The Relationship & Reach**.

---

## The one bet

**An outcome-calibrated, evidence-backed career graph that learns per user.** Foundation models commoditise; proprietary outcome data and a compounding per-user graph do not. Epics 03 + 04 are the moat; everything else earns the right to build them (reliability) or multiplies their value (reach).

---

## Epic index

| Epic | Title | Movement | Priority | Complexity | Code anchor |
|------|-------|----------|----------|------------|-------------|
| [01](./epic-01-parallel-dag-runtime.md) | Parallel phase-DAG runtime | Reliability | P0 | L | `packages/agent/src/workbench/orchestrator.ts`, `attention-scheduler.ts` |
| [02](./epic-02-resilience-circuit-breakers.md) | Circuit breakers on all egress | Reliability | P0 | M | `packages/agent/src/lib/providers/*`, `ml-client/*` |
| [03](./epic-03-outcome-calibration.md) | Outcome-calibrated prediction | The Moat | P0 | L | `specialists/outcome-predictor.ts`, `outcomes` table |
| [04](./epic-04-career-graph-retrieval.md) | Compounding career-graph retrieval | The Moat | P0 | L | `lib/career-facts.ts`, `career_facts` table |
| [05](./epic-05-live-grounding.md) | Live company/role grounding | The Moat | P1 | M | `specialists/theory-of-mind.ts` |
| [06](./epic-06-agentic-followthrough.md) | Agentic follow-through | Reach | P1 | L | `outcomes`, `applications` tables |
| [07](./epic-07-multimodal-ingestion.md) | Multimodal ingestion | Reach | P2 | M | `lib/profile-domain/*` |
| [08](./epic-08-distribution-conversational.md) | Distribution + conversational refine | Reach | P2 | M | `components/results/refine-modal.tsx`, `/v1` |
| [09](./epic-09-hygiene-consolidation.md) | Hygiene & consolidation | Reliability | P0 | S | `/(auth)/brain/page.tsx`, migration tracks |

---

## Sequencing

1. **Reliability first (Epics 02, 09, 01).** Circuit breakers and hygiene are isolated and low-risk; do them first. The parallel DAG is a planner swap that touches the hot path — land it on a green base.
2. **The Moat (Epics 04, 03, 05).** Career-graph retrieval before outcome calibration: retrieval makes every generation better immediately; calibration needs accumulated outcome volume to be meaningful, so it ships behind an `n >= MIN_SAMPLES` gate and improves over time.
3. **Reach (Epics 06, 08, 07).** Follow-through turns the transaction into a relationship; distribution makes it spread; multimodal widens the funnel.

**Hard dependencies:** Epic 03 depends on Epic 06's `application_events` for funnel data. Epic 04 depends on the `career_facts` table (migration 0018, shipped). Epic 01 depends on Epic 02 (breakers must wrap the now-concurrent calls).

---

## Charter-wide Definition of Done

- [ ] All epics' acceptance criteria met and checked.
- [ ] `pnpm typecheck` green across the workspace.
- [ ] Each epic ships with unit tests; no net test regressions.
- [ ] No new client-facing "brain"/neuro terminology (per `feedback_no_brain_terms_ui`).
- [ ] New env vars documented in `.env.example`.
- [ ] Each feature degrades safely: a failure in a new path never blocks a generation that would otherwise succeed.
