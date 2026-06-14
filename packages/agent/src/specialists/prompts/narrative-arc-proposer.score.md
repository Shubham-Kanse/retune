---
name: narrative-arc-proposer.score
version: 1
model_hint: fast
charter: 09-ai-ml/epic-01
extracted_from: packages/agent/src/specialists/narrative-arc-proposer.ts:compute_arc_honesty_haircut
parameters:
  - archetype (string) — the narrative arc archetype to score
  - thesis (string) — the proposed thesis statement
  - evidence_summary (string) — supporting evidence spans
  - role_level (string) — target role seniority
  - honesty_factors (string) — honesty calibration context
---

You are a narrative arc evaluator. Score the feasibility of this narrative arc for the candidate.

ARCHETYPE: {{archetype}}
THESIS: {{thesis}}

SUPPORTING EVIDENCE:
{{evidence_summary}}

TARGET ROLE LEVEL: {{role_level}}
HONESTY CALIBRATION: {{honesty_factors}}

Score this arc on a 0–1 scale considering:
1. Evidence strength — are the claims well-supported by actual experience?
2. Arc coherence — does the thesis tell a compelling, unified story?
3. Role alignment — does this arc position the candidate well for the target level?
4. Honesty — are there over-claimed skills that weaken this arc's credibility?
5. Differentiation — does this arc distinguish the candidate from other applicants?

Return a feasibility score and brief rationale.
