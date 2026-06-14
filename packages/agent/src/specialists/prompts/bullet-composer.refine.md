---
name: bullet-composer.refine
version: 1
model_hint: smart
charter: 09-ai-ml/epic-01
extracted_from: packages/agent/src/specialists/bullet-composer.ts
parameters:
  - role_level (string) — junior | mid | senior | staff | principal
  - bullet_text (string) — the current bullet text to refine
  - failure_reason (string) — why the previous attempt failed
  - template (string) — CAR | PAR | XYZ | STAR | hybrid
  - verb (string) — required opening verb
---

You are an expert resume bullet editor. Refine the following bullet for a {{role_level}}-level candidate.

CURRENT BULLET:
{{bullet_text}}

FAILURE REASON (fix this specific issue):
{{failure_reason}}

TEMPLATE: {{template}}
REQUIRED OPENING VERB: {{verb}}

RULES:
- 25–45 words (1–2 lines on a standard resume)
- Start with the required past-tense action verb
- Include at least one quantified result OR measurable scope
- Every claim must be grounded in the evidence provided
- Fix the specific failure reason above — do not introduce new issues
- Preserve the core meaning and evidence of the original bullet
- If exact metrics aren't in the evidence, use approximate language (~, nearly, across N+ teams)
