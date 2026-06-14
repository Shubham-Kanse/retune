# Epic 04: Compounding Career-Graph Retrieval

**Charter:** 28 — Breakthrough SOTA
**Priority:** P0
**Complexity:** L
**Movement:** The Moat
**Depends on:** `career_facts` table (migration 0018, shipped).

---

## Goal

The `career_facts` ledger is written (from drift answers) but **never read** — every generation starts cold. This epic embeds facts and retrieves the most relevant ones into each generation, so the user's profile *compounds*: the 4th application is measurably better-evidenced than the 1st. This is the per-user moat that base-model improvements cannot replicate.

## Definition of Done

- [ ] Each `career_fact` gets an embedding (provider embeddings or the ML sidecar) stored alongside the row.
- [ ] At generation start, the top-k facts most relevant to the JD's required skills/responsibilities are retrieved and injected as candidate evidence / seed context.
- [ ] Retrieval is additive and safe: zero facts, missing embeddings, or a retrieval failure degrades to today's behaviour without error.
- [ ] Injected facts are clearly provenanced as `source: career_graph` so the evidence/honesty layer treats them at their stored confidence (drift-reported facts are not over-claimed).
- [ ] A "your profile is getting sharper" signal is computable: facts-used count per generation is recorded.
- [ ] Unit tests: cosine ranking, top-k cutoff, empty/degraded paths, provenance tagging.

---

## Story 4.1 — Embed facts on write + backfill

**Acceptance Criteria:**
- [ ] `career_facts` gains an `embedding` column (migration) — pgvector if available, else JSON float array with in-process cosine.
- [ ] On fact upsert, an embedding is computed from `claim (+ evidence)`; failure leaves embedding null (still retrievable by lexical fallback).
- [ ] A backfill path embeds existing null rows lazily.

## Story 4.2 — Retrieve into generation seed

**Acceptance Criteria:**
- [ ] A loader returns the top-k (`RETUNE_CAREER_GRAPH_TOPK`, default 12) facts ranked by similarity to the JD requirement set.
- [ ] Lexical (skill-name overlap) fallback when embeddings are unavailable.
- [ ] Retrieved facts injected at generation start via the existing seed/evidence path, tagged `source: career_graph`.

## Story 4.3 — Honesty + dedupe

**Acceptance Criteria:**
- [ ] A retrieved fact already present in the uploaded profile is deduped (no double counting).
- [ ] Confidence is carried through; the honesty calibrator treats `career_graph` facts at stored confidence, never elevating self-reported drift answers to evidence-grade.
