# Epic 09: Hygiene & Consolidation

**Charter:** 28 — Breakthrough SOTA
**Priority:** P0
**Complexity:** S
**Movement:** Reliability

---

## Goal

Close the small, sharp gaps the audit found: client-facing "brain" terminology (against the project's own rule), and undocumented divergence between the two migration tracks.

## Definition of Done

- [ ] No `brain_region` or neuro terminology reaches any client-facing surface. The internal `brain_region` field may remain in the runtime/trace types, but the `/(auth)/brain/page.tsx` route and any rendered copy are renamed/cleaned to neutral product language ("Decision trace").
- [ ] The SSE/trace payload consumed by the browser does not surface `brain_region` (drop it from the client DTO or rename to a neutral `lane`).
- [ ] A `MIGRATIONS.md` documents the two tracks (pglite replay set `0000–0011`, `0018`, `0019` vs production `0012–0017`), why they diverge, and the rule for adding a migration to each.
- [ ] No test regressions.

---

## Story 9.1 — De-brain the UI
**Acceptance Criteria:**
- [ ] `/(auth)/brain` route renamed to `/(auth)/trace` (or folded into the audit page); nav/links updated; no "brain" string in rendered output (`grep -ri "brain" apps/web/src/app apps/web/src/components` returns only non-UI internals).
- [ ] Client trace DTO no longer exposes `brain_region` (or exposes it as neutral `lane`); existing trace tests updated.

## Story 9.2 — Document the migration tracks
**Acceptance Criteria:**
- [ ] `packages/db/MIGRATIONS.md` explains both tracks and the add-a-migration rule; `migrator.ts` references it.
