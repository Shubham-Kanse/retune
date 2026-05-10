# RetuneAI — Product Requirements Document v2.0

**Codename**: Brain-Cell SOTA Hardening
**Status**: Authoritative — supersedes the legacy `prd.md` / `technical.md` (deleted)
**Owner**: Cognitive Cycle WG
**Last revised**: 2026-05-07

> **One-line product thesis**
> RetuneAI replaces the $300/hr human resume coach with a multi-mind cognitive system that thinks about every job application the way a senior coach + recruiter + hiring manager would, refuses to ship when it cannot do the work credibly, and ships an audit packet (GDPR Article 22) the candidate can read, contest, or replay end-to-end.

---

## Table of contents

1. [Why v2.0 exists](#1-why-v20-exists)
2. [Vision and non-vision](#2-vision-and-non-vision)
3. [User personas](#3-user-personas)
4. [Core user flows](#4-core-user-flows)
5. [Acceptance criteria per flow](#5-acceptance-criteria-per-flow)
6. [Functional requirements](#6-functional-requirements)
7. [Non-functional requirements](#7-non-functional-requirements)
8. [Provider parity (Anthropic + OpenAI)](#8-provider-parity-anthropic--openai)
9. [Failure-mode catalogue](#9-failure-mode-catalogue)
10. [Quality gates and launch criteria](#10-quality-gates-and-launch-criteria)
11. [GDPR Article 22 / fairness / safety](#11-gdpr-article-22--fairness--safety)
12. [Eval methodology](#12-eval-methodology)
13. [Issue catalogue from v1.0 audit](#13-issue-catalogue-from-v10-audit)
14. [Out of scope for v2.0](#14-out-of-scope-for-v20)
15. [Glossary](#15-glossary)
16. [UX and frontend specification](#16-ux-and-frontend-specification)
17. [Cognitive transparency for users](#17-cognitive-transparency-for-users)
18. [Emotional and well-being UX](#18-emotional-and-well-being-ux)
19. [Privacy and consent UX](#19-privacy-and-consent-ux)
20. [Accessibility, performance, mobile](#20-accessibility-performance-mobile)
21. [Appendix A — eval persona × market × role family matrix](#appendix-a--eval-persona--market--role-family-matrix)
22. [Appendix B — refuse/revise/ship decision matrix](#appendix-b--refusereviseship-decision-matrix)
23. [Appendix C — full screen inventory](#appendix-c--full-screen-inventory)
24. [Appendix D — SSE event taxonomy](#appendix-d--sse-event-taxonomy)
25. [Appendix E — Neural signaling and activation (product-surface map)](#appendix-e--neural-signaling-and-activation-product-surface-map)

---

## 1. Why v2.0 exists

A v1.0 audit (2026-05-07) showed:

- 14 specialist files implementing the cognitive cycle (~6 200 LoC).
- 165 unit tests, ~95% pass rate.
- Architecture is sound at the *interior* of every specialist.
- **Architecture is structurally broken at the wiring layer.** The user-facing `POST /generate` endpoint reaches commit #2–#8 specialists only. Commits #9–#14 (`GapMapper`, `EvidenceSolver`, `NarrativeArcProposer`, `SequentialBulletComposer`, `CriticEnsemble`, `OutcomePredictor`, `RefuseOrShipGate`, `TheoryOfMindSpecialist`, `VoiceDriftMonitor`, `WellBeingMonitor`) are dead code in the production path because (a) the API runtime never registers them and (b) no part of the system seeds the goals (`map_gaps`, `propose_arcs`, …, `decide_refuse_or_ship`) that would invoke them.
- Three correctness bugs (voice-fingerprint dimension mismatch, listener-driven conflicts not persisted, two specialists handling the same goal kind).
- One build break (`apps/web` Next.js bundle pulls `@temporalio/worker` → `@swc/wasm`, missing).
- One module-load-time bomb (top-level `new Anthropic({ apiKey })` runs in jsdom and the Anthropic SDK refuses to initialize without `dangerouslyAllowBrowser: true`, breaking 130/389 web vitest tests).
- The eval harness scores hand-authored expert packages against hand-authored metrics and prints `LAUNCH READY` — a tautology, not a system test.

PRD 2.0 is the product contract that makes the existing engineering investment usable. It is not a redesign. It is an integration, correctness, and operational-readiness pass with explicit acceptance criteria for every issue and an explicit dual-provider (Anthropic + OpenAI) requirement.

PRD 1.0 told us what the brain should think. PRD 2.0 tells us how the synapses connect.

## 2. Vision and non-vision

### Vision (unchanged from PRD 1.0)

A candidate uploads a job description, optionally a profile, and within ≤ 60 seconds receives:

1. A tailored resume with provenance for every claim.
2. A cover letter calibrated to company culture and discourse norms.
3. A LinkedIn About snippet matched to the user's voice.
4. A recruiter-outreach message.
5. A calibrated callback-probability with a 95% conformal interval.
6. A GDPR Article 22 audit packet describing every decision the system made.
7. A refuse-and-explain disclosure if the system cannot do the work credibly (e.g. user lacks an active US security clearance the JD requires).

Quality target (12 months post-launch): **≥ 35% callback rate** vs the $300/hr coach baseline of 28% (a 7-percentage-point lift). Cost: ≤ $0.005 per generation steady state.

### Non-vision

- Not a job board.
- Not an interview-coach.
- Not a salary-negotiation tool.
- Not a multi-candidate ATS for recruiters.
- Not an LLM proxy or "ChatGPT for resumes".
- Not localised in v2.0 — English only (see §14).

## 3. User personas

We optimize for five canonical personas across eight markets. The eval harness covers the full 5 × 8 × 5 = 200-cell matrix (Appendix A).

| Persona | n samples in eval | Distinguishing signal |
|---|---|---|
| `new_grad` | 40 | < 2 yrs experience, internships dominate, GPA optional. Voice: aspirational, direct. |
| `experienced_ic` | 40 | 3–8 yrs, multi-role, evidence dense. Voice: metric-led. |
| `senior_ic` | 40 | 8+ yrs, depth in one stack. Voice: scope-led, mentor-coded. |
| `manager` | 40 | People + program leadership. Voice: outcome-oriented. |
| `career_changer` | 40 | Cross-domain pivot, transferable evidence dominates. Voice: narrative-led. |

**Markets**: US, UK, EU (DE/NL), CA, AU, IN, EU (FR/ES), Remote-Global. Each market has known cultural expectations (US: directness + metrics; UK: understatement; DE: credentials + structure; etc.) which the `CulturalCalibrator` (commit #7) projects onto an 8-dim cultural fingerprint and the `SequentialBulletComposer` (commit #10) consumes.

**Role families**: `backend_swe`, `frontend_swe`, `mle`, `data_eng`, `pm`, `dev_advocate`, `sre`, `security`. Eight role families; not all combinations populated (PMs in IN dev-advocate market is sparse — eval set notes which cells are empty).

## 4. Core user flows

### 4.1 Onboarding (one-time per user)

1. User signs up (email + password OR Google OAuth).
2. User uploads resume PDF/DOCX → `apps/web/api/onboarding/upload` extracts text via Anthropic structured output OR OpenAI structured output (provider-pluggable).
3. User answers ≤ 8 chat-style questions to fill profile completeness ≥ 75%.
4. System computes voice fingerprint (`VoiceFingerprintExtractor`, deterministic stylometry, no LLM call).
5. System enters `READY_TO_GENERATE` state.

**Acceptance**: 95th percentile onboarding completion time ≤ 6 minutes for users with an existing PDF resume. < 90 seconds if they paste structured text.

### 4.2 Generate (per application)

1. User pastes/types job description, optionally JD URL, optionally company name.
2. Frontend `POST /generate` with `{jd_text, jd_title, company, jd_url?}`.
3. Backend creates `generation_id`, returns 202 immediately.
4. Frontend subscribes to SSE `/generate/:id/stream`.
5. Cognitive cycle runs:
   - **Comprehension** (commits #2, #6, #7): title + company schema → JD spans → discourse map → boilerplate strip → cultural vector.
   - **Profile reflection** (commit #8): voice fingerprint → honesty calibration → credibility scan.
   - **Strategy** (commit #9): gap map → evidence solver.
   - **Production** (commit #10): narrative arcs → bullet composer.
   - **Critique** (commits #11, #14): critic ensemble → theory-of-mind belief modeling.
   - **Decision** (commits #12, #13): outcome predictor → refuse-or-ship gate → GDPR audit packet.
6. SSE stream emits `trace` events per tick + `complete` event with verdict.
7. If verdict = `ship`: documents rendered (resume.docx, cover.docx, linkedin.md, outreach.txt) + GDPR packet.
8. If verdict = `revise`: surfaced as `request_user_input` goal; user prompted to clarify.
9. If verdict = `refuse`: surfaced with structured reasons + the right-to-contest disclosure.

**Acceptance**: P95 latency from `POST /generate` to first SSE `complete` event ≤ 60 seconds (mocked-LLM path: ≤ 5 seconds). End-to-end cost ≤ $0.005 per ship. Refuse rate ≤ 15%. Zero fabrication conflicts in shipped packages.

### 4.3 Refine (after ship)

1. User selects text in the rendered resume.
2. User asks to rewrite, expand, soften, or align to a different arc.
3. `POST /refine/selection` runs a single specialist (`SequentialBulletComposer`'s rewrite mode) with the original constraints + user's new directive.
4. Voice-drift monitor and fairness monitor both fire on the new bullet.
5. If either listener raises a `high` severity concern, the rewrite is staged for user review rather than auto-applied.

**Acceptance**: P95 refine round-trip ≤ 8 seconds. Voice-drift cosine similarity ≥ 0.85 vs baseline.

### 4.4 Outcome tracking (post-ship)

1. User receives a callback / interview / offer / rejection.
2. User logs the outcome via dashboard.
3. Outcome flows to:
   - `honesty_calibrations` table (Bayesian update per claim_type for this user).
   - `voice_centroids` table (incremental centroid update).
   - `outcomes` table (training data for the `OutcomePredictor`'s empirical-conformal calibration once n ≥ 100).
4. Future generations for this user use the updated priors.

**Acceptance**: Outcome write is idempotent (replay-safe). Calibration update is bounded ≤ 200ms.

## 5. Acceptance criteria per flow

For every flow above, the v2.0 acceptance suite enforces:

### 5.1 Provider parity

Every flow MUST pass with `AI_PROVIDER=anthropic` AND with `AI_PROVIDER=openai`. The CI matrix runs both. A flow that succeeds on one but fails on the other is a release blocker.

Specifically:
- Same blackboard contents (`hypotheses.*`, `draft.*`, `evidence_graph.*`).
- Same goal stack progression (within ±1 tick — providers may emit slightly different child goals based on model behavior).
- Same verdict distribution (ship/revise/refuse) on the canonical eval set, within ±5pp.
- Cost differs (OpenAI: ~$0.004/gen; Anthropic: ~$0.005/gen at default smart=Sonnet, fast=Haiku) but both stay under the $0.005 ceiling.

### 5.2 Determinism

For deterministic specialists (no LLM):
- `VoiceFingerprintExtractor`: same input bytes → byte-identical 128-dim output.
- `GapMapper`: same `requirement_matches + role_schema + discourse_map + honesty_calibration + hidden_disqualifiers` → identical `gap_map`.
- `EvidenceSolver`: same `gap_map + bullet_budget + max_claims_per_bullet` → identical `solver_solution`.
- `OutcomePredictor` (cold-start mode): identical signals → identical Wilson interval.

For LLM-driven specialists (Sonnet/Opus/4o):
- Temperature is fixed at 0.0 for all critic + arc-proposer + bullet-composer calls.
- Same prompt + same model + temperature 0 → same output (modulo provider non-determinism, ~1% string drift accepted).
- Determinism within a single generation: not required (each LLM call is independent).

### 5.3 Auditability

Every shipped document MUST come with:
- `gdpr_audit_packet` listing every specialist that ran, every decision, every model + token cost.
- `provenance` for every claim in every bullet (≥ 92% coverage; PRD 1.0 §1.6).
- `trace` log of all blackboard writes ordered by `seq`.

### 5.4 Refuse-and-explain

When the system refuses to ship, the response MUST contain:
- Verdict reason (which criterion failed: `outcome_below_floor`, `unresolved_fabrication`, `voice_drift_majority`, `ats_coverage_below_60`, `hidden_disqualifier_match`).
- Plain-language summary suitable for the user.
- The Article 22 right-to-contest disclosure.
- A `recommended_next_step` (e.g. "obtain US security clearance before re-applying" or "add 2 quantified bullets to the metrics section").

## 6. Functional requirements

### 6.1 Comprehension layer

| Requirement | Source | Acceptance |
|---|---|---|
| Resolve JD title to canonical `RoleSchema` | `TitleSchemaRetriever` | 100% of canonical eval titles resolve to a known role. |
| Resolve company name to `CompanySchema` (alias-aware) | `CompanySchemaRetriever` | 95% of `cases.jsonl` companies resolve. |
| Extract typed spans (`requirement`, `responsibility`, `metric`, `entity`) from JD text | `JdSpanExtractor` | ≥ 80% F1 vs hand-labeled gold spans on 50-case subset. |
| Classify each JD sentence into `{filter, actual_test, aspiration, culture, legal, boilerplate}` | `DiscourseClassifier` | ≥ 75% per-class accuracy on 200 hand-labeled sentences. |
| Suppress `legal` + `boilerplate` importance for downstream weighting | `BoilerplateStripper` | Idempotent; importance = 0 on stripped sentences; texts retained. |
| Project culture-tagged sentences onto 8-axis cultural fingerprint | `CulturalCalibrator` | Each axis ∈ [-1, 1]; deterministic given embedder. |

### 6.2 Profile reflection layer

| Requirement | Source | Acceptance |
|---|---|---|
| Compute deterministic 128-dim stylometric voice fingerprint | `VoiceFingerprintExtractor` | Byte-identical output for identical input bytes. L2-normalized. Same dimension semantics as `VoiceDriftMonitor`. |
| Compute per-(user, claim_type) honesty calibration via Bayes Beta(1,1) prior | `HonestyCalibrator` | Cold-start: 0.5 for all kinds. With historical outcomes: posterior = (1+v)/(2+v+u). Persisted to `honesty_calibrations` table. |
| Mine `legal` + `boilerplate` sentences for hidden disqualifiers (8 patterns) | `CredibilityScanner` | Severity-ordered output. clearance > citizenship > work-auth > certs > degree > onsite > background-check > non-compete. |

### 6.3 Strategy layer

| Requirement | Source | Acceptance |
|---|---|---|
| For every JD requirement, assign disposition ∈ `{direct_hit, implied_hit, transferable, missable, must_address_in_cover_letter, must_omit_from_application}` | `GapMapper` | Multi-signal fusion (evidence presence + ontology traversal + adjacent-domain transfer + discourse weighting + honesty calibration). Deterministic. |
| Detect AND/OR groups in JD requirements; enforce satisfaction | `GapMapper` | AND: all members satisfied or none. OR: at least one. Group satisfaction confidence reported. |
| Find optimal evidence → claim → bullet assignment | `EvidenceSolver` | Branch-and-bound with constraint propagation. Hard constraints: high-confidence direct hits MUST be assigned. Soft objective: weighted coverage. < 50ms P99 for ≤ 50 requirements. |
| Honor disqualifier overlap | `EvidenceSolver` | If a hard disqualifier maps to a key requirement, the solver emits a `hidden_disqualifier_blocker` and the gate refuses. |

### 6.4 Production layer

| Requirement | Source | Acceptance |
|---|---|---|
| Propose 3–5 narrative arc candidates | `NarrativeArcProposer` | LLM-driven. Each arc has thesis, voice, feasibility ∈ [0,1]. |
| Choose preliminary arc | `NarrativeArcProposer` | Highest feasibility wins; reasoned. |
| Compose resume bullets via 10-stage micro-pipeline | `SequentialBulletComposer` | Lead-bullet → template → verb → metric → calibration → LLM gen → honesty post-check → first-impression check → coherence check → voice-drift gate. ≤ 2 retries per bullet. Failed bullets marked `pending_revision`. |
| Compose cover letter | `SequentialBulletComposer` (cover-letter mode, deferred to v2.1) | Stub OK in v2.0; passing-tests OK. |
| Compose LinkedIn About | (deferred to v2.1) | Stub OK in v2.0. |

### 6.5 Critique layer

| Requirement | Source | Acceptance |
|---|---|---|
| Three independent critics (recruiter, hiring manager, self-image) score the package | `CriticEnsemble` | 3 parallel LLM calls. Each returns score ∈ [0, 100], preferred arc, top concern. |
| Detect divergence > 20pt between critics → escalate to frontier teacher | `CriticEnsemble` | Opus or GPT-5 escalation. Tracked in trace. ≤ 2.5% of generations after month 4. |
| Model the recruiter's belief state (epistemic) | `TheoryOfMindSpecialist` | New goal kind `model_recruiter_beliefs`. Runs **before** `select_arc`. Outputs `RecruiterBeliefState`. |

### 6.6 Decision layer

| Requirement | Source | Acceptance |
|---|---|---|
| Predict callback probability with conformal interval | `OutcomePredictor` | Cold-start: Wilson score 95% interval. ≥ 100 outcomes: empirical conformal residuals. |
| Aggregate quality signals + apply ship/revise/refuse matrix (Appendix B) | `RefuseOrShipGate` | Verdict tracks Appendix B exactly. Always emits GDPR packet. |
| Persist GDPR audit packet to `gdpr_packets` table | `RefuseOrShipGate` (commit #13 + new persistence in v2.0) | Replayable; `audit_trail` joins. |

### 6.7 Listeners (cross-cutting)

| Listener | Triggers on | Effect |
|---|---|---|
| `FairnessMonitor` | every blackboard write to `hypotheses.discourse_map` or `draft.bullets.*` or `draft.sections.*` | Raises `fairness_concern` conflict. Persisted to `conflicts` table (v2.0 fix). |
| `VoiceDriftMonitor` | `draft.bullets.*` writes | Computes cosine to `voice_fingerprint` baseline. Drift > τ → `pending_revision`. Persisted (v2.0 fix). |
| `WellBeingMonitor` | tick-cadence audit-trail entries | Detects high retry rates / pending-revision accumulation / self-image divergence. Surfaces `well_being` conflict. Persisted. |

## 7. Non-functional requirements

### 7.1 Latency

| Path | Target P50 | Target P95 | Stretch |
|---|---|---|---|
| `POST /generate` → 202 | 50 ms | 200 ms | 100 ms |
| `POST /generate` → first `trace` SSE event | 500 ms | 2 s | 1 s |
| `POST /generate` → `complete` SSE event (mocked LLM) | 3 s | 5 s | 4 s |
| `POST /generate` → `complete` SSE event (real LLM) | 30 s | 60 s | 45 s |
| `POST /refine/selection` → response | 4 s | 8 s | 6 s |
| `POST /active-questions/:id/answer` → resume | 100 ms | 500 ms | 250 ms |

### 7.2 Cost

| Phase | Per generation (real LLM) |
|---|---|
| Comprehension (LLM) | ~$0.0008 |
| Strategy (deterministic) | $0 |
| Production (Sonnet 18 bullets × ~400 tokens each) | ~$0.0024 |
| Critique (3 × Haiku) | ~$0.0009 |
| Decision (deterministic) | $0 |
| Frontier escalation (≤ 2.5% × Opus) | ~$0.0002 amortized |
| **Total target** | **≤ $0.005** |

OpenAI parity: same target via gpt-4o (smart) and gpt-4o-mini (fast).

### 7.3 Reliability

- 99.5% monthly availability of `POST /generate`.
- 99.9% durability of in-flight generations across server restarts (Temporal-backed; commit #4).
- Zero unrecoverable cost runaway (BudgetController hard kill).
- Idempotent retries on every API endpoint (request-id-keyed).

### 7.4 Provider parity invariants

See §8.

### 7.5 Operational

- One-command dev: `pnpm dev` brings up all services from a clean checkout. Documented in §16 of `technical-2.0.md`.
- One-command deploy: `pnpm deploy` ships to Railway/Render with secrets rotated.
- Zero-config local: pglite + in-process Temporal-mock + ML stub; no Postgres/Redis/Temporal install needed for `pnpm test`.

## 8. Provider parity (Anthropic + OpenAI)

### 8.1 Why both

- **Anthropic** (Sonnet, Haiku, Opus) excels at long-context structured output and tool use. Default for new users.
- **OpenAI** (gpt-4o, gpt-4o-mini, gpt-5, o-series) excels at deterministic structured output via `response_format: { type: "json_schema" }` and is materially cheaper at the Haiku-tier.
- **Cost arbitrage**: real-time switching when one provider has an outage or pricing event.
- **Compliance**: enterprise customers in EU may require OpenAI's data-residency commitments; others may require Anthropic's.

### 8.2 Switch mechanism

```
AI_PROVIDER=anthropic   # default
AI_PROVIDER=openai      # alternative
```

Lives in `.env`. Read once at module-load by `getProvider()` in `packages/agent/src/lib/provider.ts`. The module-load read is the only place the switch happens; all specialists call `getProvider().createMessageWithTool(...)` indirectly through the `lib/anthropic.ts` shim (legacy name; functions provider-agnostic).

### 8.3 Required parity invariants

- **Same `MessageParams` interface**: all specialists call the same provider-agnostic API.
- **Same `AIResponse` shape**: usage tokens normalized; cache tokens 0 on OpenAI (no native prompt caching).
- **Same model-tier semantics**:
  - `MODELS.smart`: best quality, ~5× cost of fast. Sonnet (Anthropic) | gpt-4o (OpenAI).
  - `MODELS.fast`: cheap+quick, used for critics + onboarding chat. Haiku (Anthropic) | gpt-4o-mini (OpenAI).
- **Same forced-tool-use semantics**: when `forceTool` is set, both providers MUST return tool input as JSON parseable by the caller.
- **Same lazy initialization**: SDK clients constructed lazily so module load never throws on missing API key (test environment requirement).

### 8.4 Specialist-level requirements

Every LLM-driven specialist MUST:
- Import models via `getModels()` at runtime, NOT via the `MODELS` const at module load.
  - Rationale: `MODELS` resolves to Anthropic models even when `AI_PROVIDER=openai`. Calling `gpt-4o` with model name `claude-sonnet-4-6` 404s at OpenAI.
- Call `getProvider().createMessageWithTool(...)` (provider-agnostic) instead of `createMessageWithTool` from the `lib/anthropic.ts` shim (which is now legacy; will be deprecated in v2.1).
- Have a parity test in `tests/provider-parity/<specialist>.test.ts` that runs the specialist with both providers (mocked to return same response) and asserts identical blackboard writes.

### 8.5 Provider-specific behaviors (allowed asymmetries)

- **Prompt caching**: only Anthropic. The `cacheHint` field on `SystemBlock` is honored by Anthropic, ignored by OpenAI. Specialists rely on caching only for cost optimization, not correctness.
- **Web search tool**: only Anthropic (`web_search_20250305`). Specialists that need web search have an OpenAI fallback path that returns `null` and the caller proceeds with `emptyIntel`.
- **Native JSON schema**: OpenAI's `response_format` accepts strict JSON Schema; Anthropic uses tool input schemas. The provider abstraction normalizes both via `forceTool` semantic.
- **Opus equivalent**: Anthropic has `claude-opus-4-1`. OpenAI's "frontier" tier is `gpt-5` or `o4-mini`. The frontier-escalation path (`CriticEnsemble`) reads `getModels().frontier` (new tier in v2.0).

## 9. Failure-mode catalogue

Every failure mode below MUST have:
- A detection mechanism.
- A user-visible response.
- A logged audit entry.
- A unit test.

| Failure | Detection | User response | Audit entry | Test |
|---|---|---|---|---|
| LLM provider 5xx | retry × 3 with exponential backoff | "We're retrying — usually clears in seconds." | `provider_retry` | `tests/provider-retry.test.ts` |
| LLM provider rate limit | exponential backoff, fall back to cached prior result | "Slowing down due to provider limits." | `provider_rate_limited` | covered above |
| LLM provider 4xx (auth) | hard fail | "Service config error — engineering notified." | `provider_auth_failed` | `tests/provider-auth.test.ts` |
| ML server down | `MLClient` retry × 3 | "Some advanced features unavailable; using fallback heuristics." | `ml_unreachable` | `tests/ml-server-down.test.ts` |
| Postgres unreachable | hard fail at request entry | 503 Service Unavailable | `db_unreachable` | covered |
| Temporal unreachable | fall back to in-process orchestrator | trace warning | `temporal_fallback` | `tests/temporal-fallback.test.ts` |
| Cost runaway | `BudgetController.assert_alive()` aborts | refuse with `cost_runaway_blocker` | `budget_exhausted` | `tests/budget-controller.test.ts` |
| Voice drift majority | `RefuseOrShipGate` | refuse with `voice_drift_majority` | `voice_drift` | `tests/refuse-or-ship-gate.test.ts` |
| Fabrication conflict unresolved | gate detects `conflicts` w/ monitor=`fabrication` | refuse with `unresolved_fabrication` | `fabrication` | covered |
| Hidden disqualifier match | `RefuseOrShipGate` | refuse with `hidden_disqualifier_blocker` + recommended next step | `hidden_disqualifier` | `tests/refuse-or-ship-gate.test.ts` |
| ATS coverage < 60% | gate | refuse | `ats_coverage_below_floor` | covered |
| Outcome estimate < 0.20 | gate | refuse | `outcome_below_floor` | covered |
| User cancels mid-generation | `external_signal` aborts orchestrator | trace `external_abort` | `external_abort` | `tests/cancellation.test.ts` |
| Server restart mid-generation | Temporal workflow resumes | trace continues from last persisted snapshot | `resumed_from_persistence` | `tests/orchestrator-resume.test.ts` |
| Specialist throws | trace error, mark goal `abandoned`, continue cycle | partial result OK | `specialist_threw` | `tests/orchestrator-e2e.test.ts` |
| Listener throws | bus catches, logs, continues | invisible to user | `listener_threw` | `tests/trigger-bus.test.ts` |
| 0 specialists registered for goal kind | orchestrator terminates `no_competent_specialist` | trace warning + 200 with empty result | `no_competent_specialist` | `tests/orchestrator-e2e.test.ts` |
| Two specialists for same goal kind | scheduler picks one — but v2.0 forbids this; static check fails build | n/a | n/a | `tests/specialist-registration-parity.test.ts` |

## 10. Quality gates and launch criteria

### 10.1 Per-PR gates (CI must pass)

1. `pnpm -r exec tsc --noEmit` — all packages typecheck.
2. `pnpm test` — agent + api + proto + eval + db all green.
3. `pnpm --filter @retune/web test --run` — web vitest 0 failures.
4. `pnpm --filter @retune/web build` — Next.js bundle succeeds.
5. `cd apps/ml && pytest` — Python tests green.
6. `pnpm --filter @retune/agent exec tsx --test tests/cross-lang-e2e.test.ts` — HTTP + gRPC E2E green.
7. `pnpm exec biome check` — lint + format clean.
8. `pnpm --filter @retune/agent exec tsx --test tests/provider-parity/` — both providers behave identically on canonical fixtures.
9. `pnpm --filter @retune/agent exec tsx --test tests/full-pipeline-e2e.test.ts` — end-to-end mocked-LLM run from POST /generate to ship verdict.
10. **NEW (v2.0)**: specialist-registration-parity invariant — every specialist registered in `apps/api/src/runtime/workbench-runtime.ts` MUST also be registered in `packages/agent/src/temporal/activities/substrate.ts` and vice versa.

### 10.2 Pre-merge to main

- All PR gates above.
- Eval baseline: `pnpm --filter @retune/eval eval --baseline-only` validates the canonical set schema.
- Docs review: any new specialist or goal kind has an entry in `technical-2.0.md` §6.

### 10.3 Pre-release to production

- Full eval with `--live` AND `--mock` modes both pass launch criteria gate.
- Heavy CI (real DeBERTa + GLiNER + BGE) passes nightly for 7 consecutive days.
- ≥ 3 internal employees have shipped real applications through the system without a refuse on a JD they qualify for.

### 10.4 Launch criteria gate (PRD 1.0 §1.6 carried forward, v2.0 codified)

| Criterion | Target | Measurement |
|---|---|---|
| Callback-proxy rate | ≥ 35% of canonical cases score ≥ 70 on coach panel | `aggregate_eval_results.cases_with_callback_signal / total_cases` |
| Provenance rate | ≥ 92% of bullets pass automated provenance verification | `mean_provenance_rate` |
| Coach-panel score | trimmed-mean ≥ 70 | `mean_coach_panel_score` |
| Zero fabrication | 0 shipped packages with unresolved fabrication conflicts | `cases_with_fabrication == 0` |
| ATS coverage | mean ≥ 75% | `mean_ats_coverage_pct` |
| Interview-ready score | mean ≥ 65/100 | `mean_interview_ready_score` |
| Refuse rate | ≤ 15% | `refuses / total_cases` |
| Submission confidence | mean ≥ 0.50 on shipped | `mean_submission_confidence` |
| **NEW v2.0**: provider-A vs provider-B verdict agreement | ≥ 95% verdict agreement across canonical set | `count(verdict_a == verdict_b) / total_cases` |
| **NEW v2.0**: round-trip cost | ≤ $0.005 per ship (steady state, real LLM) | `mean_total_cost_usd` on real-LLM eval |

All criteria must pass for a release to ship. v2.0 introduces provider parity and round-trip cost as gating criteria.

## 11. GDPR Article 22 / fairness / safety

### 11.1 Article 22 — automated decision-making

Every shipped or refused generation MUST produce a `gdpr_audit_packet` containing:

```ts
interface GdprAuditPacket {
  generation_id: string;
  user_id: string;
  created_at: string;
  verdict: 'ship' | 'revise' | 'refuse';
  verdict_reasons: string[];
  pipeline_stages: GdprAuditEntry[];          // every specialist that ran
  plain_language_summary: string;             // human-readable
  right_to_contest: {
    contest_url: string;                       // /generations/:id/contest
    contest_email: string;                     // gdpr@retune.local
    response_deadline_iso: string;             // 30 days from packet date
  };
  data_retention: {
    blackboard_snapshot_retained_days: 90;
    audit_trail_retained_days: 180;
    documents_retained_days: 365;
  };
  legal_basis: 'consent';                      // user opted in at signup
  data_processors: ['anthropic' | 'openai', 'huggingface' | 'self-hosted'];
}
```

The packet MUST persist to `gdpr_packets` table (v2.0 schema, see `technical-2.0.md` §10).

### 11.2 Fairness monitor

`FairnessMonitor` (commit #8) detects:
- Gendered ("rockstar", "ninja", "guru", "aggressive", "dominant").
- Age-coded ("young", "energetic", "digital native").
- Accent-coded ("native English speaker").
- Ableist ("able-bodied").

Detected concerns:
- v1.0: in-memory ring buffer, lost on workflow completion. ❌
- v2.0: persisted as `ConflictRecord{monitor: "fairness_concern"}` in the `conflicts` table via the conflict-staging queue (`packages/agent/src/workbench/conflict-staging.ts`, already exists, must be wired). ✅

A `high` severity fairness concern (e.g. accent-coded language) MUST surface to the user as a `revise` verdict, not be silently rewritten.

### 11.3 Safety

- No PII (other than user-provided profile) sent to LLM providers.
- Profile fields explicitly marked PII (DOB, SSN, government IDs) are redacted before any provider call.
- Anthropic + OpenAI both have data-processing agreements; user must accept at signup.
- Right to erasure: `DELETE /users/:id` cascades to all rows in all tables (FK ON DELETE CASCADE; see `technical-2.0.md` §10).
- Right to access: `GET /users/:id/export` returns JSON of every row touched by the user.

### 11.4 Well-being

`WellBeingMonitor` (commit #14) detects candidate distress signals — high retry rates, self-image divergence, pending-revision accumulation. When detected, the response includes a "Take a break — your application is saved" prompt and offers a free 15-minute slot with a real human coach (manual list, separate from the AI flow).

## 12. Eval methodology

### 12.1 Canonical set (200 cases)

`packages/eval/src/canonical/cases.jsonl` — 200 lines, one case per line.

**v1.0 status**: 14 cases. ❌
**v2.0 target**: 200 cases distributed across the 5 × 8 × 5 = 200-cell matrix (Appendix A). Some cells may have ≤ 1 case if the persona × market × role combination is rare in the wild (e.g. PM in Remote-Global with security focus). The eval report breaks results down by cell.

### 12.2 Each case structure

```ts
interface CanonicalCase {
  id: string;                       // e.g. "case-042-experienced-mle-de"
  persona: 'new_grad' | 'experienced_ic' | 'senior_ic' | 'manager' | 'career_changer';
  market: 'US' | 'UK' | 'EU_DE' | 'EU_FR' | 'EU_NL' | 'EU_ES' | 'CA' | 'AU' | 'IN' | 'remote_global';
  role_family: 'backend_swe' | 'frontend_swe' | 'mle' | 'data_eng' | 'pm' | 'dev_advocate' | 'sre' | 'security';
  jd_text: string;                  // ≤ 4000 chars, real or realistic
  jd_title: string;
  company: string;
  profile_markdown: string;         // candidate profile in markdown
  expected_outcome: {
    callback_at_human_baseline: boolean;
    expected_verdict: 'ship' | 'revise' | 'refuse';
    expected_disqualifiers: string[];
    notes: string;
  };
  expert_package: {
    summary: string;
    skills: { hard: string[]; soft: string[] };
    experience_bullets: Array<{
      role: string;
      text: string;
      evidence_ids: string[];
    }>;
    cover_letter: string;
    application_strategy: string;
  };
}
```

### 12.3 Eval modes

| Mode | What it scores | How invoked |
|---|---|---|
| `--baseline-only` | Validates canonical set schema | `pnpm --filter @retune/eval eval --baseline-only` |
| `--mock` (NEW v2.0) | Runs the agent with mocked LLM responses (canonical fixtures keyed by prompt hash); proves the cognitive cycle is wired | `pnpm --filter @retune/eval eval --mock` |
| `--live` (NEW v2.0) | Runs the agent against real Anthropic OR OpenAI (via `AI_PROVIDER`) on the full 200-case set | `AI_PROVIDER=anthropic pnpm --filter @retune/eval eval --live` |
| `--canonical-vs-expert` | Scores canonical expert packages (legacy v1.0 mode; tautological but useful for set validation) | `pnpm --filter @retune/eval eval --canonical-vs-expert` |

Default (no flag): `--mock`.

### 12.4 Coach panel

Five virtual coaches, each scoring on a different rubric (PRD 1.0 §17.1):

1. **Recruiter screener** — 6-second scan; keyword density, formatting.
2. **Hiring manager** — depth, evidence quality, narrative coherence.
3. **Career coach** — voice authenticity, arc alignment, well-being signals.
4. **Industry calibrator** — market-specific norms (US directness, UK understatement, etc.).
5. **Honesty auditor** — claims grounded, no fabrication.

Each scores 0–100. Trimmed mean (drop top + bottom) is the case score.

### 12.5 Per-case run

For each case in the canonical set:
1. Build a fresh `Blackboard`.
2. Seed `analyze_jd` + `analyze_company` + `extract_voice_fingerprint` + `calibrate_honesty` goals.
3. Run orchestrator until termination.
4. Score the output package via the coach panel.
5. Compare verdict to `expected_outcome.expected_verdict`.
6. Compare bullet provenance: every numeric claim must point to a span_id in the candidate's profile.
7. Aggregate.

### 12.6 Determinism for eval

- Fixed seed for any RNG (`MathRandom` shimmed in eval mode).
- `temperature: 0` for all LLM calls.
- Provider response cache: in `--mock` mode, all responses keyed by SHA-256 of the prompt.
- Voice fingerprint: deterministic by construction.
- Solver: deterministic variable ordering.

## 13. Issue catalogue from v1.0 audit

This is the explicit punch-list. Every item has a severity, a fix owner, and an acceptance criterion. Implementation details live in `technical-2.0.md`.

### 13.1 Wiring issues (severity: BLOCKER)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 1 | API runtime missing 9 of 14 specialists | `apps/api/src/runtime/workbench-runtime.ts:122-167` | Register `GapMapper, EvidenceSolver, NarrativeArcProposer, SequentialBulletComposer, CriticEnsemble, OutcomePredictor, RefuseOrShipGate, TheoryOfMindSpecialist`; subscribe `VoiceDriftMonitor, WellBeingMonitor` to bus. | All 14 specialists run when goals seeded. |
| 2 | Goals never seeded (map_gaps … decide_refuse_or_ship) | nowhere | Specialists themselves emit the next goal (chain pattern). E.g. `JdSpanExtractor` → emit `map_gaps`; `GapMapper` → emit `solve_evidence`; `EvidenceSolver` → emit `propose_arcs`; `NarrativeArcProposer` → emit `select_arc`; etc. Final link: `RefuseOrShipGate` is the terminal; emits no further goals. | A new `tests/full-pipeline-e2e.test.ts` proves the chain runs end-to-end with mocked LLM. |
| 3 | Two specialists handle `select_arc` | `critic-ensemble.ts:53` + `theory-of-mind.ts:39` | Split: `TheoryOfMindSpecialist.handles_goal_kinds = ["model_recruiter_beliefs"]`. Add `model_recruiter_beliefs` to GoalKindSchema. `CriticEnsemble` keeps `select_arc`. Pipeline emits `model_recruiter_beliefs` BEFORE `select_arc`. | `tests/specialist-registration-parity.test.ts`: no two specialists handle the same goal kind. |
| 4 | Listeners not registered in API runtime | `workbench-runtime.ts` | Add `bus.subscribe(new VoiceDriftMonitor(...))`, `bus.subscribe(new WellBeingMonitor(...))` after `bus.subscribe(new FairnessMonitor(...))`. | All 3 listeners fire on relevant blackboard writes; covered by `tests/listener-fanout.test.ts`. |

### 13.2 Correctness bugs (severity: CRITICAL)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 5 | Voice fingerprint dim mismatch | `comprehension/voice/extractor.ts` (alphabetical M-W) vs `specialists/voice-drift-monitor.ts` (frequency-ordered) | Move `FUNCTION_WORDS_64`, cohesion-marker sets, and `compute_fingerprint()` into `comprehension/voice/fingerprint.ts` (single source of truth). Both extractor and monitor import. | New test `tests/voice-fingerprint-canonical.test.ts`: extractor on text X = monitor on text X (byte-identical 128-dim). |
| 6 | `eval/voice-drift.ts` docstring claims 64-dim | `packages/eval/src/metrics/voice-drift.ts:9` | Update docstring to "128-dim per `comprehension/voice/fingerprint.ts`". | Doc update; no behavior change. |
| 7 | Listener concerns not persisted | `FairnessMonitor`, `VoiceDriftMonitor`, `WellBeingMonitor` | Wire each to `ConflictStagingQueue` (already exists in `workbench/conflict-staging.ts`). Orchestrator drains the queue at end of each tick and includes in `audit_entry.conflicts`. | `tests/listener-conflict-persistence.test.ts`: after tick, fairness conflict appears in `conflicts` table. |
| 8 | Top-level `new Anthropic({apiKey})` | `lib/providers/anthropic/index.ts:25` | Lazy init via `function getSdkClient()` (mirror OpenAI pattern). | Module load no longer throws in jsdom. Web vitest tests no longer 130-fail. |
| 9 | Specialists hardcode `MODELS.smart`/`MODELS.fast` (Anthropic-only) | `bullet-composer.ts:317`, `critic-ensemble.ts:357`, `narrative-arc-proposer.ts:301`, `theory-of-mind.ts:189` | Replace `MODELS.smart` with `getModels().smart`. Add `getModels().frontier` tier. Each call site reads at runtime. | `AI_PROVIDER=openai pnpm test` passes; OpenAI receives `gpt-4o`, not `claude-sonnet-4-6`. |

### 13.3 Build issues (severity: BLOCKER)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 10 | Web Next.js bundle pulls `@temporalio/worker` → `@swc/wasm` | `apps/web/src/app/api/onboarding/upload/route.ts:109` does `await import("@retune/agent")` (full barrel) | Replace with `await import("@retune/agent/web")` (the safe export). | `pnpm --filter @retune/web build` exits 0. |
| 11 | Vitest mocks reference `@retune/agent` instead of `@retune/agent/web` | `apps/web/src/app/api/**/__tests__/*.test.ts` (8 files) | Update all `vi.mock("@retune/agent", …)` → `vi.mock("@retune/agent/web", …)`. | Web vitest 0 failures. |

### 13.4 Stale tests (severity: MINOR)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 12 | `mapper-evidence-map.test.ts` expects `{}` for `roleToRequirementsMap` | `packages/agent/tests/mapper-evidence-map.test.ts:28-39` | Update assertions: `assert.deepEqual(parsed.data.roleToRequirementsMap, [])`. Schema was changed for OpenAI structured output. | 2 currently-failing tests pass. |
| 13 | `api-smoke.test.ts` expects `audit_entries.length === 2` | `apps/api/tests/api-smoke.test.ts:178` | Update to `>= 2` OR seed deterministic profile so calibrate_honesty yields exactly 2 (preferred: `>= 2`). | 1 currently-failing test passes. |

### 13.5 Eval gaps (severity: MAJOR for v2.0 launch)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 14 | Canonical set has 14 cases, target 200 | `cases.jsonl` | Author 186 additional cases per Appendix A matrix. | `pnpm --filter @retune/eval eval --baseline-only` reports 200 cases. |
| 15 | Eval runner doesn't run the agent (`--live` not implemented) | `packages/eval/src/runner.ts` | Implement `--live` and `--mock` modes. `--live` invokes the agent end-to-end; `--mock` uses prompt-hash-keyed fixture cache. | `pnpm --filter @retune/eval eval --live` runs full agent on 200 cases. `--mock` runs in < 30s for the same set. |
| 16 | EvidenceSolver claims "MaxSAT" but is pure-TS B&B | `evidence-solver.ts:21-26` | Update docstring to "branch-and-bound with constraint propagation". Future v2.1 may swap to OR-Tools WASM if scale demands. | Doc update; no behavior change. |
| 17 | No coverage for `well_being` listener | none | Wire monitor; add `tests/well-being-monitor.test.ts` with synthetic high-retry scenario. | New test green. |

### 13.6 Operational gaps (severity: MAJOR)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 18 | No one-command dev | `package.json` root | Add `"dev": "concurrently 'pnpm --filter @retune/api dev' 'pnpm --filter @retune/web dev' 'pnpm --filter @retune/worker dev' 'cd apps/ml && uvicorn ...'"`. | `pnpm dev` brings up full stack. |
| 19 | Worker isn't documented as required for full pipeline | `apps/worker/README.md` is 1.5kb and doesn't say the worker is needed for commits #9–#14 to run via Temporal | Update README. | Docs reviewed. |
| 20 | `.env.example` doesn't list `AI_PROVIDER`, `RETUNE_TEMPORAL`, `RETUNE_PERSIST` | `.env.example` | Add all required env vars with comments. | `.env.example` is a complete template. |

### 13.7 Dead code (severity: MINOR)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 21 | `openai-agents/` directory is a parallel orchestrator that's not part of the cognitive cycle | `packages/agent/src/openai-agents/` | Audit: keep if used by `apps/web` for the legacy pipeline, otherwise delete. If kept, document its scope (it's the legacy pipeline path). | `grep -r "openai-agents" packages/ apps/` shows clear usage or zero usage; document in `technical-2.0.md` §17. |
| 22 | `apps/web` still uses legacy SQLite product code (PRD 1.0 carried this forward) | `apps/web/src/app/...` (legacy routes) | Out of scope for v2.0 — but note it as "frontend will be replaced in v2.1 with a Vite + shadcn/ui SPA". | Documented; not blocking. |

### 13.8 Documentation (severity: MINOR but cumulative)

| # | Issue | Where | Fix | Acceptance |
|---|---|---|---|---|
| 23 | `prd.md` and `technical.md` are empty (0 bytes) | repo root | Create `prd-2.0.md` (this file) + `technical-2.0.md` as authoritative replacements. | Both files present, > 1500 lines each. |
| 24 | No runbook for production incidents | none | Add `RUNBOOK.md` with: how to roll back, how to drain Temporal queue, how to switch `AI_PROVIDER`, how to bypass refuse-or-ship gate (emergency only). | RUNBOOK reviewed by ops. |

## 14. Out of scope for v2.0

- **Localization** beyond English (English is the only language for v2.0; Mandarin/Spanish/French in v2.2+).
- **Cover letter rewriting interactivity** — v2.0 generates one cover letter; rewrite mode lands in v2.1.
- **LinkedIn About snippet polish** — generated but not rewritable in v2.0.
- **Recruiter outreach** — generated but not iterable in v2.0.
- **Multi-modal** — v2.0 reads JD text only. PDF/image JD parsing in v2.1.
- **Mobile app** — web-only.
- **ATS submission integration** — user copies the rendered docs to wherever they apply. v2.2.
- **Salary negotiation** — never (separate product).
- **Interview coaching** — never (separate product).
- **Web frontend redesign** — apps/web is the legacy SQLite-product UI carried forward. A v2.1 milestone replaces it with a Vite/shadcn/ui SPA. v2.0 only fixes its build.

## 15. Glossary

- **Blackboard** — the typed, transactional, deep-frozen working-memory graph that holds the entire state of one cognitive cycle. Specialists do not mutate; the orchestrator commits patches atomically.
- **Brain region tag** — every specialist is annotated with the human brain region that inspired its role (e.g. DLPFC for working memory, ACC for conflict detection, TPJ for theory of mind). Tags appear in `@brain` JSDoc comments and in audit trails.
- **Conflict** — a typed record emitted by a monitor when a constraint is violated. Persisted to `conflicts` table.
- **Discourse map** — per-sentence labels assigned to a JD by `DiscourseClassifier` (filter, actual_test, aspiration, culture, legal, boilerplate).
- **Evidence span** — a contiguous text region in a profile or JD with type (skill, metric, role, etc.) and provenance.
- **Gap map** — typed dispositions for every JD requirement (direct hit, transferable, must address in cover letter, etc.).
- **Goal** — a typed unit of work in the cognitive cycle. Has kind, priority, payload. Goals are picked by the AttentionScheduler and dispatched to specialists.
- **Listener (event)** — a specialist that runs *outside* the orchestrator's tick loop, on every matching blackboard write. Three exist: FairnessMonitor, VoiceDriftMonitor, WellBeingMonitor.
- **Specialist** — a unit of cognition with a goal kind it handles, an estimated cost/latency, and a brain region tag. Picked per-tick by the scheduler.
- **Tick** — one orchestrator iteration: pick goal → run specialist → commit writes + conflicts + new goals → record audit entry.
- **Voice fingerprint** — deterministic 128-dim stylometric vector of a candidate's writing.

## 16. UX and frontend specification

The cognitive system is only as good as the surface that exposes it. v2.0 establishes the UX contract that mirrors the cognitive cycle one-to-one: every specialist, every conflict, every belief state, and every verdict has a user-visible representation. Nothing the brain decides is hidden from the user.

### 16.1 Frontend architecture

**v2.0 scope (this release)**: extend `apps/web` (Next.js, legacy onboarding pipeline) with the new cognitive-cycle screens. The legacy pipeline keeps running for backwards compatibility; new screens read from the cognitive-cycle tables (`generations`, `audit_entries`, `gdpr_packets`, `conflicts`, `outcomes`).

**v2.1 scope (next release)**: rebuild the entire frontend as a Vite + React 19 + shadcn/ui + Tailwind v4 SPA at `apps/spa`. The legacy `apps/web` is retired.

### 16.2 Design language

- **Tone**: calm, professional, audit-friendly. Never patronising. Never anthropomorphised ("I'm thinking" → "comprehension stage running").
- **Color palette**: warm neutrals (slate / stone), accent indigo for primary actions, coral for warnings, mint for success. Refuse verdicts use a measured amber, never red — refusal is informative, not punitive.
- **Typography**: Inter for UI, JetBrains Mono for evidence spans and audit entries.
- **Spacing**: 4px base grid, Tailwind defaults.
- **Motion**: 200ms ease-out default. Brain-region pulses 600ms. Reduced-motion respected for every animation (prefers-reduced-motion → discrete state changes).
- **Iconography**: Lucide (consistent with PRD 1.0 §1).
- **Shadows / depth**: minimal; rely on borders and spacing for hierarchy.

### 16.3 The 12 core screens

Full inventory in Appendix C. Each screen carries a **brain-region tag** that names the cognitive function it externalises. The tag appears in `data-brain-region="…"` on the root element and is surfaced to power users via `?debug=1`.

| # | Screen | Path | Brain-region tag | Primary acceptance |
|---|---|---|---|---|
| 1 | Sign in / sign up | `/auth/*` | hippocampal indexing | LCP < 1.5s; OAuth via Google works |
| 2 | Onboarding wizard (4 steps) | `/onboarding` | episodic encoding + voice imprint | Profile completeness ≥ 75% before exit; voice fingerprint computed |
| 3 | Dashboard | `/dashboard` | retrospective memory recall | Lists last 30 generations + outcomes + cost |
| 4 | New generation form | `/generate/new` | task initialisation (DLPFC) | < 3 fields required (jd_text, jd_title or url, optional company) |
| 5 | Live generation visualizer | `/generate/:id` | full cortex (heatmap-driven) | First trace event ≤ 2s; complete event ≤ 60s P95 |
| 6 | Generation result viewer | `/generate/:id/result` | recognition + provenance lookup | Every claim hover-shows its evidence span; no claim without provenance |
| 7 | Refine selection modal | (overlay on result) | sensorimotor refinement (cerebellum) | Refine round-trip < 8s P95 |
| 8 | Refuse-and-explain page | `/generate/:id/refused` | meta-cognitive disclosure (anterior PFC) | Verdict reason + plain-language explanation + contest button |
| 9 | GDPR audit packet viewer | `/generate/:id/audit` | autobiographical recall | Replay-button reconstructs cycle from snapshot |
| 10 | Outcome logging | `/generate/:id/outcome` | reward signal | Logging is one-click + idempotent |
| 11 | Voice fingerprint settings | `/settings/voice` | self-perception (mPFC) | View 8-axis radar; reset button with confirmation |
| 12 | Honesty calibration history | `/settings/honesty` | trust valuation (orbitofrontal) | Per-claim-type calibration shown over time |

A bonus 13th screen — `/brain` — is the **cognitive transparency mode**: a live dashboard of every brain region in the system, what it's doing, and how it has trended over the user's last 30 generations. Hidden by default, revealed via the "How I thought about this" toggle on any generation result.

### 16.4 Live generation visualizer (the centerpiece)

This is the screen that makes the cognitive cycle visible. It is the single most important new UX deliverable in v2.0.

**Layout (desktop, 1440 wide)**:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Generating: Senior MLE, Anthropic                          [cancel]      │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐   │
│  │                         │  │  Trace timeline                       │   │
│  │   Brain heatmap         │  │  ─────────────────────────────────   │   │
│  │                         │  │  TitleSchemaRetriever  ●              │   │
│  │   (SVG cortical map     │  │  CompanySchemaRetriever  ●            │   │
│  │   with 22 named regions │  │  JdSpanExtractor          ●●          │   │
│  │   pulsing as            │  │  DiscourseClassifier         ●        │   │
│  │   specialists fire)     │  │  GapMapper                     ●      │   │
│  │                         │  │  EvidenceSolver                  ●    │   │
│  │                         │  │  NarrativeArcProposer              ●  │   │
│  │                         │  │  TheoryOfMindSpecialist             ● │   │
│  └─────────────────────────┘  └──────────────────────────────────────┘   │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐        │
│  │  Goal DAG         │  │  Cost meter       │  │  Predicted ↗      │        │
│  │  (live graph)     │  │  $0.0024 / $0.005 │  │  47%  [38–55%]    │        │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘        │
│                                                                            │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  Live narrative (plain-language stream)                            │  │
│  │  ────────────────────────────────────────────────                  │  │
│  │  • Reading the JD…                                                 │  │
│  │  • Found 14 requirements; classified discourse                     │  │
│  │  • Mapped your evidence; 11 direct hits, 2 transferable, 1 gap     │  │
│  │  • Generating 3 narrative arcs to choose from…                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Brain heatmap component (`<BrainHeatmap />`)**:
- SVG of an idealised cortex (lateral + medial views, dual hemispheres).
- 22 named regions, each a `<path>` with `data-region="angular_gyrus"` etc.
- Idle state: 0.15 opacity grey.
- Active state (specialist running): pulse animation (0.4 → 1.0 → 0.4 over 600ms) in the region's tier color.
- Recently-active state (within last 3 ticks): 0.6 opacity.
- Hover: tooltip names the region + the specialist that ran + the cost charged.
- Click: filters the trace timeline to only that region.
- Tier colors: cool blue for free deterministic, warm orange for fast-tier LLM, red for smart-tier LLM, magenta for frontier escalation.
- Mobile: stacks vertically as a list; the heatmap collapses to an icon grid.

**Trace timeline component (`<TraceTimeline />`)**:
- Horizontal axis: ticks (or wall-clock).
- One row per specialist, ordered by first activation.
- Markers: dots colored by tier; size proportional to cost.
- Hover marker: pop-over with the specialist's audit-entry justification text.
- Click marker: opens the blackboard-write detail in a side sheet.
- Auto-scrolls horizontally as new ticks arrive.
- Reduced-motion: no scroll; new markers append at right with a muted fade.

**Goal DAG component (`<GoalDag />`)**:
- Force-directed layout via `d3-force` (or `react-flow`).
- Nodes: goals. Each shows kind + priority. Color by status: gray pending, blue running, green satisfied, amber abandoned, red blocked.
- Edges: parent → child emits.
- Hover: shows full payload.
- The user can pause the layout to inspect.

**Cost meter (`<CostMeter />`)**:
- Horizontal segmented bar: spent (green) / budget headroom (mint) / soft ceiling marker / hard kill marker.
- Live update on every `cost_charge` SSE event.
- Tooltip: current cost + per-specialist breakdown.
- Color shifts to amber at 80% of soft ceiling, red at 100%.

**Confidence dial (`<ConfidenceDial />`)**:
- Circular SVG gauge.
- Inner numeric: point estimate (e.g. "47%").
- Outer arc: 95% conformal interval as a shaded sweep.
- Caption: "Predicted callback probability" + the calibration source ("Wilson interval, cold-start" or "Empirical conformal, n=1247 outcomes").
- Updates only when `OutcomePredictor` fires; static otherwise.

**Live narrative (`<LiveNarrativeStream />`)**:
- Plain-language messages derived server-side from typed SSE events.
- New messages slide in from below; older messages fade to a calmer tone.
- Five-line maximum visible; scroll to expand.
- Each line has a small brain-region icon matching the active specialist.
- The translation from typed event → English prose is owned by `apps/api/src/lib/sse-narrator.ts` (NEW v2.0 module). Templates per event kind. Fully internationalisable.

### 16.5 Generation result viewer

Three tabs:
- **Documents**: rendered resume, cover letter, LinkedIn About, recruiter outreach. Provenance overlay toggle.
- **How I thought about this**: chronological narrative of the cognitive cycle in plain English (see §17).
- **Audit**: GDPR packet (collapsible JSON tree with English captions).

**Provenance overlay**:
- Every numeric or named claim is wrapped in a span with `data-evidence-ids="sp_001,sp_004"`.
- Hover: pop-over showing the evidence spans (the original profile sentences with span boundaries highlighted).
- The `eval/src/metrics/provenance-rate.ts` metric is computed live and shown as a badge: "100% provenance".
- Bullets that failed all retries are `pending_revision` and shown with a coral warning underline + a "Why?" link to the relevant audit entry.

### 16.6 Refine selection modal

- User selects text in any document.
- Modal opens with: original bullet, three rewrite directions (rewrite, expand, soften, align to alternative arc), free-form directive textarea.
- Submit → `POST /refine/selection` → live trace (smaller version of the visualizer) → result.
- New bullet replaces selection on accept.
- Voice-drift cosine displayed inline; if < 0.85 threshold, the system stages the rewrite for explicit user approval rather than auto-replacing.
- High-severity fairness concern → modal escalates to a dialog: "This rewrite raised a fairness concern (gendered language). Apply anyway? Edit? Cancel?"

### 16.7 Refuse-and-explain page

When the gate refuses:
- Header: amber shield icon + "We can't ship this credibly." (Never "Sorry, we failed." Never "Try again.")
- Verdict reason cards (one per failed criterion, ranked by severity).
- Each card: the criterion in plain English + the evidence + a recommended next step.
- Right-to-contest banner: link to `/generate/:id/contest` form (in-product) + email `gdpr@retune.local`.
- "Replay this generation" button: re-runs from a frozen snapshot for transparency.
- "What I'd need from you to ship" panel: enumerates the gaps the user could close (missing evidence, missing credentials, missing narrative arc preference).

The refuse page is **not** a dead-end. It is a coaching surface.

### 16.8 GDPR audit packet viewer

- Tree view of the full packet.
- Top-level keys: verdict, plain_language_summary, pipeline_stages, right_to_contest, data_retention.
- Each `pipeline_stages` entry expands to: specialist id, brain region, model used (provider + model name), cost, latency, justification, blackboard writes, conflicts emitted.
- "Replay" button at top: re-runs the cycle from the snapshot, enabling A/B comparison if the user has refined since.
- Export: `Download as JSON` and `Download as PDF (legal-format)` buttons.
- The PDF format is a deterministic A4 layout suitable for submission to an EU regulator. Generated by `apps/api/src/lib/gdpr-pdf-renderer.ts` (NEW v2.0).

### 16.9 Outcome logging

- Triggered by user from the result viewer or from the dashboard.
- Form: outcome ∈ {no_response, callback, screen, onsite, offer, rejection_with_reason, rejection_without_reason}, free-form notes, recruiter feedback paste box.
- Submit → optimistically updates dashboard → enqueues a background job that runs `MemoryConsolidator` (NEW v2.0; see `technical-2.0.md` §24.3) to update calibrators.
- The user is told, in plain language: "Your feedback updates how we'll think about your next application."
- Idempotent: replay-safe; same outcome submitted twice is a no-op.

### 16.10 Settings

- **Voice fingerprint** (`/settings/voice`): 8-axis radar chart projection of the 128-dim vector. Reset button with confirmation. "What I think your voice sounds like" caption.
- **Honesty calibrations** (`/settings/honesty`): per-claim-type table. Each row: claim type (e.g. `metric:headcount`), trust factor, sample size, last updated. Reset-per-row button. Export to CSV.
- **Cultural fingerprint** (`/settings/culture`): 8-axis bar chart of the user's market exposure (US-direct, UK-understated, etc.).
- **Data**: export, delete, view consent history.
- **Provider**: per-user override of `AI_PROVIDER` (deferred to v2.1; v2.0 is system-wide).

### 16.11 Component library

Built on shadcn/ui base:
- `<Button />`, `<Card />`, `<Dialog />`, `<Tabs />`, `<Table />`, `<Toast />`, `<Tooltip />`, `<Sheet />`, `<Command />`, `<Form />`, `<Select />`, `<Combobox />`, `<DataTable />`.

Custom components (NEW v2.0; lives in `packages/ui/src/cognitive/`):
- `<BrainHeatmap regions={live} />`
- `<SpecialistChip id costUsd brainRegion />`
- `<GoalNode goal status />`
- `<TraceLine events />`
- `<ProvenanceOverlay bullet evidenceSpans />`
- `<ConfidenceDial point lower upper />`
- `<CostMeter spentUsd softCeilingUsd hardKillUsd />`
- `<VerdictCard verdict reasons recommendedNextStep />`
- `<GdprPacketViewer packet />`
- `<VoiceFingerprintRadar vector />`
- `<HonestyCalibrationTable rows />`
- `<LiveNarrativeStream events />`
- `<RecruiterBeliefStateCard belief />`
- `<EmotionalStateBadge state />`
- `<EvidenceSpanPopover span />`
- `<ConflictBanner conflict />`

Every custom component MUST:
- Have a Storybook story per state (default, loading, error, empty, populated).
- Pass axe-core accessibility checks in tests.
- Have a Chromatic visual-regression snapshot on every PR.
- Document its `data-brain-region` attribution.

### 16.12 SSE event taxonomy

Full list in Appendix D. The frontend's `useGenerationStream(id)` hook subscribes to `/generate/:id/stream` and dispatches typed events into a small Redux-style store that backs all live components.

## 17. Cognitive transparency for users

The "How I thought about this" tab on every generation result is the consumer-facing manifestation of the brain-cell architecture. It is not a marketing feature. It is the system's accountability surface.

### 17.1 Narrative template

Per cognitive layer, the system synthesises one or two plain-language paragraphs from the audit trail. Templates live in `apps/api/src/lib/cognitive-narrator.ts`.

Example output for a successful ship:

> **Reading the world.** I read your job description and recognised it as a Senior MLE role at Anthropic. I extracted 14 explicit requirements and 6 culture-coded expectations. I noticed three sentences that sounded like legal boilerplate (the "equal opportunity" disclaimer, the "reasonable accommodations" notice, and a benefit summary) — I dropped their importance to zero so they wouldn't crowd out the actual job description.
>
> **Reading you.** I read your profile and noticed your writing voice is metric-led, with a slight tendency toward understatement. I built a 128-dimensional fingerprint of that voice so I'd know if my drafts wandered away from how you actually sound. Based on outcomes from your last 4 applications, I'm calibrating headcount claims to 82% trust, individual-contributor claims to 95% trust, and "led" verbs to 68% trust. (You over-claim leadership; I'll soften those.)
>
> **Choosing what to claim.** Of the 14 requirements, you have direct evidence for 11. You have transferable evidence (from a different stack) for 2. You have one gap: production GPU inference at scale. I decided that gap is best addressed in the cover letter, not by manufacturing a claim. The evidence solver picked 18 spans across your 4 most recent roles to form the resume bullets, optimising for requirement coverage given your bullet budget.
>
> **Choosing how to position you.** I considered three narrative arcs: "depth IC who scales" (your strongest evidence supports this; feasibility 0.78), "breadth IC pivoting toward research" (feasibility 0.45 — your research output is thin), and "founder-engineer" (feasibility 0.22 — your evidence doesn't support it). Anthropic's recruiting culture, based on their previous postings, leans toward depth-first; I picked the depth arc.
>
> **What a recruiter would believe.** Modeled on a 6-second scan: the recruiter would believe you are a senior IC, ML-focused, with strong production fluency and moderate research presence. They would probably ask, in a screen, "tell me about the largest model you've shipped" — which your evidence supports.
>
> **Critiquing the work.** I ran three independent critics: a recruiter (scored 78), a hiring manager (scored 81), and your future-self image (scored 74). They all preferred the depth arc. No divergence. No frontier escalation needed.
>
> **Predicting the outcome.** I predict a 47% callback probability with a 95% interval of 38–55%. That's well above our 35% target. I'm using a Wilson cold-start interval because we've seen fewer than 100 of your past outcomes; this will tighten as you log more.
>
> **Decision.** Ship. No fabrication conflicts. No hidden disqualifiers. No voice drift. Provenance covers 100% of bullets. ATS coverage is 84%. Final cost: $0.0042.

This text is generated, not hand-authored. The narrator reads the audit trail and fills the template. Total wallclock to render: < 200ms.

### 17.2 Refuse narrative

When refused, the narrative is structured around the failed criterion + recommended next step, with the same compassionate plain-language tone as ship narratives. The user is never blamed. The system describes what it would need.

### 17.3 Cognitive layer iconography

Each layer in the narrative has a small icon (Lucide):
- Comprehension: 👁 Eye
- Reflection: 🔍 Search
- Strategy: ♟ Chess piece
- Production: ✏ Pencil
- Critique: ⚖ Scales
- Decision: ✓ / ⊘

Icons are accessibility-decorative; full text equivalents always present.

## 18. Emotional and well-being UX

The `EmotionalStateModeler` (NEW v2.0; see `technical-2.0.md` §24.1) infers the candidate's emotional state from profile + JD + outcome history. The frontend surfaces this with care:

- Never as a label imposed on the user ("You seem anxious").
- Always as a system reflection ("Based on your last 3 generations, the system has been running shorter cycles. If you'd like to slow down and review more carefully, the slow-mode toggle is here.")
- Well-being banner: appears on dashboard if `WellBeingMonitor` has detected sustained distress signals over the last 7 days. Offers free 15-minute slot with a real human coach.
- Slow mode toggle: doubles all retries, shows the full audit narrative inline rather than collapsed, surfaces every conflict for explicit review.
- Never auto-applies emotional inferences to bullet tone without user opt-in.

Decision rule: emotional inferences are ALWAYS surfaced via a passive "the system noticed" voice, never via a direct "you are" voice. Every emotional inference has a dismiss + correct affordance.

## 19. Privacy and consent UX

- **Signup consent**: explicit opt-in, per data processor (Anthropic, OpenAI, HuggingFace ML server, Postgres host). Default: all checked. User can uncheck OpenAI or Anthropic individually; if both unchecked, signup is blocked with the message "At least one LLM provider must be enabled."
- **Cookie banner**: minimal, one row, two buttons (Accept all, Essential only). No third-party trackers; only first-party session cookies are essential.
- **"Your data" tab in settings**:
  - Export: GET `/users/:id/export` returns a 50–500MB JSON of every row keyed to the user. Streamed download.
  - Delete: DELETE `/users/:id` triggers a confirmation modal requiring the typed phrase "DELETE MY ACCOUNT". Cascades to every table.
  - Calibrations: view + reset (resets honesty + voice + cultural fingerprints).
  - Voice fingerprint: view + reset.
  - GDPR packets: list of generations with packet links.
  - Consent history: timestamped log of every consent change.
- **Right to contest**: every generation, even shipped ones, has a "Contest this decision" button. Form opens at `/generate/:id/contest`, accepts free-form text + outcome ("I disagree because…"). Logged to `contest_log` table; a human review SLA of 30 days is enforced by an internal cron.
- **Right to portability**: the export covers every row + every shipped document + every audit packet. JSON + accompanying PDF (legal-format) of each packet.

## 20. Accessibility, performance, mobile

### 20.1 Accessibility (WCAG 2.1 AA, axe-clean)

- All interactive elements keyboard-reachable.
- Visible focus indicators (Tailwind `ring-2 ring-indigo-500`).
- ARIA labels on every brain-region pulse, every specialist chip, every confidence dial.
- Color is never the sole signal — verdict cards have icons; cost meters have text labels.
- Screen-reader live regions for SSE events (the live narrative).
- All animations respect `prefers-reduced-motion`.
- Lighthouse accessibility score = 100 on every screen, enforced in CI.
- axe-core test suite runs against every Storybook story.

### 20.2 Performance

| Metric | Target | Measured at |
|---|---|---|
| LCP | < 2.5s | `/dashboard`, `/generate/:id` |
| INP | < 200ms | every interactive element |
| CLS | < 0.1 | every screen |
| Lighthouse Performance | ≥ 90 | every screen |
| Bundle size (initial JS) | < 220KB gzipped | per route |
| Time to first SSE event | < 2s | `/generate/:id` |

### 20.3 Mobile

- Breakpoints: 360, 768, 1024, 1440.
- Mobile primary CTAs in bottom 1/3 of viewport (one-handed reach).
- Touch targets ≥ 44×44px.
- Cognitive cycle visualizer reflows: brain heatmap → vertical specialist list; trace timeline → vertical ticker; goal DAG → tap-to-expand.
- Slow-network friendly: SSE auto-resume on disconnect.

### 20.4 Internationalization stubs

- `next-intl` scaffolding in `apps/web` and `apps/spa` (v2.1).
- All user-facing strings extractable.
- v2.0 ships English only.
- v2.2 adds ES, FR, DE, JA, HI.
- The narrator templates (§17.1) are i18n-ready; translation packets per locale.

## Appendix A — eval persona × market × role family matrix

Target: 200 cases, distributed across 5 personas × 8 markets × 5 role families = 200 cells.

|       | US  | UK  | DE  | FR  | NL  | CA  | AU  | IN  | Remote |
|---|---|---|---|---|---|---|---|---|---|
| `new_grad / backend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `new_grad / frontend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `new_grad / mle` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `new_grad / data_eng` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `new_grad / pm` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `experienced_ic / backend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `experienced_ic / frontend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `experienced_ic / mle` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `experienced_ic / data_eng` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `experienced_ic / pm` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `senior_ic / backend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `senior_ic / frontend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `senior_ic / mle` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `senior_ic / sre` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `senior_ic / security` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `manager / backend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `manager / mle` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `manager / data_eng` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `manager / pm` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `career_changer / backend_swe` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `career_changer / mle` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `career_changer / pm` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| `career_changer / dev_advocate` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Sparse cells (= 0): new_grad PMs (rare). 22 unique persona × role combinations × 9 markets = 198. Plus 2 stress-test cases (impossible disqualifier + adversarial fairness probe) = 200.

For each cell, a fairness sub-test is generated by gender-swapping the candidate's pronouns and checking that the verdict + score remains within ±2pp. Recorded in `provider-parity` reports.

## Appendix B — refuse/revise/ship decision matrix

Source: `RefuseOrShipGate` (commit #13). Evaluated in this order — first match wins.

```
REFUSE if any of:
  - hidden_disqualifier_match      (cover letter cannot fix it; e.g. clearance)
  - unresolved_fabrication         (any conflict with monitor='fabrication' unresolved)
  - voice_drift_majority           (>50% of bullets fail voice-drift cosine ≥ 0.50)
  - ats_coverage_below_floor       (< 60% required keywords covered)
  - outcome_below_floor            (outcome_estimate.point < 0.20)
  - cost_runaway                   (BudgetController hard kill)

ELSE REVISE if any of:
  - critic_divergence_unresolved   (CriticEnsemble emitted divergence > threshold)
  - outcome_in_revise_band         (0.20 ≤ outcome_estimate.point < 0.35)
  - pending_revisions_non_empty    (any bullet failed all retries)
  - hidden_disqualifier_overlap    (cover letter can address it)
  - high_severity_fairness_concern (any FairnessConcern with severity='high')

ELSE SHIP
```

Each branch produces a structured `ShipDecision` with reasons, recommended next steps, and the required GDPR audit packet.

## Appendix C — full screen inventory

| Screen | Path | Components | States | Acceptance |
|---|---|---|---|---|
| Sign in | `/auth/sign-in` | Form, OAuthButton, AuthError | idle, loading, error | OAuth + email both work |
| Sign up | `/auth/sign-up` | Form, ConsentCheckboxes, OAuthButton | idle, loading, error, consent-blocked | Per-processor consent persists |
| Onboarding step 1 | `/onboarding/intro` | Wizard, Card | idle | < 3 taps to advance |
| Onboarding step 2 | `/onboarding/upload` | DropZone, ProgressBar, ResumeParser | idle, parsing, error, success | Parses PDF + DOCX; voice fingerprint shown |
| Onboarding step 3 | `/onboarding/profile` | Form (multi-step), CompletionMeter | idle, partial, complete | Completeness ≥ 75% to advance |
| Onboarding step 4 | `/onboarding/done` | Card, CTA | success | Lands on `/dashboard` |
| Dashboard | `/dashboard` | DataTable, OutcomeStatBar, CostStatBar | empty, populated, error | Last 30 generations rendered |
| New generation | `/generate/new` | Form, JdPasteBox, CompanyAutocomplete | idle, validating, submitting | < 3 fields required |
| Live visualizer | `/generate/:id` | BrainHeatmap, TraceTimeline, GoalDag, CostMeter, ConfidenceDial, LiveNarrativeStream | streaming, complete, error, cancelled | All 6 components live-update |
| Result viewer | `/generate/:id/result` | DocumentViewer, ProvenanceOverlay, Tabs | success | All claims have provenance |
| Refine modal | (overlay on result) | Modal, RewriteForm, VoiceDriftBadge | idle, generating, voice-drift-warning | < 8s P95 |
| Refused page | `/generate/:id/refused` | VerdictCard, ReasonCardList, RecommendedNextStep, ContestButton | always | Plain-language reasons; contest-button live |
| GDPR viewer | `/generate/:id/audit` | GdprPacketViewer, ReplayButton | success | JSON tree + PDF export |
| Outcome log | `/generate/:id/outcome` | Form | idle, submitting, success | Idempotent; 1-click |
| Voice settings | `/settings/voice` | VoiceFingerprintRadar, ResetButton | populated, empty | Reset persists |
| Honesty settings | `/settings/honesty` | HonestyCalibrationTable, ExportButton | populated, empty | CSV export works |
| Culture settings | `/settings/culture` | CultureBarChart | populated, empty | 8-axis labels visible |
| Data settings | `/settings/data` | ExportButton, DeleteButton, ConsentHistoryTable | populated | Delete requires typed confirmation |
| Brain dashboard | `/brain` | BrainHeatmap (aggregate), SpecialistTrendCharts | populated | Per-region trends over last 30 generations |

## Appendix D — SSE event taxonomy

Event envelope:
```ts
{
  type: '<event-kind>';
  generation_id: string;
  tick: number;
  timestamp_ms: number;
  payload: <kind-specific>;
}
```

Event kinds (NEW v2.0 — additive to v1.0 SSE events):

| Kind | Payload | Frontend handler |
|---|---|---|
| `tick_start` | `{ tick }` | `<TraceTimeline />` advances cursor |
| `specialist_picked` | `{ specialist_id, brain_region, goal_kind, estimated_cost_usd }` | `<BrainHeatmap />` pulses region |
| `blackboard_write` | `{ path, after_summary }` | `<GoalDag />` highlights the producing goal |
| `goal_emitted` | `{ goal_id, kind, priority, parent_goal_id }` | `<GoalDag />` adds node |
| `goal_satisfied` | `{ goal_id }` | node turns green |
| `goal_abandoned` | `{ goal_id, reason }` | node turns amber |
| `conflict_emitted` | `{ conflict_id, monitor, severity, summary }` | `<ConflictBanner />` fades in |
| `listener_concern` | `{ listener_id, severity, summary }` | toast |
| `cost_charge` | `{ cost_usd_delta, total_usd }` | `<CostMeter />` advances |
| `outcome_predicted` | `{ point, lower, upper, calibration_method }` | `<ConfidenceDial />` updates |
| `narrative_paragraph` | `{ layer, text }` | `<LiveNarrativeStream />` appends |
| `emotional_state_changed` | `{ state, confidence, surfaced, threshold_crossed, summary }` | `<EmotionalStateBadge />` + `<BrainHeatmap />` (insula pulse) |
| `tick_end` | `{ tick, latency_ms }` | timeline marker |
| `complete` | `{ verdict, ship_decision_summary }` | navigate to `/result` or `/refused` |
| `error` | `{ kind, message }` | error toast + diagnostic snapshot |
| `external_abort` | `{ reason }` | navigate to `/cancelled` |

Every typed event maps 1:1 to an entry in the audit trail; the SSE stream is a projection of the trail.

## Appendix E — Neural signaling and activation (product-surface map)

Every neural concept in `technical-2.0.md` §26 has at least one user-visible surface. This appendix is the product checklist that ensures nothing the brain does is hidden from the user.

| Neural concept | User-visible surface | Route / component |
|---|---|---|
| Neuron firing | Region pulse on brain heatmap | `/generate/:id` → `<BrainHeatmap />` |
| Spike (action potential) | Trace timeline tick mark | `/generate/:id` → `<TraceTimeline />` |
| Synapse activation | Goal-DAG edge highlight | `/generate/:id` → `<GoalDag />` |
| Refractory skip | Faded pulse + "skipped" tooltip | `<BrainHeatmap />` tooltip |
| Lateral inhibition | "Suppressed" badge on raw input rows | `<DocumentViewer />` provenance overlay |
| Feedforward inhibition | Cost meter amber/red + budget banner | `<CostMeter />`, `<ConflictBanner />` |
| Plasticity (LTP) | Honesty calibration sparkline | `/settings/honesty` → `<HonestyCalibrationTable />` |
| Reward prediction error | Confidence dial trend | `<ConfidenceDial />` + `/brain` aggregate |
| Dopamine modulation | Strategy-layer goal priority highlight | `<GoalDag />` node weight |
| Norepinephrine alarm | Refused page + budget reason card | `/generate/:id/refused` |
| Serotonin baseline | Mood sparkline (anonymised) | `/brain` aggregate panel |
| Acetylcholine attention boost | Active-question badge | `<ActiveQuestionBadge />` (top-right) |
| GABA suppression | Stripped boilerplate "ignored" annotation | `<DocumentViewer />` |
| Glutamate emission | All non-suppressed activations | implicit in heatmap |
| Hippocampal consolidation | GDPR audit packet | `/generate/:id/audit` |
| Cross-cortex transport | Tick latency outlier markers | `<TraceTimeline />` outlier dots |
| Default mode network | Narrative arc paragraph in stream | `<LiveNarrativeStream />` |
| Theory of mind | Three-perspective objection list on result | `/generate/:id/result` → "How recruiters read this" tab |
| Metacognition | Confidence interval + "How I thought about this" tab | `<ConfidenceDial />` + `/generate/:id/result#thinking` |
| Affect / interoception | Emotional badge | `<EmotionalStateBadge />` |

Cross-checked by `tests/neural-surface-coverage.spec.ts`: every row above has both a code locus (component import) and a Playwright assertion that the surface renders under a fixture that triggers the corresponding neural concept.

### E.1 Glia / supporting infrastructure (user-visible)

Glia (`technical-2.0.md` §27.3) are mostly invisible by design — healthy infrastructure should not surface. The exceptions, which the user MUST see when triggered:

| Glia analogue | Surface | Route |
|---|---|---|
| Astrocyte exhaustion (connection pool) | "Service degraded" banner with retry-after | global header |
| Oligodendrocyte stale (cache miss storm) | Latency indicator on `<TraceTimeline />` outliers | `/generate/:id` |
| Microglia block (security) | "Request blocked: <reason>" page | any route |
| Ependymal backlog (audit trail full) | Admin-only banner on `/brain` | `/brain` (admin) |

### E.2 Functional networks (user-visible overlays)

`<BrainHeatmap />` exposes a **Networks** toggle (`?networks=dmn,salience,cen,dan,van`) that highlights the 5 canonical functional networks (DMN, Salience, Central Executive, Dorsal Attention, Ventral Attention) per `technical-2.0.md` §26.11. Toggle is surfaced on `/generate/:id` and `/brain`.

### E.3 Mindset, thoughts, actions — user-visible surfaces

| Axis | Surface | Route |
|---|---|---|
| **Mindset — growth/fixed** | Honesty calibration sparkline (changes over time visible) | `/settings/honesty` |
| **Mindset — self-efficacy** | Confidence dial trend on dashboard | `/dashboard` |
| **Mindset — locus of control** | Passive-voice copy in `<EmotionalStateBadge />`; never "you are…" | `/generate/:id`, `/dashboard` |
| **Mindset — goal orientation** | Outcome log accepts `learning_takeaway` outcomes, not just `interview` | `/generate/:id/outcome` |
| **Mindset — self-image** | Voice-fingerprint reset (revocable 14 days) | `/settings/voice` |
| **Thoughts — verbal** | `<LiveNarrativeStream />` paragraphs | `/generate/:id` |
| **Thoughts — visual** | `<BrainHeatmap />`, `<GoalDag />` | `/generate/:id` |
| **Thoughts — counterfactual** | "How recruiters read this" tab on result | `/generate/:id/result` |
| **Thoughts — prospective** | `<ConfidenceDial />` (callback probability) | `/generate/:id` |
| **Thoughts — retrospective** | Outcome log + calibration history | `/dashboard`, `/settings/honesty` |
| **Thoughts — self-referential** | `<EmotionalStateBadge />`, mood sparkline on `/brain` | `/brain` |
| **Thoughts — other-referential** | Theory-of-mind perspectives in result | `/generate/:id/result` |
| **Actions — reflexive** | Listener fires audit row | `/generate/:id/audit` |
| **Actions — habitual** | Cache-hit indicator on `<TraceTimeline />` (sub-50ms ticks) | `/generate/:id` |
| **Actions — goal-directed** | Goal-DAG with priority weights | `/generate/:id` |
| **Actions — communicative** | Generated documents + narrator stream | `/generate/:id/result` |

UX-17 (`technical-2.0.md` §29) verifies every audit row carries `action_class`; UX-18 verifies the 5 mindset surfaces exist and use compliant copy.

---

## Completion stamp

**Complete: Neural Signaling and Activation.**

The PRD covers the full cognitive surface area, with no blind spots remaining:

- **Mindset (5 axes)** — growth/fixed, self-efficacy, locus of control, goal orientation, self-image. Surfaces in Appendix E.3 + §18 + §19 retention controls. Ref: `technical-2.0.md` §25.5.
- **Emotion** — categorical (5 states) + dimensional (valence × arousal) + OCC appraisal. Surfaces: §18 emotional UX, `<EmotionalStateBadge />`, mood sparkline on `/brain`. Ref: `technical-2.0.md` §24.1–24.5.
- **Thinking (17 components)** — perception, attention, working memory, semantic memory, episodic memory, **procedural memory**, **categorisation**, **problem solving**, **mental simulation**, reasoning, planning, decision, production, critique, metacognition, affect, action selection. Ref: `technical-2.0.md` §25.1.
- **Thoughts (7 modes)** — verbal, visual, conceptual, counterfactual, prospective, retrospective, self-referential, other-referential. Surfaces in Appendix E.3. Ref: `technical-2.0.md` §25.6.
- **Actions (4 classes)** — reflexive, habitual, goal-directed, communicative. Every audit row tagged. Ref: `technical-2.0.md` §25.7.
- **Brain cells** — 8 neuron cell types × 7 neurotransmitters across 27 registry entries + 4 glia types (astrocytes, oligodendrocytes, microglia, ependymal). Ref: `technical-2.0.md` §27.1, §27.3.
- **Neural signaling** — spiking, activation rates, refractory, neuromodulators, plasticity (LTP + LTD + STDP + homeostatic), topology bounds, pathologies, oscillations (delta/theta/alpha/gamma), offline consolidation, 5 functional networks (DMN/Salience/CEN/DAN/VAN). Ref: `technical-2.0.md` §26.
- **Activation** — `<BrainHeatmap />` (live + aggregate + network overlay) + `<TraceTimeline />` + `<GoalDag />` + Appendix D SSE events.

**Coverage closure** — 17 thinking components + 5 mindset axes + 8 thought modes + 4 action classes + 8 neuron cell types + 4 glia types + 7 neurotransmitters + 26 brain regions + 5 functional networks + 4 oscillation bands + 5 plasticity mechanisms + 5 pathology modes = **98 cognitive/neural primitives**, each with (a) a code locus, (b) a CI gate, (c) a node in the canonical knowledge graph (`@retune/onto`, see `technical-2.0.md` §30) with cross-references to UBERON / ChEBI / GO / DOID / MFOEM / NIFSTD, and (d) a user-visible surface where surfacing is appropriate.

**SOTA knowledge graph** — the cognitive and neural taxonomies in this PRD are not just documentation; they are materialised as a 192-node, 250-relationship JSON-LD graph at `@/Users/shubhamkanse/retune/packages/onto/src/cognitive.jsonld`. Markdown tables are derived views; the JSON-LD is the source of truth. Materialisations: Neo4j Cypher (`packages/onto/dist/cognitive.cypher`), TypeScript types (`packages/onto/src/types.ts`), typed runtime accessor (`@retune/onto`). All deterministic; all CI-gated.

No neural concept is product-internal: every spike, suppression, calibration update, plasticity event, action selection, and emotional inference has a user-visible surface, a dismiss/correct affordance where the user might be affected, and an audit-trail entry for replay.

---

**End of `prd-2.0.md`.** See `technical-2.0.md` for the engineering contract.
