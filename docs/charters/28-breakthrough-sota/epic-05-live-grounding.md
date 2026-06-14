# Epic 05: Live Company / Role Grounding

**Charter:** 28 — Breakthrough SOTA
**Priority:** P1
**Complexity:** M
**Movement:** The Moat

---

## Goal

`TheoryOfMind` reasons about the recruiter/company from generic archetypes, not the company's actual public signals. Give the company-research path a real web-search tool (provider-native web search is already capability-exposed in `ai-provider.ts`) so positioning reflects the company's recent priorities, product, and tone — gated behind explicit per-request consent (the `research_company_context` goal already carries `consent_web_research: false`).

## Definition of Done

- [ ] When `consent_web_research` is true, a `CompanyResearcher` step performs a bounded web search and distils 3–6 grounded signals (recent initiatives, stack, values language) with source URLs.
- [ ] Signals feed `TheoryOfMind` and `ApplicationStrategyComposer`; the audit records the sources used.
- [ ] SSRF-safe (reuse `apps/api` `ssrf-guard`), time-bounded, and fully optional — no consent → today's behaviour exactly.
- [ ] Grounding failures degrade silently to archetype reasoning.
- [ ] Tests: consent gating, signal extraction shape, degraded path.

---

## Story 5.1 — Consent-gated web research
**Acceptance Criteria:**
- [ ] Web research only runs when the request opts in; default remains off.
- [ ] Results capped (count + total bytes + wall-clock) and SSRF-filtered.

## Story 5.2 — Grounded signals into strategy
**Acceptance Criteria:**
- [ ] Extracted signals injected into the company schema on the blackboard with source provenance.
- [ ] Strategy/ToM cite grounded signals; audit packet lists sources.
