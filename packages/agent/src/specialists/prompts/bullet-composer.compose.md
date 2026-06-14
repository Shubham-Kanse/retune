---
name: bullet-composer.compose
version: 1
model_hint: smart
charter: 09-ai-ml/epic-01
extracted_from: packages/agent/src/specialists/bullet-composer.ts:build_bullet_prompt
parameters:
  - template (string) — CAR | PAR | XYZ | STAR | hybrid
  - template_description (string) — human-readable template pattern
  - verb (string) — required opening verb (past tense)
  - evidence (string) — formatted evidence assignments
  - section_hint (string) — experience | skills | summary | projects
  - dominant_claim_type (string) — metric | leadership | technical_depth | achievement | skill_usage
---

## Generate ONE bullet using:

**Template:** {{template}} ({{template_description}})
**Opening verb:** "{{verb}}" (past tense)
**Evidence to ground the bullet in:**
{{evidence}}

**Section:** {{section_hint}}
**Dominant claim type:** {{dominant_claim_type}}
