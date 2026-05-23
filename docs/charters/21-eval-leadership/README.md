# Charter 21 — Eval Leadership

**Priority:** P1 — owns the quality bar
**Owner:** ML / Eval engineering lead
**Status:** Scoped (2026-05-23). Epic files to follow.

## Mission

Make Retune's cognitive output quality measurable, regression-safe,
and improvable. Every change to a specialist, prompt, model, or
pipeline component is gated by an evaluation that proves it didn't
make resumes worse.

## Why this is its own charter

Charter 09 (AI/ML Excellence) owns the *infrastructure* — provider
abstractions, prompt registry, fallback router, cost tracking. This
charter owns the *quality measurement*: cases.jsonl curation, evals
that score against rubrics, leaderboards across model + prompt
versions, the canonical-set integrity test. Without this, AI/ML
excellence is theatre.

## Current state (verified 2026-05-23)

| Asset | State |
|-------|-------|
| `packages/eval/` | Real package; runs `pnpm --filter @retune/eval eval` against a fixture cache. |
| `tests/cases.jsonl` | Canonical set: **14 cases** (architect-verified). Charter target: 200+. |
| Mock vs live | `--baseline-only` runs against the fixture cache (CI-fast); `--live` runs real LLM calls (nightly, gated by `cases.jsonl` reaching 200+). |
| Provider parity | `provider-parity` job in `cognitive-cycle.yml` runs the same cases against both Anthropic + OpenAI and asserts shape equivalence. |
| Rubrics | Inline scoring functions in `packages/eval/src/`. Not yet versioned or human-aligned. |
| Leaderboard / regression detection | None. New PRs don't see a quality delta. |

## Goals

1. **Expand canonical set** from 14 → 200 cases covering: software eng, product, design, data, marketing, ops, finance, healthcare, education. Each with a hand-graded rubric reference.
2. **Quality regression gate** in CI: every PR touching `packages/agent/`, `packages/eval/`, or specialist prompts runs the mock-mode eval and reports delta vs main.
3. **Live nightly run** producing a Grafana dashboard of quality scores over time, by model + provider + prompt version.
4. **Human-aligned rubrics**: the scoring rubrics are calibrated against human reviewers' grades on a 50-case sample.
5. **Refusal coverage**: % of cases that should refuse (insufficient evidence, role-mismatch) and our refusal rate against ground truth.

## Epics

| # | Title | Description |
|---|-------|-------------|
| 01 | Canonical set expansion | Curate 200 cases. Each: (resume, JD, expected outcome, rubric grades). Source from anonymised production runs + synthetic adversarial cases. |
| 02 | Quality regression gate | PR-blocking CI job. Mock-mode eval + delta report posted as PR comment. |
| 03 | Live eval pipeline | Nightly real-LLM run; results into a `eval_runs` Postgres table; Grafana dashboard. |
| 04 | Rubric calibration | 50-case human-grading session; tune scoring weights to match. Quarterly cadence. |
| 05 | Refusal accuracy tracking | Add expected-refusal flag to every case; track precision + recall on refusal vs ground truth. |

## Success metrics

- Canonical set ≥ 200 cases.
- Mock-mode eval p50 score never drops > 2pp PR-over-PR (gated).
- Live eval runs nightly with > 95% successful completion.
- Rubric vs human-grade correlation ≥ 0.85.
- Refusal F1 ≥ 0.80.

## Dependencies

- Charter 09 (AI/ML) — provider parity tests reused.
- Charter 05 (Observability) — eval results land via the structured log path.

## Out of scope

- Real-time quality monitoring on production traffic — separate
  charter (would be 21.6 or a sibling).
- Adversarial / red-team testing — Charter 26 (AI Safety) owns that.

## Owner

Eval lead + ML engineering. Quarterly review with product.
