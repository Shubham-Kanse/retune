# Charter 26 Epic 01 — Refusal Taxonomy

**Charter:** 26 — AI Safety
**Status:** Partially landed (B10 in backlog ships the enum + corpus skeleton)
**Owner:** AI safety lead

## Goal

Replace free-form refusal reasons with a closed enum so:
- Refusal events are queryable + measurable (Charter 21 Epic 05).
- The UI can render canonical messaging per refusal type.
- The eval suite can score refusal accuracy.

## Definition of Done

- Closed `RefusalReason` enum exported from `packages/agent/src/specialists/refusal-taxonomy.ts`.
- `refuse-or-ship-gate.ts` writes one of these reasons (not free-form).
- The SSE done event's `refusal.reasons` array contains entries from
  the enum + an optional `details` field for human-readable context.
- The web UI's refusal-card component switches on the enum to show
  canonical copy + appropriate next-action CTA.
- Migration: any pre-existing free-form reasons in `gdpr_packets` are
  re-coded by a one-time backfill script.

## The taxonomy

```ts
export type RefusalReason =
  | "insufficient_evidence"        // Profile lacks the evidence to back claims for this JD
  | "role_mismatch"                // Candidate's background is fundamentally wrong for the role
  | "fabricated_claim"             // The user's own profile contains unverifiable / fabricated claims
  | "policy_violation"             // The JD or request violates Charter 26 policy doc
  | "prompt_injection_detected"    // Adversarial content in JD or profile attempting to override gate
  | "low_quality_input"            // Input was too short / corrupted / non-resume to process
  | "rate_limit"                   // Per-user safety throttle (separate from billing rate limit)
  | "service_degraded"             // Upstream provider failure that we can't recover from
```

Each reason has:
- `enum_id`: machine identifier (above).
- `display_title`: short user-facing title ("Not enough evidence yet").
- `display_message`: longer explanation in brand voice.
- `next_action`: enum of (`add_more_experience` / `pick_different_role` / `contact_support` / `retry_later` / `appeal`).
- `appeal_path`: optional URL to the appeal flow.

## Stories

### Story 1.1 — Define the enum + metadata
Land `packages/agent/src/specialists/refusal-taxonomy.ts` with the
type + the metadata table.

**Acceptance:** Importable from agent index; 5 unit tests asserting
the metadata is well-formed.

### Story 1.2 — Wire into refuse-or-ship-gate
Update the gate to choose one enum value when refusing. Keep the free-form
field as `details` for context.

**Acceptance:** Gate's blackboard write contains only enum values for `reasons`.

### Story 1.3 — Backfill historical data
One-time migration that maps existing free-form reasons in
`gdpr_packets.packet` to the closest enum value. Best-effort; reasons
that don't map cleanly become `policy_violation` with a backfill marker.

**Acceptance:** All historical rows have a recoded reason; a sample of
20 is human-reviewed for accuracy.

### Story 1.4 — UI surfacing
Refusal-card component switches on the enum to render canonical copy.
Pulls from the metadata table.

**Acceptance:** All 8 refusal kinds render correctly in component test.

### Story 1.5 — Audit log + eval integration
- The `security_audit_log` event for AI-refusal gets the enum id.
- Charter 21 eval cases include a `expected_refusal_reason` field that
  the eval suite asserts against.

**Acceptance:** Eval run produces a per-reason refusal-accuracy table.

## Tasks

- [ ] 1.1.1 Implement enum + metadata.
- [ ] 1.1.2 Unit tests.
- [ ] 1.2.1 Update gate.
- [ ] 1.2.2 Update gate tests.
- [ ] 1.3.1 Write backfill script.
- [ ] 1.3.2 Run on staging; review sample.
- [ ] 1.3.3 Run on prod (after staging soak).
- [ ] 1.4.1 Update RefusalCard component.
- [ ] 1.4.2 Component tests for all 8 reasons.
- [ ] 1.5.1 Add `expected_refusal_reason` to canonical eval cases.
- [ ] 1.5.2 Update eval suite scorer.

## Dependencies

- Charter 02-Core-Features Epic 04 (refusal surface) — landed.
- Charter 21 Epic 01 (canonical set) — for evaluation.

## Estimated effort

~3 working days.
