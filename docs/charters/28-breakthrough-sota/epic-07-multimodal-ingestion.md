# Epic 07: Multimodal Ingestion

**Charter:** 28 — Breakthrough SOTA
**Priority:** P2
**Complexity:** M
**Movement:** Reach

---

## Goal

Today the profile is built from pasted text + an uploaded resume PDF. Widen the funnel and deepen evidence by ingesting the artefacts people actually have: a LinkedIn data export, a portfolio PDF, a GitHub profile, and a JD screenshot — each parsed into `career_facts` and evidence spans natively rather than pasted.

## Definition of Done

- [ ] LinkedIn export (CSV/zip) parsed into structured experience + skills → `career_facts`.
- [ ] JD screenshot / image accepted and OCR/vision-extracted into the JD text path.
- [ ] GitHub handle ingested into project/skill facts (public repos, languages).
- [ ] Each ingested artefact produces provenanced facts (`source: linkedin|github|portfolio|screenshot`).
- [ ] All ingestion is best-effort and degrades to manual entry; size/type guarded.
- [ ] Tests: parser shape per source, provenance, degraded paths.

---

## Story 7.1 — LinkedIn export importer
**Acceptance Criteria:** parsed into facts with `source: linkedin`; deduped against existing facts.

## Story 7.2 — Vision JD intake
**Acceptance Criteria:** image JD → text via a vision model call; feeds the existing preflight unchanged downstream.

## Story 7.3 — GitHub enrichment
**Acceptance Criteria:** public profile → language/project facts with `source: github`; rate-limited and optional.
