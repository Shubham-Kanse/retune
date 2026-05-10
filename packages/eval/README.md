# `@retune/eval`

Pre-registered evaluation harness. Per the techspec, **every PR must pass
the eval gate** in CI before merging — no metric on the canonical set may
regress by more than 2 percentage points (PRD §15.1).

## Status — commit #1

This is the foundation scaffold. We commit:

- `src/canonical/cases.jsonl` — 3 seed cases (target: 200 by week 8)
- `src/canonical/loader.ts` — typed loader + zod-validated parsing
- `src/metrics/span-f1.ts` — span-level F1 used by the extraction layer
- `src/metrics/voice-drift.ts` — cosine drift used by the production layer
- `src/runner.ts` — entry point (no real eval logic yet — that lands when
  the workbench can produce drafts in commit #6+)

## Roadmap

| Commit | Adds |
|---|---|
| #1 | Scaffold + 3 seed cases + 2 metrics |
| #2 | Pre-registered metrics manifest, baseline collection scaffolding |
| #3 | Span F1 wired against real ML extraction service |
| #6 | Coherence + voice-drift metrics live |
| #8 | First end-to-end run against the cognitive workbench |

## Pre-registered metrics (target thresholds)

These are the canonical thresholds from the techspec acceptance criteria.
CI gates trigger on regression > 2pp from previous main.

- Span F1 ≥ 0.92
- Discourse classifier F1 ≥ 0.88
- Coherence detection F1 ≥ 0.85 / 0.80 (precision / recall)
- Voice drift cosine ≥ 0.85
- Provenance verification rate ≥ 0.92
- Outcome predictor ECE ≤ 0.05
- Conformal coverage = 0.95 ± 2pp
- Refusal precision ≥ 0.80
