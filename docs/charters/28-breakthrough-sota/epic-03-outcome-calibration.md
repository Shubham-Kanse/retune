# Epic 03: Outcome-Calibrated Prediction

**Charter:** 28 — Breakthrough SOTA
**Priority:** P0
**Complexity:** L
**Movement:** The Moat
**Depends on:** Epic 06 (`application_events` funnel data).

---

## Goal

`OutcomePredictor` emits a heuristic interview probability; the `outcomes` table is collected but **nothing learns from it**. This is the single most defensible feature: a "will I get this interview" number calibrated on real recorded outcomes is uncopyable without the data. Replace the bare heuristic with an empirically-calibrated prior, gated behind a minimum-sample threshold so it only activates once there is signal, and degrades to the current heuristic below it.

## Definition of Done

- [ ] A nightly/loadable aggregation turns `outcomes` (+ `application_events`) into calibration statistics keyed by feature buckets (role family, seniority, must-have coverage band, voice-drift band).
- [ ] `OutcomePredictor` blends the heuristic with the empirical rate via a confidence-weighted shrinkage estimator (more samples → more weight on empirical).
- [ ] Below `RETUNE_CALIBRATION_MIN_SAMPLES` (default 100) for a bucket, the predictor returns the heuristic unchanged and labels confidence `heuristic`.
- [ ] The returned estimate carries a `calibration: { source: "heuristic"|"empirical"|"blended", n: number }` provenance field surfaced in the audit packet (not the consumer UI yet).
- [ ] Calibration data is computed from de-identified aggregates only — no per-application PII enters the model.
- [ ] Unit tests: shrinkage math, min-sample gate, monotonicity (higher coverage never lowers the blended estimate at equal n).

---

## Story 3.1 — Calibration aggregation job

**Acceptance Criteria:**
- [ ] A function in `packages/agent/src/memory` (or cron) computes per-bucket `{ n, interview_rate }` from `outcomes` joined to generations/features.
- [ ] Buckets: `{ role_family, seniority, coverage_band, drift_band }`; buckets with `n < MIN_SAMPLES` are omitted (predictor falls back).
- [ ] Output persisted to a small `outcome_calibration` table (migration) or computed-and-cached; idempotent.

## Story 3.2 — Shrinkage blend in the predictor

**Acceptance Criteria:**
- [ ] Blended estimate `p = (w * empirical) + ((1-w) * heuristic)` where `w = n / (n + k)` (k tunable, default 50).
- [ ] Interval widens when `source = heuristic`, narrows as `n` grows.
- [ ] Provenance attached; gate honoured.

## Story 3.3 — Truthfulness guard

**Acceptance Criteria:**
- [ ] The verdict UI copy never overstates confidence: an empirical estimate with small `n` is still labelled provisional.
- [ ] No claim of calibration is shown when `source = heuristic`.
