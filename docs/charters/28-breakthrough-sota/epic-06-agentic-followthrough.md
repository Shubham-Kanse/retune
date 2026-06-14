# Epic 06: Agentic Follow-Through

**Charter:** 28 — Breakthrough SOTA
**Priority:** P1
**Complexity:** L
**Movement:** Reach
**Feeds:** Epic 03 (funnel data).

---

## Goal

The funnel ends where the relationship should begin. Turn the one-shot package into a multi-week relationship: track the application as a funnel, prep the user for the interview from the same evidence ledger, and draft follow-up messages. This both delivers user value and produces the `application_events` funnel data that Epic 03 calibrates on.

## Definition of Done

- [ ] `application_events(application_id, type: applied|screen|interview|offer|rejected, occurred_at, note)` table + migration; the existing single-verdict `outcomes` row is upgraded to a timeline.
- [ ] Users can log funnel events from the application view; each event is timestamped and editable.
- [ ] An interview-prep generator produces likely questions + evidence-backed talking points from the user's `career_facts` + the stored JD requirements (reuses the agent, no new model plumbing).
- [ ] A follow-up message drafter produces a recruiter thank-you / status nudge grounded in the application.
- [ ] All follow-through artefacts respect the same honesty rules (no fabricated claims).
- [ ] Tests: event timeline CRUD + ownership scoping, prep generation shape.

---

## Story 6.1 — Funnel timeline
**Acceptance Criteria:**
- [ ] `application_events` migration + Drizzle schema + ownership-scoped `/v1` routes (GET/POST).
- [ ] Outcome capture writes an event, not just a terminal verdict.

## Story 6.2 — Interview prep from the ledger
**Acceptance Criteria:**
- [ ] Given an application, generate role-specific questions + talking points citing `career_facts`/evidence spans.
- [ ] Refuses gracefully when evidence is too thin (consistent with the gate philosophy).

## Story 6.3 — Follow-up drafter
**Acceptance Criteria:**
- [ ] Drafts a short, grounded follow-up message; user edits before sending; nothing is sent automatically.
