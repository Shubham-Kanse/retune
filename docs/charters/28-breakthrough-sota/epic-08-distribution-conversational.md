# Epic 08: Distribution + Conversational Refine

**Charter:** 28 — Breakthrough SOTA
**Priority:** P2
**Complexity:** M
**Movement:** Reach

---

## Goal

Two gaps: (1) the product has no growth loop — nothing shareable, no public artefact; (2) result refinement is a modal, not a conversation. Add a shareable, honest "proof-of-evidence" verdict artefact and replace the modal refine with streaming conversational editing of the result.

## Definition of Done

- [ ] A shareable, read-only verdict/audit artefact (public link, no PII beyond what the user opts to show) that demonstrates "this application is evidence-backed" — the honesty as marketing.
- [ ] Conversational refine: the user can chat to adjust the result (tone, emphasis, length) with streamed responses, replacing `refine-modal.tsx`'s one-shot flow.
- [ ] Every conversational edit still passes the honesty/voice guards; no fabricated claims slip in via chat.
- [ ] The `/v1` API exposes the three public primitives (`POST /v1/verdicts`, `POST /v1/generations`, `GET /v1/facts`) with per-key auth for integration partners.
- [ ] Tests: share-link auth/scoping, conversational edit guard, API key auth.

---

## Story 8.1 — Shareable verdict artefact
**Acceptance Criteria:** opt-in public link; revocable; shows verdict + evidence summary, never raw PII unless chosen.

## Story 8.2 — Conversational result editing
**Acceptance Criteria:** streamed chat edits applied to the draft; each change re-validated by voice/honesty guards; undo supported.

## Story 8.3 — Public API keys
**Acceptance Criteria:** hashed per-user/org API keys (`api_keys` table); the three primitives authenticate via them; rate-limited.
