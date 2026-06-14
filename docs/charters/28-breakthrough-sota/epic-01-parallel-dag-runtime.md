# Epic 01: Parallel Phase-DAG Runtime

**Charter:** 28 — Breakthrough SOTA
**Priority:** P0
**Complexity:** L
**Movement:** Reliability
**Depends on:** Epic 02 (breakers must wrap the now-concurrent egress).

---

## Goal

The orchestrator runs strictly one tick at a time (`orchestrator.ts` `while (ticks < max_ticks)`), and the `AttentionScheduler` hardcodes `competence_factor = 1.0` — so the "dynamic planner" is, in practice, a fixed priority order paying the cost of dynamism it never uses. Independent work that *could* run concurrently (the 3 critic personas — already `Promise.all` internally — and per-role bullet composition) is serialised across ticks. This epic lets the orchestrator dispatch a **cohort** of mutually independent ready goals in parallel within a tick, cutting P50 latency 2–3× without changing blackboard, audit, or gate semantics.

## Definition of Done

- [ ] The orchestrator can execute a *cohort* of ready, non-conflicting goals concurrently, committing their writes deterministically (stable order by goal id) so audit/replay stay reproducible.
- [ ] Cohort membership is opt-in and safe: only goals whose specialists declare `parallel_safe` and whose write-paths are disjoint join a cohort; everything else runs sequentially exactly as today.
- [ ] Per-role bullet composition and the critic ensemble run within a cohort.
- [ ] Determinism: given identical inputs and a seeded clock, the persisted audit sequence is identical across runs (commit order is sorted, not race-ordered).
- [ ] A latency benchmark shows ≥2× wall-clock improvement on a representative multi-role generation; no change in output content.
- [ ] Budget accounting and the hard-kill ceiling remain correct under concurrency (charges applied after the cohort, ceiling checked before dispatch).
- [ ] All existing agent tests pass; new tests cover cohort isolation, disjoint-write enforcement, and deterministic commit ordering.

---

## Story 1.1 — Declare parallel-safety on specialists

**Acceptance Criteria:**
- [ ] `Specialist` interface gains optional `parallel_safe?: boolean` (default false → sequential).
- [ ] Composers/critics that only read the blackboard and write disjoint paths are marked `parallel_safe`.
- [ ] A specialist that raises conflicts or mutates shared hypotheses stays sequential.

## Story 1.2 — Cohort selection in the scheduler

**Acceptance Criteria:**
- [ ] New `AttentionScheduler.pick_cohort()` returns the maximal set of ready goals that (a) share the top priority band, (b) map to `parallel_safe` specialists, (c) have statically disjoint declared write-prefixes.
- [ ] Falls back to the existing single `pick()` when no cohort forms.
- [ ] Cohort size is bounded by `RETUNE_MAX_COHORT` (default 4) to respect provider concurrency.

## Story 1.3 — Concurrent dispatch + deterministic commit

**Acceptance Criteria:**
- [ ] Orchestrator runs the cohort with `Promise.all`, then commits results sorted by goal id.
- [ ] Each result is audited as its own entry with a monotonic `seq` assigned in the deterministic order.
- [ ] Budget: ceiling asserted before dispatch; all cohort costs charged after; if the cohort would breach the hard kill, it still commits the completed work then terminates (no partial-write corruption).
- [ ] Conflict staging drains once after the cohort, exactly as the single-tick path does.

## Story 1.4 — Benchmark + guardrail

**Acceptance Criteria:**
- [ ] A repeatable benchmark script measures wall-clock for a 4-role generation, sequential vs cohort.
- [ ] `RETUNE_MAX_COHORT=1` reproduces the exact legacy sequential behaviour (escape hatch).
