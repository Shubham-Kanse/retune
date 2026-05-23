# Epic 04 — Refusal Surface

**Charter:** 02-Core-Features
**Priority:** P1 — Week 4 (after SSE reconnection lands)
**Complexity:** L
**Owner:** Product Engineering Lead + Cognitive Substrate Tech Lead
**Status:** Created in architect rewrite (2026-05-22). The gate exists; the user-facing surface does not.

---

## Goal

Provide a user-facing surface when `RefuseOrShipGate` refuses a generation. Today the gate makes a multi-criteria decision (ship | refuse | revise) but when it refuses, the user sees a generic error with no explanation, no evidence summary, and no appeal path. This is a product gap — the substrate has the information; the product layer doesn't surface it.

## Definition of Done

- [ ] When `RefuseOrShipGate` terminates with `refuse`, the SSE `done` event includes a `refusal_explanation` payload containing the failed evidence requirements and the gate's confidence score.
- [ ] `apps/web/src/components/results/results-view.tsx` renders a refusal explanation card when the generation terminates with `refuse`.
- [ ] The user can initiate an appeal that routes through `apps/api/src/routes/active-questions.ts` to gather missing evidence and retry.
- [ ] The refusal surface is accessible (WCAG 2.1 AA) and does not require the user to understand the internal pipeline.

---

## Code grounding (verified)

- `packages/agent/src/specialists/refuse-or-ship-gate.ts` (24.7 KB, priority 10) — handles `decide_refuse_or_ship` goal kind. Decision matrix outputs `ship`, `refuse`, or `revise`. Writes `hypotheses.ship_decision` to the blackboard.
- `apps/api/src/routes/stream.ts:86` — the `done` SSE event already includes `frame.summary.termination`. When the gate refuses, `termination` is set but no structured explanation is included in the payload.
- `apps/api/src/routes/stream.ts:93` — the `done` event is `JSON.stringify({ ...frame.summary, narrativeSummary })`. The `frame.summary` object is the extension point.
- `apps/web/src/components/results/results-view.tsx` (74 KB) — the main results view component. Currently handles success states only.
- `apps/api/src/routes/active-questions.ts` — POST `/active-questions/:id/answer` endpoint. Already implements a user-input loop for gathering evidence during generation. Reusable for the appeal path.
- `packages/agent/src/specialists/refuse-or-ship-gate.ts` emits `request_user_input` goal when decision is `revise` — this is the existing mechanism for the appeal path.

---

## Story 4.1 — Extend SSE done event with refusal explanation

**As a** frontend developer,
**I want** the SSE `done` event to include structured refusal data when the gate refuses,
**so that** I can render a meaningful explanation to the user.

### Acceptance criteria

- [ ] When `frame.summary.termination === "refuse"`, the `done` event payload includes `refusal_explanation: { failed_criteria: string[], confidence: number, evidence_gaps: string[], appeal_available: boolean }`.
- [ ] The `refusal_explanation` is populated from `hypotheses.ship_decision` on the blackboard (already written by the gate).
- [ ] When `termination !== "refuse"`, `refusal_explanation` is absent (not `null`, absent).
- [ ] Type contract updated in `packages/types/` for the SSE done event shape.

### Tasks

- **4.1.1** Extend the `GenerationSummary` type in `packages/types/` to include optional `refusal_explanation`.
- **4.1.2** In `apps/api/src/routes/stream.ts`, when building the `done` event, read `hypotheses.ship_decision` from the final blackboard snapshot and populate `refusal_explanation` if `termination === "refuse"`.
- **4.1.3** Add a unit test that mocks a refused generation and asserts the `done` event shape.

---

## Story 4.2 — UI refusal explanation card

**As a** user whose generation was refused,
**I want** to see why it was refused and what evidence was missing,
**so that** I can fix the issue or appeal the decision.

### Acceptance criteria

- [ ] `apps/web/src/components/results/refusal-card.tsx` renders when the generation stream completes with `termination === "refuse"`.
- [ ] The card displays: (a) a human-readable summary of why the generation was refused, (b) the specific criteria that failed, (c) what evidence would satisfy those criteria, (d) an "Appeal this decision" button.
- [ ] The card is accessible: proper heading hierarchy, ARIA labels, keyboard navigable.
- [ ] The card is visually distinct from error states (it's a decision, not a crash).

### Tasks

- **4.2.1** Create `apps/web/src/components/results/refusal-card.tsx`. Extract from `results-view.tsx` (74 KB — this is a decomposition opportunity per Charter 10-UX).
- **4.2.2** Wire the card into the results view: when `done` event has `refusal_explanation`, render the refusal card instead of the success view.
- **4.2.3** Design the card layout: failed criteria as a checklist, evidence gaps as actionable items, appeal button prominent.
- **4.2.4** Accessibility audit: screen reader testing, keyboard navigation, colour contrast.

---

## Story 4.3 — Appeal path via active-questions

**As a** user who disagrees with a refusal,
**I want** to provide additional evidence and have the generation re-evaluated,
**so that** legitimate generations are not permanently blocked.

### Acceptance criteria

- [ ] Clicking "Appeal this decision" in the refusal card opens an evidence-gathering flow.
- [ ] The flow reuses `apps/api/src/routes/active-questions.ts` — the same user-input loop used during generation for `request_user_input` goals.
- [ ] The appeal creates a new `request_user_input` goal on the blackboard with the evidence gaps from the refusal as the questions.
- [ ] After the user provides answers, the gate re-evaluates. If evidence is now sufficient, generation proceeds to `ship`.
- [ ] If the gate refuses again after appeal, the user sees an updated explanation with a "contact support" fallback.

### Tasks

- **4.3.1** Add an API endpoint (or extend existing) that accepts an appeal for a refused generation: `POST /generate/:id/appeal`.
- **4.3.2** The endpoint seeds a `request_user_input` goal with the `evidence_gaps` from the refusal as questions.
- **4.3.3** Frontend: "Appeal" button triggers the active-questions UI flow (already exists for mid-generation questions).
- **4.3.4** After answers are submitted, re-run the `decide_refuse_or_ship` goal. Stream the result.
- **4.3.5** Handle the "refused again" case: show updated explanation + support contact.

---

## Out of scope

- Automatic appeal (no user interaction) — always requires user evidence.
- Refusal analytics dashboard (Charter 05 observability).
- Decomposition of `results-view.tsx` (74 KB) — noted as a prerequisite but owned by Charter 10-UX.

---

## Hard dependencies

- **Charter 04-Resilience Epic 02 (SSE Last-Event-ID reconnection)** — reconnects must not double-deliver the refusal event. The `done` event with `refusal_explanation` must be idempotent on reconnect.
- Charter 10-UX (results-view decomposition) — Story 4.2 adds a new component; the 74 KB file should be decomposed first or concurrently.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Refusal explanation exposes internal model reasoning inappropriately | Gate already produces user-facing criteria; review the `failed_criteria` strings for safety before shipping |
| Appeal loop: user appeals indefinitely | Limit to 1 appeal per generation; after that, "contact support" |
| SSE reconnect delivers refusal event twice | Hard dep on 04-resilience/epic-02; Last-Event-ID deduplication handles this |
| `results-view.tsx` (74 KB) is too large to safely modify | Story 4.2 creates a separate component file; minimal changes to the parent |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Refusal explanation in SSE done event | Unit test: mock refused generation → assert `refusal_explanation` present in done payload | CI |
| UI renders refusal card | Component test: render results-view with refused generation → refusal-card visible | CI |
| Appeal triggers active-questions flow | Integration test: POST `/generate/:id/appeal` → creates `request_user_input` goal | CI |
| No double-delivery on reconnect | Integration test: reconnect after refusal → only one `done` event received | CI (after 04-resilience/epic-02) |
| Accessibility | axe-core scan on refusal-card component | CI |
