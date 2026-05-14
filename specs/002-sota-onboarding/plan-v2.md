# SOTA Onboarding Plan (v2)

## Goal

Build a complete, accurate `UserCareerProfile` from a resume + minimal targeted questions while:

1. **Preserving every extracted resume field** exactly as parsed (no data loss)
2. **Letting the user edit anything** naturally via free text or pills
3. **Never silently dropping** user input
4. **Never blindly storing** unvalidated text into structured fields
5. Maintaining **full conversation context** so the AI knows the goal, history, and what remains

---

## Audit findings (current state)

### What works ✅

- **Session persistence** is solid. `onboarding_sessions` table stores `profile_delta`, `metadata`/`onboarding_state`, `messages` (with role/content/questionKey/cards/pills), `turn_count`, `response_chain_id`. Reconciliation function recovers state on reload by replaying chat history.
- **Pill-driven actions** are deterministic and validated. `confirm_field` flips the right flags; `set_field` writes the carried value. No corruption possible.
- **Resume extraction** writes all fields with `source: "resume"`, `confidence: 0.8`, `confirmed: false` — preserved verbatim, never overwritten by confirms.
- **Planner** is a clean state machine with 12 ordered phases.

### What is broken ❌

| # | Bug | Location | Impact |
|---|---|---|---|
| 1 | Free text without an armed `pendingTextInput` is silently dropped | `route.ts:478-479` | User types correction → planner re-asks same question, no feedback |
| 2 | `applyTextToField` covers only 5 fields (roles, markets, emphasis, skills, professional identities) | `route.ts:484-501` | Identity, experience, education, phone, LinkedIn cannot be edited via free text at all |
| 3 | No semantic validation. Text is `split(",")` and stored verbatim | `route.ts:481` | "idk lol" becomes a role; "yes please" becomes a skill |
| 4 | Copywriter LLM has no chat history, no answered list, no remaining list | `route.ts:265-280` | AI cannot acknowledge edits, cannot avoid repeating itself, cannot reference prior turns |
| 5 | The "Other" pill on multi-select questions arms `pendingTextInput` but only writes one comma-split value into the array | `route.ts:467-469`, `481-501` | "Senior PM, Product Lead" parses correctly; "I'm thinking about senior PM" gets stored as a literal role name |

---

## Architecture (3 layers)

### Layer 1 — Deterministic state machine (planner)

**Status: keep as-is.** Source of truth for: what to ask next, in what order, with what pills. Pills always carry validated structured values.

### Layer 2 — Free-text interpreter (NEW)

A single LLM call that turns any free-text reply into a structured `RouterDecision`:

```ts
type RouterDecision =
  | { intent: "answer_current"; field: string; value: StructuredValue; confidence: number; rationale: string }
  | { intent: "edit_field";     field: string; patch: ProfilePatch; confidence: number; rationale: string }
  | { intent: "skip"; rationale: string }
  | { intent: "off_topic"; userQuestion?: string; rationale: string }
  | { intent: "ambiguous"; clarification: string; rationale: string };
```

**Inputs to the router:**
- Current question (field, expected schema, prompt, why-asked)
- Full known profile snapshot
- Last 6 turns of chat history
- The user's free text

**Output:** strict JSON via OpenAI tools. No prose.

### Layer 3 — Schema validator + writer (NEW)

After router returns:
1. Validate `value` / `patch` against zod schema for that field
2. If valid → apply with `source: "user", confidence: 1.0, confirmed: true`. Keep an `editHistory` entry on the field with the old value.
3. If invalid or low-confidence → ask follow-up; do not write
4. If `intent: "off_topic"` → answer the user's side question and re-anchor on the current question
5. If `intent: "ambiguous"` → reply with `clarification`, do not write

---

## Data preservation rules

1. Resume extraction writes ALL fields with `source: "resume"`, `confidence: 0.8`, `confirmed: false`
2. `confirm_field` pills only flip `confirmed: true` — never overwrite values
3. Edit pills + free text run through router → validated patch → written with `source: "user"`, `confirmed: true`
4. Each `ProfileField` keeps an `editHistory: [{ value, source, ts }]` (additive, never destructive) for audit / undo
5. Multi-select pills always replace the whole array (intentional; matches user mental model)
6. Until ALL planner-required questions are answered, profile is NEVER promoted to `users` table
7. Only on `dashboard_handoff` do we run `normalizeProfile` and `persistProfile` atomically

---

## What the AI sees every turn (NEW)

### Router LLM call

```
[ROLE] You interpret onboarding free-text into structured profile patches. Output JSON only via the route_input tool.
[GOAL] Build a UserCareerProfile that meets readiness threshold ≥75.
[PROFILE]    <full known state with confidence + confirmed flags>
[QUESTION]   <current question + expected field schema>
[ANSWERED]   <list of confirmed fields>
[REMAINING]  <list of fields still required>
[HISTORY]    <last 6 turns>
[USER]       <free text>
```

### Copywriter LLM call (existing, enriched)

Add to existing context:
- **Answered** field list
- **Remaining** field list
- Last 6 chat turns
- Router decision summary (so reply can say "Got it, updated your email to x@y.com")

---

## Onboarding flow (final)

```
Resume upload                    │ deterministic
   ↓
Resume parsing (LLM extract)     │ LLM (extractor)
   ↓
Resume summary card              │ deterministic
   → confirm / edit              │ edit → router
   ↓
Identity confirm card            │
   → confirm / edit              │ edit → router
   ↓
Experience confirm card          │
   → confirm / edit per role     │ edit → router
   ↓
Education confirm card           │
   → confirm / edit per entry    │ edit → router
   ↓
Skills confirm (3-tier card)     │
   → keep / edit (structured editor)
   ↓
Career enrichment                │ pills + free text
   • Professional identity
   • Career direction
   • Role interests (multi)
   • Market preferences (multi)
   • Work preference
   • Emphasis areas (multi)
   ↓
Readiness check ≥ 75%            │ deterministic
   ↓
Persist to users table           │ atomic
   ↓
Dashboard handoff
```

---

## Implementation steps (priority order)

| # | Step | Risk | LOC est. |
|---|---|---|---|
| 1 | Build `text-router.ts` — LLM-backed free-text interpreter with strict JSON schema | M | ~180 |
| 2 | Build `apply-patch.ts` — schema-validated writer covering ALL profile fields | L | ~220 |
| 3 | Wire router into `route.ts` — replace direct `applyTextToField` call | M | ~40 |
| 4 | Enrich copywriter context with chat history + answered/remaining lists | L | ~30 |
| 5 | Add user-visible echo of applied changes ("Updated your email to x@y.com") | L | ~20 |
| 6 | Add `editHistory` to `ProfileField` + record on every write | M | ~50 |
| 7 | Add an `Edit` pill back to confirm screens that arms `pendingTextInput` AND lets free text route to the router (router decides) | L | ~30 |

**This change set:** Steps 1–4 are the keystone. Once those land, the system is correct end-to-end. 5–7 are polish.

---

## Test path (after Steps 1–3)

1. Resume upload → identity confirm card shows extracted name/email
2. User types `"My email should be foo@bar.com"` in the composer
3. Router classifies as `edit_field`, field=`identity.email`, value=`foo@bar.com`, confidence=0.95
4. Writer validates and applies patch with `source: "user"`, `confirmed: true`
5. Copywriter reply: "Got it, updated your email to foo@bar.com. Anything else?"
6. Planner re-asks identity_confirm card (now showing the new value)
7. User clicks "Looks correct" → identity confirmed → next question

**Negative test:** User types `"idk lol"` on a role-interest question. Router returns `intent: "ambiguous"`, no write. Copywriter asks for a clearer answer. Profile unchanged.

**Off-topic test:** User types `"can I delete my account?"` on identity_confirm. Router returns `intent: "off_topic", userQuestion: "delete account"`. Copywriter answers the question and returns to identity_confirm. Profile unchanged.
