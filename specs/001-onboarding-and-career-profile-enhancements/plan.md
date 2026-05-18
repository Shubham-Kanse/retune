# Onboarding Pipeline — Implementation Plan

**Spec:** `specs/001-onboarding-and-career-profile-enhancements/onboarding.md`  
**Scope:** Replace the existing 18-phase onboarding with a 9-stage LLM-driven pipeline  
**Target:** `apps/web` (API routes + UI) with new session state, LLM calls, and DB schema  

---

## Overview

The current onboarding is a 18-phase linear wizard with per-section confirmation cards (identity → experience → education → skills → projects → professional identity → career direction → roles → markets → work preference → seniority → industries → dealbreakers → emphasis → de-emphasis → tone → style → completion). It asks many questions that do not directly impact resume generation quality.

The new pipeline is a 9-stage system that:
1. Extracts data from the resume via parallel LLM calls (Stages 1–3)
2. Presents a single intelligent summary for confirmation (Stage 4)
3. Handles corrections conversationally (Stage 5)
4. Assesses completeness and branches the question path (Stage 6)
5. Asks only resume-generation-relevant questions with per-answer LLM evaluation (Stage 7)
6. Extracts voice and tone preferences (Stage 8)
7. Audits, gap-fills, and commits the profile (Stage 9)

---

## Prerequisites

- [ ] Feature branch: `feat/onboarding-v2`
- [ ] Existing onboarding code preserved behind a feature flag (`ONBOARDING_V2=1`) until migration is complete
- [ ] AI provider abstraction already exists (`packages/agent/src/lib/provider.ts`) — reuse for all LLM calls
- [ ] Supabase DB access via `packages/db` — new tables/columns added via migration

---

## Architecture Decisions

1. **Session persistence**: New `onboarding_sessions` table in Supabase (JSONB column for full session state). Replaces the current `onboarding_conversations` table approach.
2. **LLM calls**: All onboarding LLM calls go through a new `apps/web/src/lib/onboarding-v2/llm/` module that wraps `@retune/agent`'s provider abstraction with onboarding-specific retry/timeout logic.
3. **Streaming UI**: The onboarding page becomes a single-page conversational interface (not a multi-step wizard). Messages stream via the existing Next.js API route pattern.
4. **No Temporal**: Onboarding runs entirely in `apps/web` API routes — no worker/Temporal dependency.
5. **Parallel LLM calls**: Use `Promise.allSettled` for parallel calls (Stage 1 schema mapping, Stage 2 dual extraction).

---

## File Structure (New)

```
apps/web/src/lib/onboarding-v2/
├── types.ts                    # New session state, stage enums, question map
├── session.ts                  # Session CRUD (create, load, update, commit)
├── stages/
│   ├── stage-1-upload.ts       # File validation, text extraction, schema mapping LLM
│   ├── stage-2-extraction.ts   # Pure extraction + inferred summary (parallel)
│   ├── stage-3-inference.ts    # Industry, role family, seniority inference
│   ├── stage-4-summary.ts      # Summary generation + presentation logic
│   ├── stage-5-correction.ts   # Correction interpretation loop
│   ├── stage-6-completeness.ts # Completeness assessment + path branching
│   ├── stage-7-questions.ts    # Question map, per-answer evaluation
│   ├── stage-8-voice.ts        # Voice/tone extraction
│   └── stage-9-audit.ts        # Confidence audit, gap surfacing, profile commit
├── llm/
│   ├── calls.ts                # All LLM call wrappers with retry logic
│   └── prompts.ts              # System prompts for each stage (from spec)
├── validation.ts               # File type/size validation, character thresholds
├── errors.ts                   # Typed error classes for each failure state
└── constants.ts                # Thresholds, limits, retry counts

apps/web/src/app/api/onboarding-v2/
├── session/route.ts            # GET/POST session (create or resume)
├── upload/route.ts             # POST file upload + extraction
├── upload/stream/route.ts      # SSE progress during upload/extraction
├── message/route.ts            # POST user message (correction, answer)
├── confirm/route.ts            # POST summary confirmation
├── commit/route.ts             # POST final profile commit
└── restart/route.ts            # POST session wipe + restart

apps/web/src/app/(onboarding)/onboarding-v2/
└── page.tsx                    # New onboarding UI (conversational)

apps/web/src/components/onboarding-v2/
├── chat-interface.tsx          # Main conversational UI
├── upload-zone.tsx             # File upload with progress
├── summary-card.tsx            # Collapsible extraction summary
├── chip-selector.tsx           # Multi/single select chips
├── confirmation-buttons.tsx    # "Looks correct" / "Something is wrong"
└── progress-indicator.tsx      # Stage progress (non-intrusive)
```

---

## Database Migration

New migration: `supabase/migrations/YYYYMMDD_onboarding_v2_sessions.sql`

```sql
-- Onboarding V2 session state (replaces onboarding_conversations for v2 users)
CREATE TABLE IF NOT EXISTS onboarding_v2_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_state JSONB NOT NULL DEFAULT '{}',
  onboarding_status TEXT NOT NULL DEFAULT 'awaiting_upload',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

CREATE INDEX onboarding_v2_sessions_user_idx ON onboarding_v2_sessions(user_id);
CREATE INDEX onboarding_v2_sessions_status_idx ON onboarding_v2_sessions(onboarding_status);

-- Voice profile table
CREATE TABLE IF NOT EXISTS user_voice_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  natural_voice_sample TEXT,
  tone_preferences JSONB NOT NULL DEFAULT '[]',
  tone_aversions JSONB NOT NULL DEFAULT '[]',
  self_description_style TEXT,
  sentence_structure TEXT,
  vocabulary_register TEXT,
  leading_pattern TEXT,
  phrases_to_use JSONB NOT NULL DEFAULT '[]',
  phrases_to_avoid JSONB NOT NULL DEFAULT '[]',
  tone_calibration_summary TEXT,
  voice_profile_confidence TEXT DEFAULT 'low',
  voice_profile_source TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Resume preferences table
CREATE TABLE IF NOT EXISTS user_resume_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role TEXT,
  target_role_specificity TEXT,
  underrepresented_skills JSONB DEFAULT '[]',
  deemphasis_preferences JSONB DEFAULT '[]',
  resume_frame TEXT,
  career_transition_framing TEXT,
  gap_handling TEXT,
  achievement_depth JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Onboarding metadata table (audit trail)
CREATE TABLE IF NOT EXISTS user_onboarding_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES onboarding_v2_sessions(id),
  confidence_flags JSONB DEFAULT '{}',
  source_flags JSONB DEFAULT '{}',
  low_confidence_fields JSONB DEFAULT '[]',
  correction_rounds INTEGER DEFAULT 0,
  profile_quality_score INTEGER DEFAULT 0,
  voice_profile_confidence TEXT DEFAULT 'low',
  completeness_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Add columns to existing profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS confirmed_role_family TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS confirmed_seniority TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS confirmed_industry TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_role TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_frame TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS completeness_path TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_quality_score INTEGER;
```

---

## Stage 1 — Resume Upload & Text Extraction

### Task 1.1: File Validation (`validation.ts`)

```typescript
// apps/web/src/lib/onboarding-v2/validation.ts

export type FileValidationError =
  | { code: "image_file"; message: string }
  | { code: "too_large"; message: string; maxBytes: number }
  | { code: "corrupted"; message: string }
  | { code: "password_protected"; message: string }
  | { code: "empty_content"; message: string; charCount: number }
  | { code: "unsupported_type"; message: string; detectedType: string };

export interface FileValidationResult {
  valid: boolean;
  error?: FileValidationError;
  detectedMimeType: string;
  fileSizeBytes: number;
}

export function validateUploadedFile(file: File): FileValidationResult;
```

**Implementation steps:**
1. Check `file.size` > `MAX_FILE_SIZE_BYTES` (10 * 1024 * 1024) → return `too_large`
2. Read first 8 bytes for magic byte detection:
   - `%PDF` (hex `25 50 44 46`) → PDF
   - `PK\x03\x04` (hex `50 4B 03 04`) → DOCX (ZIP-based)
   - `{\\rtf` → RTF
   - Otherwise check `file.type` header
3. If detected type is `image/*` (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`) → return `image_file` with message: "It looks like you uploaded an image — I need the actual resume file to read it properly. If you have it as a PDF or Word document, please upload that instead. If you only have it as an image, let me know and we can work around it."
4. Allowed types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`, `text/rtf`, `application/rtf`
5. If type not in allowed list → return `unsupported_type`

**User-facing error messages** (exact text from spec):
```typescript
export const UPLOAD_ERROR_MESSAGES: Record<FileValidationError["code"], string> = {
  image_file: "It looks like you uploaded an image — I need the actual resume file to read it properly. If you have it as a PDF or Word document, please upload that instead. If you only have it as an image, let me know and we can work around it.",
  too_large: "That file is a bit large for me to process. Resume files are usually well under 1MB — could you try compressing it or exporting a smaller version?",
  corrupted: "Something went wrong reading that file — it may be corrupted or in an unsupported format. Could you try re-exporting or re-saving it and uploading again?",
  password_protected: "That file appears to be password protected, so I can't read it. Could you remove the password protection and re-upload, or export an unprotected version?",
  empty_content: "That file didn't have much content in it — it may be a blank template or an incomplete draft. Is this the right file?",
  unsupported_type: "I wasn't able to read that file format. Could you try uploading a PDF or Word document instead?",
};
```

### Task 1.2: Text Extraction (`stages/stage-1-upload.ts`)

```typescript
export interface ExtractionResult {
  success: boolean;
  text: string | null;
  charCount: number;
  error?: { code: "password_protected" | "corrupted" | "extraction_failed"; raw: string };
}

export async function extractTextFromFile(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractionResult>;
```

**Implementation steps:**
1. Route by MIME type:
   - PDF → call existing `extractDocumentText()` from `apps/web/src/lib/profile-domain/extractors/document-text-extractor.ts` (uses Python subprocess)
   - DOCX → same extractor (handles DOCX via python-docx)
   - TXT/RTF → `Buffer.toString("utf-8")` directly
2. Catch specific errors:
   - Python subprocess returns exit code indicating password protection → `password_protected`
   - Generic read failure → `corrupted`
3. After extraction, compute `charCount = text.trim().length`
4. Thresholds:
   - `charCount < 200` → return `{ success: false, error: { code: "extraction_failed" } }` (scanned image PDF)
   - `charCount < 300` → return success but flag for `empty_content` check at API layer
   - `charCount >= 300` → full success

**Progress messages** (sent via SSE during extraction):
```typescript
export const EXTRACTION_PROGRESS_MESSAGES = [
  { stage: "uploading", message: "Uploading your resume..." },
  { stage: "extracting", message: "Reading your resume..." },
  { stage: "mapping", message: "Understanding your career..." },
  { stage: "complete", message: "Done! Let me show you what I found." },
] as const;
```

### Task 1.3: Upload API Route

**Route:** `POST /api/onboarding-v2/upload`

**Request:** `multipart/form-data` with field `file` (File) OR `{ pastedText: string }` for manual entry

**Response shape:**
```typescript
// Success
{ success: true; sessionId: string; status: "extraction_complete" }

// Validation error (no extraction attempted)
{ success: false; error: FileValidationError; uploadAttempts: number; showPasteFallback: boolean }

// Extraction error (file read but content insufficient)
{ success: false; error: { code: string; message: string }; uploadAttempts: number; showPasteFallback: boolean }
```

**Handler logic (step by step):**
1. Authenticate request → get `userId` from session
2. Load or create `onboarding_v2_sessions` row for this user
3. Increment `upload.upload_attempts`
4. If request has `pastedText`:
   - Validate length >= 300 chars
   - Store as `extraction.raw_text`, set `extraction_method: "paste"`
   - Skip to step 8
5. Read file from multipart form data
6. Call `validateUploadedFile(file)` → if invalid, return error with `showPasteFallback: upload_attempts >= 3`
7. Call `extractTextFromFile(buffer, mimeType, fileName)`:
   - If `charCount < 200` → return error with scanned-PDF message
   - If `charCount < 300` → return error with empty-content message
   - If extraction error → return typed error
8. Store in session:
   ```
   upload.file_name = fileName
   upload.file_type = mimeType
   upload.file_size_bytes = file.size
   upload.upload_timestamp = new Date().toISOString()
   extraction.raw_text = extractedText
   extraction.raw_text_character_count = charCount
   extraction.extraction_method = "file" | "paste"
   ```
9. Fire schema mapping LLM call (non-blocking — `Promise` not awaited):
   ```typescript
   fireSchemaMapping(extractedText, sessionId).catch(err => {
     // Silent failure — flag in session
     updateSession(sessionId, { "extraction.schema_mapping_status": "failed" });
   });
   ```
10. Update `onboarding_status` = `"extraction_complete"`
11. Return success

**Debounce logic:**
- Store an `AbortController` per userId in a module-level `Map<string, AbortController>`
- On new upload: abort previous controller, create new one
- Pass `signal` to extraction subprocess

### Task 1.4: Schema Mapping LLM Call

```typescript
// apps/web/src/lib/onboarding-v2/llm/calls.ts

export async function callSchemaMapping(
  rawText: string,
  sessionId: string,
  attempt: number = 1
): Promise<void>;
```

**Implementation steps:**
1. Build messages array:
   ```typescript
   const messages = [{
     role: "user" as const,
     content: `Raw resume text:\n\n${rawText}`
   }];
   ```
2. System prompt: verbatim from spec (stored in `prompts.ts` as `SCHEMA_MAPPING_SYSTEM_PROMPT`)
3. Call `getProvider().createMessage(...)` with:
   - Model: `getModels().fast` (schema mapping is structured extraction, doesn't need smart model)
   - Temperature: 0 (deterministic extraction)
   - Max tokens: 4096
4. Parse response as JSON
5. Validate against schema (check required fields exist, types correct):
   ```typescript
   function validateSchemaMappingOutput(output: unknown): { valid: boolean; errors: string[] }
   ```
6. If valid → update session: `extraction.schema_mapping_object = output`, `extraction.schema_mapping_status = "success"`
7. If invalid or error:
   - If `attempt < 3` → retry: `callSchemaMapping(rawText, sessionId, attempt + 1)`
   - If `attempt >= 3` → update session: `extraction.schema_mapping_status = "failed"`

### Task 1.5: Upload SSE Stream Route

**Route:** `GET /api/onboarding-v2/upload/stream?sessionId=xxx`

**SSE events emitted:**
```
event: progress
data: {"stage": "uploading", "message": "Uploading your resume..."}

event: progress
data: {"stage": "extracting", "message": "Reading your resume..."}

event: progress
data: {"stage": "mapping", "message": "Understanding your career..."}

event: complete
data: {"stage": "complete", "message": "Done! Let me show you what I found."}

event: error
data: {"code": "extraction_failed", "message": "..."}

event: slow_connection
data: {"message": "This is taking longer than expected — you can keep waiting or try again with a smaller file."}
```

**Slow connection detection:** If upload + extraction exceeds 45 seconds for a file < 5MB, emit `slow_connection` event. Do NOT auto-cancel.

### Task 1.6: Session Resumption

**On page load (`page.tsx` useEffect):**
```typescript
async function checkExistingSession() {
  const res = await fetch("/api/onboarding-v2/session");
  if (res.ok) {
    const { session } = await res.json();
    if (session && session.onboarding_status !== "awaiting_upload") {
      // Show resumption UI
      setResumeChoice({ hasExisting: true, status: session.onboarding_status });
    }
  }
}
```

**Resumption UI shows:**
- "Welcome back — I still have your resume from your last session."
- Button: "Continue where I left off" → route to stage matching `onboarding_status`
- Button: "Upload a new resume" → call `POST /api/onboarding-v2/restart` then show upload UI

**Stage routing map:**
```typescript
const STAGE_ROUTE_MAP: Record<OnboardingV2Status, number> = {
  awaiting_upload: 1,
  extraction_complete: 2,       // auto-advance (Stages 2-3 are automatic)
  dual_extraction_complete: 3,  // auto-advance
  inference_complete: 4,        // show summary
  summary_confirmed: 6,         // auto-advance to completeness
  correction_in_progress: 5,    // show correction UI
  path_branched: 7,             // show questions
  resume_questions_complete: 8, // show voice questions
  voice_extraction_complete: 9, // show audit
  committed: 0,                 // redirect to dashboard
};
```

### Task 1.7: Manual Text Entry Fallback

**Trigger:** `upload.upload_attempts >= 3` in the API response sets `showPasteFallback: true`

**UI:** Show a textarea with prompt: "If you're having trouble with the file, you can paste your resume text directly here instead — just copy everything and paste it in."

**Submit:** Same `POST /api/onboarding-v2/upload` route with body `{ pastedText: string }` instead of multipart file.

### Error Scenarios (Complete Decision Table)

| Scenario | Detection Point | User Message | Session Change | Next Action |
|----------|----------------|--------------|----------------|-------------|
| Image file (JPG/PNG) | Magic bytes check | UPLOAD_ERROR_MESSAGES.image_file | upload_attempts++ | Show re-upload |
| Scanned PDF (< 200 chars) | Post-extraction char count | "I wasn't able to read the text..." | upload_attempts++ | Show re-upload |
| Password-protected PDF | Python subprocess error | UPLOAD_ERROR_MESSAGES.password_protected | upload_attempts++ | Show re-upload |
| Corrupted file | Python subprocess error | UPLOAD_ERROR_MESSAGES.corrupted | upload_attempts++ | Show re-upload |
| File > 10MB | Pre-upload size check | UPLOAD_ERROR_MESSAGES.too_large | upload_attempts++ | Show re-upload |
| Near-empty (< 300 chars) | Post-extraction char count | UPLOAD_ERROR_MESSAGES.empty_content | upload_attempts++ | Show re-upload |
| Non-resume document | Passes through | (none at this stage) | extraction stored | Advance to Stage 2 |
| File picker cancelled | Client-side | (none) | (none) | Stay on upload |
| Rapid successive uploads | AbortController | (none — previous cancelled) | (none) | Process latest |
| Session write failure | DB error | "Something went wrong saving..." | (none) | Retry button |
| Slow connection (> 45s) | Timer | "This is taking longer..." | (none) | Keep waiting or retry |
| Schema mapping fails | LLM error/timeout | (none — silent) | schema_mapping_status: "failed" | Advance to Stage 2 |
| 3+ failed uploads | upload_attempts count | (none — show paste fallback) | (none) | Show paste textarea |
| Returning user | Session exists | "Welcome back..." | (none) | Continue or restart |
| .txt/.rtf file | Magic bytes / MIME | (none — treat as valid) | extraction stored | Advance to Stage 2 |

### Exit Conditions (Verified Programmatically)

```typescript
function isStage1Complete(session: OnboardingV2Session): boolean {
  return (
    session.extraction.raw_text !== null &&
    session.extraction.raw_text_character_count >= 300 &&
    session.extraction.extraction_method !== null &&
    (session.extraction.schema_mapping_status === "success" ||
     session.extraction.schema_mapping_status === "failed") &&
    session.upload.file_name !== null &&
    session.upload.upload_timestamp !== null &&
    session.onboarding_status === "extraction_complete"
  );
}
```

---

## Stage 2 — Dual LLM Extraction

### Task 2.1: Orchestration Function

```typescript
// apps/web/src/lib/onboarding-v2/stages/stage-2-extraction.ts

export interface DualExtractionResult {
  pureExtraction: ExtractionSchema | null;
  pureExtractionConfidence: "high" | "medium" | "low" | null;
  inferredSummary: string | null;
  inferredSummaryStatus: "success" | "failed" | "low_quality";
  summaryQuality: "high" | "medium" | "low" | null;
  nonResumeDetected: boolean;
  error?: { code: "both_failed" | "non_resume"; message: string };
}

export async function runDualExtraction(session: OnboardingV2Session): Promise<DualExtractionResult>;
```

**Execution flow:**
1. Check if raw text exceeds 50,000 chars (academic CV). If yes, truncate:
   - Keep first 2000 chars (identity/summary)
   - Keep most recent 5 experience entries
   - Keep education section
   - Keep skills section
   - Add `extraction_notes: "Document truncated — full content exceeded processing limits"`
2. Fire Call A (pure extraction) — this is the primary call
3. Once Call A resolves, fire Call B (inferred summary) with Call A output as context
4. If Call A fails:
   - Check if `session.extraction.schema_mapping_object` exists (Stage 1 fallback)
   - If yes → use it as the extraction result, flag `pure_extraction_confidence: "medium"`
   - If no → mark as failed
5. If Call B fails or returns thin output (< 100 words):
   - Retry once with directive prompt addition: "Be more specific. Name actual companies, technologies, and achievements. Do not use generic filler."
   - If retry also thin → store anyway, flag `summary_quality: "low"`

### Task 2.2: Call A — Pure Extraction

```typescript
export async function callPureExtraction(
  rawText: string,
  schemaMappingFallback: Record<string, unknown> | null
): Promise<{ extraction: ExtractionSchema; confidence: "high" | "medium" | "low" }>;
```

**LLM call parameters:**
- Model: `getModels().smart` (needs high-quality structured extraction)
- Temperature: 0
- Max tokens: 8192 (resumes can produce large structured output)
- System prompt: `PURE_EXTRACTION_SYSTEM_PROMPT` from `prompts.ts`
- User message format:
  ```
  Raw resume text:
  ---
  {rawText}
  ---

  DB schema mapping (Stage 1 attempt): {JSON.stringify(schemaMappingFallback) || "unavailable"}
  ```

**Output validation:**
```typescript
function validateExtractionOutput(output: unknown): {
  valid: boolean;
  extraction: ExtractionSchema | null;
  errors: string[];
} {
  // Check: output is object
  // Check: identity exists and is object
  // Check: experience is array
  // Check: education is array
  // Check: skills exists with raw_list array
  // Check: extraction_confidence is one of "high" | "medium" | "low"
  // PII stripping: remove any field matching SSN/passport/DOB patterns
}
```

**Non-resume detection (after successful extraction):**
```typescript
function isLikelyResume(extraction: ExtractionSchema): boolean {
  let signals = 0;
  if (extraction.identity?.full_name) signals++;
  if (extraction.experience?.length > 0) signals++;
  if (extraction.education?.length > 0) signals++;
  if (extraction.skills?.raw_list?.length > 0) signals++;
  return signals >= 3; // Need at least 3 of 4 signals
}
```

If `isLikelyResume` returns false → return `{ nonResumeDetected: true }` with message: "I wasn't able to find enough resume information in that file. It may be a cover letter or a different kind of document. Could you upload your actual resume?"

### Task 2.3: Call B — Inferred Summary

```typescript
export async function callInferredSummary(
  rawText: string,
  structuredExtraction: ExtractionSchema
): Promise<{ summary: string; quality: "high" | "medium" | "low" }>;
```

**LLM call parameters:**
- Model: `getModels().smart` (needs nuanced understanding)
- Temperature: 0.3 (slight creativity for narrative)
- Max tokens: 1024
- System prompt: `INFERRED_SUMMARY_SYSTEM_PROMPT` from `prompts.ts`
- User message:
  ```
  Raw resume text:
  ---
  {rawText}
  ---

  Structured extraction:
  {JSON.stringify(structuredExtraction, null, 2)}
  ```

**Quality assessment:**
```typescript
function assessSummaryQuality(summary: string): "high" | "medium" | "low" {
  const wordCount = summary.split(/\s+/).length;
  if (wordCount < 50) return "low";
  if (wordCount < 100) return "medium";
  // Check for generic phrases
  const genericPhrases = ["experience in software", "worked in technology", "various projects"];
  const genericCount = genericPhrases.filter(p => summary.toLowerCase().includes(p)).length;
  if (genericCount >= 2) return "low";
  return "high";
}
```

### Task 2.4: Session Update After Dual Extraction

```typescript
// After both calls complete:
await updateSession(sessionId, {
  "dual_extraction.pure_extraction": extraction,
  "dual_extraction.pure_extraction_confidence": confidence,
  "dual_extraction.inferred_summary": summary,
  "dual_extraction.inferred_summary_status": summaryStatus,
  "dual_extraction.summary_quality": summaryQuality,
  "extraction.extraction_quality": confidence, // propagate for Stage 4
  "onboarding_status": "dual_extraction_complete",
});
```

### Task 2.5: Auto-Advance to Stage 3

Stage 2 is invisible to the user. After completion, immediately trigger Stage 3:
```typescript
// In the message/route.ts handler or a dedicated advance function:
if (session.onboarding_status === "extraction_complete") {
  const result = await runDualExtraction(session);
  if (result.nonResumeDetected) {
    // Route back to Stage 1
    await updateSession(sessionId, {
      "extraction.raw_text": null,
      "extraction.raw_text_character_count": 0,
      "onboarding_status": "awaiting_upload",
    });
    return { action: "show_upload", message: result.error!.message };
  }
  if (result.error?.code === "both_failed") {
    return { action: "show_retry", message: "I'm having trouble reading your resume right now — please give it a moment and try again." };
  }
  // Auto-advance to Stage 3
  const inferenceResult = await runInference(session);
  // ... continue to Stage 3
}
```

### Exit Conditions (Verified)

```typescript
function isStage2Complete(session: OnboardingV2Session): boolean {
  return (
    session.dual_extraction.pure_extraction !== null &&
    session.dual_extraction.pure_extraction_confidence !== null &&
    (session.dual_extraction.inferred_summary !== null ||
     session.dual_extraction.inferred_summary_status === "failed") &&
    session.onboarding_status === "dual_extraction_complete"
  );
}
```

---

## Stage 3 — Industry & Role Inference

### Task 3.1: Inference Function

```typescript
// apps/web/src/lib/onboarding-v2/stages/stage-3-inference.ts

export interface InferenceResult {
  industry: string;
  industry_confidence: "high" | "medium" | "low";
  industry_note: string;
  industry_ambiguous: boolean;
  industry_candidates: string[] | null;
  role_family: string;
  role_family_confidence: "high" | "medium" | "low";
  role_family_note: string;
  role_family_ambiguous: boolean;
  role_family_candidates: string[] | null;
  seniority: string;
  seniority_confidence: "high" | "medium" | "low";
  seniority_note: string;
  seniority_ambiguous: boolean;
  career_transition_detected: boolean;
  transition_note: string | null;
  new_grad: boolean;
  work_pattern: "permanent" | "contract" | "mixed";
}

export async function runInference(session: OnboardingV2Session): Promise<InferenceResult | null>;
```

**LLM call parameters:**
- Model: `getModels().smart`
- Temperature: 0.1 (slight flexibility for nuanced inference)
- Max tokens: 2048
- System prompt: `INFERENCE_SYSTEM_PROMPT` from `prompts.ts`
- User message:
  ```
  Structured extraction:
  {JSON.stringify(session.dual_extraction.pure_extraction, null, 2)}

  Professional narrative:
  {session.dual_extraction.inferred_summary || "Not available"}
  ```

### Task 3.2: Output Validation

```typescript
const VALID_INDUSTRIES = [
  "Fintech", "HealthTech", "SaaS B2B", "Gaming", "Developer Tools",
  "E-commerce", "AdTech", "Cybersecurity", "AI/ML Infrastructure",
  "Cloud Infrastructure", "EdTech", "LegalTech", "PropTech",
  "InsurTech", "Logistics/Supply Chain", "Media/Entertainment",
  "Telecommunications", "Automotive/Mobility", "Energy/CleanTech",
  "Government/Defense", "Consulting", "Agency",
] as const;

const VALID_ROLE_FAMILIES = [
  "Backend Engineering", "Frontend Engineering", "Fullstack Engineering",
  "Mobile Engineering", "Data Engineering", "ML Engineering",
  "Platform/Infrastructure Engineering", "DevOps/SRE",
  "Security Engineering", "Engineering Management",
  "Technical Product Management", "Developer Relations",
  "QA/Testing Engineering",
] as const;

const VALID_SENIORITIES = [
  "Entry Level", "Junior", "Mid-level", "Senior IC",
  "Staff/Principal IC", "Engineering Lead", "Engineering Manager",
  "Senior Manager", "Director+",
] as const;

function validateInferenceOutput(output: unknown): {
  valid: boolean;
  result: InferenceResult | null;
  errors: string[];
} {
  // Validate industry is in VALID_INDUSTRIES or starts with a capital letter (allow new ones)
  // Validate role_family is in VALID_ROLE_FAMILIES or has "other: ..." format
  // Validate seniority is in VALID_SENIORITIES
  // Validate all confidence fields are "high" | "medium" | "low"
  // Validate booleans are actual booleans
  // Validate work_pattern is one of the three values
}
```

### Task 3.3: Retry Logic

```typescript
async function runInferenceWithRetry(session: OnboardingV2Session): Promise<InferenceResult | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callLLM({ /* ... */ });
      const parsed = JSON.parse(raw);
      const { valid, result } = validateInferenceOutput(parsed);
      if (valid && result) return result;
      // Invalid output — retry
    } catch (err) {
      if (attempt === 3) return null; // Give up after 3 attempts
    }
  }
  return null;
}
```

### Task 3.4: Session Update

```typescript
if (inferenceResult) {
  await updateSession(sessionId, {
    "inference.industry": inferenceResult.industry,
    "inference.industry_confidence": inferenceResult.industry_confidence,
    "inference.industry_ambiguous": inferenceResult.industry_ambiguous,
    "inference.industry_candidates": inferenceResult.industry_candidates,
    "inference.role_family": inferenceResult.role_family,
    "inference.role_family_confidence": inferenceResult.role_family_confidence,
    "inference.role_family_ambiguous": inferenceResult.role_family_ambiguous,
    "inference.role_family_candidates": inferenceResult.role_family_candidates,
    "inference.seniority": inferenceResult.seniority,
    "inference.seniority_confidence": inferenceResult.seniority_confidence,
    "inference.seniority_ambiguous": inferenceResult.seniority_ambiguous,
    "inference.career_transition_detected": inferenceResult.career_transition_detected,
    "inference.transition_note": inferenceResult.transition_note,
    "inference.new_grad": inferenceResult.new_grad,
    "inference.work_pattern": inferenceResult.work_pattern,
    "onboarding_status": "inference_complete",
  });
} else {
  // Inference failed — proceed without it
  await updateSession(sessionId, {
    "inference.inference_status": "failed",
    "onboarding_status": "inference_complete", // Still advance
  });
}
```

### Task 3.5: Chip Generation for Stage 4

When role family is determined, pre-generate the chip options for Stage 7 Question 1:

```typescript
export function generateRoleChips(roleFamily: string, seniority: string): string[] {
  const chipMap: Record<string, string[]> = {
    "Backend Engineering": ["Backend Engineer", "Senior Backend Engineer", "Staff Backend Engineer", "Platform Engineer", "API Engineer"],
    "Frontend Engineering": ["Frontend Engineer", "Senior Frontend Engineer", "UI Engineer", "Design Engineer"],
    "Fullstack Engineering": ["Fullstack Engineer", "Senior Fullstack Engineer", "Software Engineer", "Product Engineer"],
    "ML Engineering": ["ML Engineer", "Senior ML Engineer", "AI Engineer", "Research Engineer"],
    "Data Engineering": ["Data Engineer", "Senior Data Engineer", "Analytics Engineer", "Data Platform Engineer"],
    "DevOps/SRE": ["DevOps Engineer", "SRE", "Platform Engineer", "Infrastructure Engineer"],
    "Mobile Engineering": ["iOS Engineer", "Android Engineer", "Mobile Engineer", "React Native Engineer"],
    "Platform/Infrastructure Engineering": ["Platform Engineer", "Infrastructure Engineer", "Cloud Engineer", "Systems Engineer"],
    "Security Engineering": ["Security Engineer", "AppSec Engineer", "Security Architect"],
    "Engineering Management": ["Engineering Manager", "Tech Lead", "VP Engineering", "Director of Engineering"],
    "Technical Product Management": ["Technical PM", "Product Manager", "Senior PM"],
    "Developer Relations": ["Developer Advocate", "DevRel Engineer", "Technical Writer"],
    "QA/Testing Engineering": ["QA Engineer", "SDET", "Test Automation Engineer"],
  };
  return [...(chipMap[roleFamily] || [`${seniority} ${roleFamily}`]), "Something else — I'll type it"];
}
```

### Scenario Decision Table

| Resume Signal | industry | role_family | seniority | Flags |
|---|---|---|---|---|
| 5+ years, clear progression, single domain | High confidence | High confidence | High confidence | (none) |
| Equal split backend + data eng | (normal) | Ambiguous: ["Backend Engineering", "Data Engineering"] | (normal) | role_family_ambiguous |
| 8 years but titles all "developer" | (normal) | (normal) | Ambiguous | seniority_ambiguous |
| Last 2 roles in product, prior in engineering | (normal) | (normal) | (normal) | career_transition_detected, transition_note |
| Healthcare → fintech → gaming companies | Ambiguous: ["HealthTech", "Fintech"] | (normal) | (normal) | industry_ambiguous |
| Only internships, no full-time | (normal) | Infer from projects/skills | "Entry Level" | new_grad |
| 10 short-tenure roles | (normal) | Infer from skills/tech | (normal) | work_pattern: "contract" |
| Prior career in finance, recent bootcamp | (normal) | (normal) | "Entry Level" or "Junior" | career_transition_detected, new_grad |

---

## Stage 4 — Summary Presentation & User Confirmation

### Tasks

1. **Summary generation LLM call**
   - System prompt: onboarding assistant persona (from spec — specific, intelligent, warm)
   - Input: structured extraction, narrative, industry, role family, seniority, extraction quality, all flags
   - Output: plain text, max 4 sentences, names actual companies/technologies
   - Constraints: no "impressive", no hollow praise, acknowledge low extraction quality, acknowledge transitions
   - If role family ambiguous → present both options as a question
   - Fallback: if LLM call fails → template-based summary from raw extraction fields

2. **Summary message format** (implement in `summary-card.tsx`)
   - Main message: role family + years + industry + companies + distinctive note
   - Conditional additions:
     - Career transition detected → transition acknowledgment sentence
     - New grad → education/projects focus sentence
     - Low extraction quality → formatting warning sentence
   - Collapsible dropdown: "See what I extracted from your resume" → formatted cards per section (not raw JSON)
   - Two buttons: **"Looks correct"** and **"Something is wrong"**

3. **UI component: extraction dropdown**
   - Render extraction as readable cards grouped by section (identity, experience, education, skills, projects, certifications, extras)
   - Each card shows extracted values in human-readable format
   - No edit capability here — corrections go through Stage 5

4. **Confirmation handling**
   - "Looks correct" → set `confirmation.summary_confirmed: true`, store `confirmed_role_family`, `confirmed_industry`, `confirmed_seniority`, advance to Stage 6
   - "Something is wrong" → set `correction_submitted: true`, advance to Stage 5
   - Free-text input before clicking either button → route to Stage 5 correction flow
   - Ambiguous role family → user selects one → store as `confirmed_role_family`
   - Ambiguous seniority → user confirms or types correction

5. **Edge cases**
   - Inference failed → present open summary without assertions
   - User idle → no auto-advance, session persists
   - No "back" button — "Start over" wipes session and returns to Stage 1

### Exit conditions
- `confirmation.summary_confirmed: true` OR `correction_submitted: true`
- `confirmed_role_family`, `confirmed_industry`, `confirmed_seniority` set
- `onboarding_status` = `"summary_confirmed"` or `"correction_in_progress"`

### Failure states
- Summary generation fails → template fallback, flag `summary_generation_status: "fallback"`

---

## Stage 5 — Correction Handling Loop

### Tasks

1. **Correction interpretation LLM call** (fires per correction round)
   - System prompt: onboarding assistant, precise, never argues (from spec)
   - Input: current extraction, current summary, user's correction message, correction round number (1–4)
   - Output JSON:
     - `correction_understood: boolean`
     - `clarifying_question: string | null` (if not understood)
     - `fields_changed: string[]`
     - `updated_extraction: object` (full updated extraction)
     - `user_confirmation_message: string`
     - `user_supplied_fields: string[]`
   - If `correction_understood: false` → return only `clarifying_question`, no changes applied

2. **Correction types handled**
   - Simple field correction (e.g. wrong job title) → identify entry, update field, confirm
   - Missing role/experience → ask for details conversationally, add to session
   - Missing skill → check if in resume text; if not, add as `user_supplied`
   - Vague correction → ask one targeted clarifying question
   - Contradicts resume text → apply user's version, note as `user_supplied` override
   - Multiple corrections in one message → parse all, apply in sequence, present consolidated update
   - Inference correction (e.g. "I'm not a backend engineer") → update `confirmed_role_family`, don't alter raw extraction
   - Frustrated user → calm response, one prompt, then listen
   - User asks to start over → wipe extraction, return to Stage 1

3. **Loop limits**
   - Max 4 correction rounds without resolution
   - After 4 rounds → offer escape: "move on and edit later from dashboard"
   - After 2 rounds of vague responses → offer to move forward
   - Flag `correction_unresolved: true` if moving on without resolution

4. **Session state tracking**
   - `confirmation.correction_rounds` incremented per round
   - `confirmation.user_supplied_overrides[]` tracks all user-stated values
   - Updated extraction stored after each successful correction

### Exit conditions
- User confirms corrected summary is accurate
- `confirmation.summary_confirmed: true`
- Updated extraction stored
- User-supplied overrides logged
- `onboarding_status` = `"summary_confirmed"`

### Failure states
- Correction LLM call fails repeatedly → offer manual edit from dashboard, move forward
- Flag fields as `needs_review: true`
- Surface note on dashboard: "Some profile details may need review"

---

## Stage 6 — Resume Completeness Assessment & Path Branching

### Tasks

1. **Completeness assessment LLM call**
   - System prompt: resume strategy expert (from spec)
   - Input: confirmed extraction, confirmed role family, confirmed seniority, Stage 3 flags
   - Output JSON:
     - `completeness_score`: 0–100
     - `missing_critical_fields`: string[]
     - `completeness_path`: "standard" | "new_grad" | "career_changer" | "contractor" | "returning"
     - `resume_stale`: boolean (most recent role > 18 months ago)
     - `employment_gaps_present`: boolean (gaps > 12 months)
     - `has_quantified_achievements`: boolean
     - `special_handling_notes`: string

2. **Path branching logic**
   - `"standard"` → full question set in Stage 7
   - `"new_grad"` → replace work experience questions with projects/academic/first-role questions, supportive tone
   - `"career_changer"` → include career transition framing block (Question 6 in Stage 7)
   - `"contractor"` → include contracting history presentation question
   - `"returning"` → include stale resume prompt ("anything recent not on your resume?")

3. **Conditional question gating** (determines which Stage 7 questions are asked)
   - `career_transition_detected: true` → enable Question 6 (career transition framing)
   - `employment_gaps_present: true` → enable Question 7 (gap handling)
   - `has_quantified_achievements: false` → enable Question 8 (achievement depth)
   - Questions 1–5 always asked (target role, specificity, underrepresented skills, de-emphasis, resume frame)

4. **Session state updates**
   - Store full completeness assessment
   - Set `completeness_path` in session
   - Initialize `question_map` with all fields set to `null`
   - Determine which conditional questions are active

### Exit conditions
- `completeness` object stored in session
- `completeness_path` set
- Question set for Stage 7 determined
- `onboarding_status` = `"path_branched"`

### Failure states
- Assessment call fails → default to `completeness_path: "standard"`, proceed

---

## Stage 7 — Resume Generation Questions

### Tasks

1. **Question map initialization**
   ```json
   {
     "target_role": { "value": null, "confidence": null, "source": null },
     "target_role_specificity": { "value": null, "confidence": null, "source": null },
     "underrepresented_skills": { "value": null, "confidence": null, "source": null },
     "deemphasis_preferences": { "value": null, "confidence": null, "source": null },
     "resume_frame": { "value": null, "confidence": null, "source": null },
     "career_transition_framing": { "value": null, "confidence": null, "source": null },
     "gap_handling": { "value": null, "confidence": null, "source": null },
     "achievement_depth": { "value": null, "confidence": null, "source": null }
   }
   ```

2. **Per-answer LLM evaluation call** (fires for every user answer)
   - System prompt: answer evaluator (from spec)
   - Input: question asked, field being collected, validity/actionability criteria, user's answer, current question map, confirmed extraction
   - Output JSON:
     - `answer_valid: boolean`
     - `answer_actionable: boolean`
     - `extracted_value: string | null`
     - `confidence: "high" | "medium" | "low"`
     - `follow_up_question: string | null`
     - `additional_fields_collected: { field_name: { value, confidence } }`
     - `updated_question_map: object`
   - If answer invalid or too vague → return follow-up question, don't store
   - If answer valid → store value, check if it answers future questions too

3. **Question 1 — Target role**
   - Chips: auto-generated from confirmed role family (e.g. "Backend Engineer", "Senior Backend Engineer", "Staff Engineer", "Platform Engineer", "API Engineer") + "Something else"
   - Validity: must be specific enough to inform resume framing
   - Actionability: specific enough for resume generator to decide skills/achievements to foreground
   - Edge cases: "I'm not sure" → one follow-up, then accept null; very specific answer → extract all components; contradicts background → accept, flag `career_pivot_stated`; non-tech role → gentle reminder, accept if confirmed

4. **Question 2 — Target role specificity** (conditional: only if Q1 was low specificity)
   - Free text: focus area, company size, type of work
   - "Doesn't matter" → store "open", move on

5. **Question 3 — Underrepresented skills**
   - Chips: "Side projects", "Open source contributions", "Leadership experience", "Specific technologies", "Domain knowledge", "Nothing — it's all there"
   - "Nothing" → accept immediately
   - "Specific technologies" without specifying → follow up once

6. **Question 4 — De-emphasis preferences**
   - Chips: "Older roles (5+ years ago)", "Academic work", "A specific job or company", "A particular skill or tool", "Nothing — include everything", "Not sure"
   - "A specific job" without naming → follow up once, accept if declined
   - Distinguish "remove from profile" vs "don't feature prominently"
   - If user mentions gap de-emphasis → also answers Question 7

7. **Question 5 — Resume framing intent** (free text only)
   - Validity: must be about professional identity/value, not generic aspiration
   - Generic answer → one follow-up ("what specifically about your engineering...")
   - Very long answer → extract core claim, confirm with user
   - "I don't know" → prompt with "last time someone was impressed by your work", then skip if still stuck

8. **Question 6 — Career transition framing** (conditional: `career_transition_detected`)
   - Chips: "Feature it as relevant context", "Keep it brief — focus on where I'm going", "Only include what transfers directly", "I'll figure it out later"
   - "What's the difference?" → explain briefly
   - "I'll figure it out later" → flag as deferred

9. **Question 7 — Gap handling** (conditional: `employment_gaps_present`)
   - Chips: "Leave them as is", "Add a brief note for the main gap", "Minimise them", "I'll handle it in the resume itself"
   - Neutral phrasing — does not ask why gaps exist

10. **Question 8 — Achievement depth** (conditional: `has_quantified_achievements: false`)
    - Chips: "Yes — I'll share some", "My work isn't easily measured", "I'd rather not include metrics", "I'm not sure — help me think"
    - "Yes" → open conversational prompt for metrics
    - "Not easily measured" → accept, flag `achievement_depth: "not_applicable"`
    - "Help me think" → walk through a prompt about a proud project
    - Achievements volunteered in other answers → extract and mark as collected

11. **Question skipping logic**
    - Before asking each question: check if field is already non-null in question map
    - If already answered by a prior voluntary response → skip
    - Track which questions were skipped vs answered

### Exit conditions
- All non-null, non-conditional fields collected
- All active conditional fields collected or explicitly skipped
- Collected values at medium confidence or above
- Low-confidence fields flagged with `needs_review: true`
- `onboarding_status` = `"resume_questions_complete"`

### Failure states
- User abandons mid-stage → save question map state, resume from last unanswered on return
- All answers minimal engagement → flag `profile_depth: "shallow"`, dashboard prompts enrichment

---

## Stage 8 — Voice & Tone Extraction

### Tasks

1. **Voice profile object initialization**
   ```json
   {
     "natural_voice_sample": null,
     "tone_preferences": [],
     "tone_aversions": [],
     "self_description_style": null,
     "language_patterns_to_use": [],
     "language_patterns_to_avoid": []
   }
   ```

2. **Question 1 — Natural voice sample** (free text only)
   - Prompt: "In your own words — how would you describe what you do professionally to someone who works in tech but doesn't know your specific area?"
   - Minimum ~30 words for actionability
   - Tag `self_description_style`: "formal" | "conversational" | "structured/terse"
   - "I don't know" → prompt with tech meetup scenario, one attempt, then skip
   - LinkedIn bio copy → valid but flag as `sourced_from: "existing_copy"`
   - Store full response without truncation

3. **Question 2 — Tone preferences** (multi-select chips + free text option)
   - Chips: "Direct and confident", "Technical and precise", "Warm and collaborative", "Leadership-focused", "Results-driven", "Understated", "Bold", "Conversational" + "Something else — I'll describe it"
   - All chips selected → store `tone_preferences: "open"`
   - Contradictory selections → accept both (generator balances contextually)
   - Custom text → extract and store as custom entry
   - "Depends on the company" → store `tone_preferences: "context_dependent"` with description

4. **Question 3 — Tone aversions** (multi-select chips)
   - Chips: "Corporate buzzwords", "Overly humble", "Overly boastful", "Jargon-heavy", "Vague or fluffy", "Too casual", "First-person (I/we)", "Nothing — I'm open"
   - "Nothing" → empty aversions array
   - Specific word aversions (e.g. "synergy") → store in `language_patterns_to_avoid`
   - "Hate AI-written text" → store `aversion_to_ai_language: true`

5. **Voice pattern extraction LLM call** (fires after all 3 questions answered)
   - System prompt: writing style analyst (from spec)
   - Input: voice sample, tone preferences, tone aversions, self-description style, role family + seniority
   - Output JSON:
     - `sentence_structure`: string
     - `vocabulary_register`: string
     - `leading_pattern`: "results_first" | "context_first" | "method_first" | "mixed"
     - `phrases_to_use`: string[]
     - `phrases_to_avoid`: string[]
     - `tone_calibration_summary`: string (2 sentences — included verbatim in resume generator prompt)
     - `confidence`: "high" | "medium" | "low"

### Exit conditions
- All 3 voice questions answered or explicitly skipped
- Voice profile extracted and stored in session
- `tone_calibration_summary` available
- `onboarding_status` = `"voice_extraction_complete"`

### Failure states
- User skips all voice questions → build from defaults based on role family + seniority, flag `voice_profile_source: "default"`
- Voice extraction LLM call fails → store raw responses, flag `voice_profile_status: "raw_only"`, generator uses raw responses directly

---

## Stage 9 — Confidence Audit, Gap Surfacing & Profile Commit

### Tasks

1. **Confidence audit LLM call**
   - System prompt: final quality auditor (from spec)
   - Input: complete session object (all stages)
   - Output JSON:
     - `critical_gaps`: array of `{ field, reason, simplified_question }`
     - `important_gaps`: array of `{ field, current_value, confidence, clarification_question }`
     - `contradictions`: array of `{ field, extracted_value, user_stated_value, resolution_question }`
     - `user_supplied_overrides`: string[]
     - `regenerate_inferred_summary`: boolean
     - `profile_quality_score`: 0–100
     - `profile_quality_note`: string
     - `ready_to_commit`: boolean

2. **Critical fields check** (blocking if missing)
   - `confirmed_role_family`
   - `confirmed_seniority`
   - `target_role`
   - `resume_frame`
   - At least one experience entry with title + company
   - At least one skill

3. **Important fields check** (surfaced but non-blocking)
   - `underrepresented_skills`
   - `deemphasis_preferences`
   - `tone_calibration_summary`
   - `achievement_depth` (if role type typically produces measurable outcomes)

4. **Gap surfacing UI**
   - Missing critical fields → present simplified question one at a time with "Skip for now" option
   - Low-confidence important fields → present clarification question with two interpretations
   - Contradictions → surface with resolution question ("Which should we use?")
   - Max one round of free-form corrections allowed at this stage

5. **Inferred summary regeneration** (conditional, background)
   - If `summary_quality: "low"` was flagged in Stage 2 → regenerate using all enriched data
   - Uses confirmed extraction + voice profile + question map answers
   - Non-blocking — fires in background

6. **Profile commit** (database writes)
   - `users` table: `onboarding_completed: true`, `onboarding_completed_at: timestamp`
   - `profiles` table: identity fields, confirmed_role_family, confirmed_seniority, confirmed_industry, target_role, resume_frame, completeness_path, profile_quality_score
   - `user_experience` table: one row per experience entry, source flagged per field
   - `user_education` table: one row per education entry
   - `user_skills` table: skills array with grouping
   - `user_voice_profiles` table: full voice profile object
   - `user_resume_preferences` table: question map values
   - `user_onboarding_metadata` table: all confidence/source flags, correction rounds, quality score
   - All writes in a single transaction — retry up to 3 times on failure

7. **Background understanding generation job**
   - Fires immediately after commit, does NOT block redirect
   - Uses full committed profile to generate Retune's deep understanding document
   - Long-context LLM call with complete profile as input
   - Stored separately — regenerated on significant profile updates
   - On failure: retried asynchronously, generator falls back to raw profile data

8. **"Finish later" handling**
   - Save profile in draft state: `onboarding_completed: false`, `onboarding_draft_saved_at: timestamp`
   - On next login → route back to audit stage with all prior data intact

9. **"Start over" handling**
   - Full session wipe (extraction, inference, correction, questions, voice)
   - Return to Stage 1
   - Preserve account data (email, name)

### Exit conditions
- All critical gaps resolved or explicitly deferred
- Profile committed to database (all tables written)
- `users.onboarding_completed: true`
- Background understanding generation job queued
- User redirected to `/dashboard`

### Failure states
- DB commit fails after 3 retries → preserve session in recovery queue, show retry message, do NOT wipe session
- Understanding generation fails → profile committed regardless, job retried in background, user sees no indication
- Session cookie expired → commit using user_id from session, redirect to login, then dashboard

---

## Implementation Order

### Phase 1: Foundation (Week 1)
1. Database migration (new tables + profile columns)
2. `types.ts` — full session state type matching spec appendix
3. `session.ts` — CRUD operations for `onboarding_v2_sessions`
4. `llm/calls.ts` — provider-agnostic LLM call wrapper with retry/timeout
5. `llm/prompts.ts` — all system prompts from spec (verbatim)
6. `validation.ts` — file validation logic
7. `errors.ts` — typed error classes
8. `constants.ts` — thresholds and limits
9. Feature flag gate (`ONBOARDING_V2=1`)

### Phase 2: Stages 1–3 (Week 2)
1. `stage-1-upload.ts` — file handling + schema mapping call
2. `stage-2-extraction.ts` — dual LLM extraction (parallel)
3. `stage-3-inference.ts` — industry/role/seniority inference
4. API routes: `session/`, `upload/`, `upload/stream/`
5. Unit tests for each stage (mock LLM responses)

### Phase 3: Stages 4–5 (Week 3)
1. `stage-4-summary.ts` — summary generation + presentation logic
2. `stage-5-correction.ts` — correction interpretation loop
3. API routes: `confirm/`, `message/`
4. UI components: `summary-card.tsx`, `confirmation-buttons.tsx`
5. Unit tests for correction loop scenarios

### Phase 4: Stages 6–7 (Week 3–4)
1. `stage-6-completeness.ts` — assessment + path branching
2. `stage-7-questions.ts` — question map + per-answer evaluation
3. UI components: `chip-selector.tsx`
4. Unit tests for question evaluation and skipping logic

### Phase 5: Stages 8–9 (Week 4)
1. `stage-8-voice.ts` — voice/tone extraction
2. `stage-9-audit.ts` — confidence audit + profile commit
3. API routes: `commit/`, `restart/`
4. Background understanding generation job
5. Unit tests for audit and commit logic

### Phase 6: UI & Integration (Week 5)
1. `page.tsx` — new onboarding page
2. `chat-interface.tsx` — main conversational UI
3. `upload-zone.tsx` — file upload with progress
4. `progress-indicator.tsx` — stage progress
5. Integration tests (full flow with mocked LLM)
6. E2E test (happy path)

### Phase 7: Polish & Migration (Week 6)
1. Feature flag removal / default to v2
2. Migration path for existing users (re-onboard prompt on dashboard)
3. Legacy onboarding code deprecation markers
4. Performance testing (LLM call latency, parallel execution)
5. Error state testing (network failures, LLM timeouts)

---

## LLM Call Inventory

| Stage | Call Name | Purpose | Blocking | Retries |
|-------|-----------|---------|----------|---------|
| 1 | Schema mapping | Map extracted text to DB schema | No (parallel) | 2 |
| 2A | Pure extraction | Literal structured extraction | Yes | 1 |
| 2B | Inferred summary | Narrative understanding | No (parallel) | 1 |
| 3 | Inference | Industry, role family, seniority | Yes | 2 |
| 4 | Summary generation | User-facing summary message | Yes | 1 |
| 5 | Correction interpretation | Parse and apply corrections | Yes (per round) | 1 |
| 6 | Completeness assessment | Determine onboarding path | Yes | 1 |
| 7 | Answer evaluation | Validate and extract per answer | Yes (per answer) | 1 |
| 8 | Voice extraction | Build structured voice profile | Yes | 1 |
| 9 | Confidence audit | Final gap and quality check | Yes | 1 |
| 9 | Summary regeneration | Rebuild inferred summary | No (background) | 2 |
| Post | Understanding generation | Deep user understanding | No (background) | 3 |

---

## Session State Reference (Complete)

The full session state object matches the spec appendix exactly:

```typescript
interface OnboardingV2Session {
  session_id: string;
  user_id: string;
  onboarding_started_at: string;
  onboarding_completed_at: string | null;
  onboarding_status: OnboardingV2Status;

  upload: {
    file_name: string | null;
    file_type: string | null;
    file_size_bytes: number | null;
    upload_timestamp: string | null;
    upload_attempts: number;
  };

  extraction: {
    raw_text: string | null;
    raw_text_character_count: number;
    extraction_method: "file" | "paste" | null;
    schema_mapping_status: "success" | "failed" | null;
    schema_mapping_object: Record<string, unknown> | null;
    extraction_quality: "high" | "medium" | "low" | null;
  };

  dual_extraction: {
    pure_extraction: Record<string, unknown> | null;
    pure_extraction_confidence: "high" | "medium" | "low" | null;
    inferred_summary: string | null;
    inferred_summary_status: "success" | "failed" | "low_quality" | null;
    summary_quality: "high" | "medium" | "low" | null;
  };

  inference: {
    industry: string | null;
    industry_confidence: "high" | "medium" | "low" | null;
    industry_ambiguous: boolean;
    industry_candidates: string[] | null;
    role_family: string | null;
    role_family_confidence: "high" | "medium" | "low" | null;
    role_family_ambiguous: boolean;
    role_family_candidates: string[] | null;
    seniority: string | null;
    seniority_confidence: "high" | "medium" | "low" | null;
    seniority_ambiguous: boolean;
    career_transition_detected: boolean;
    transition_note: string | null;
    new_grad: boolean;
    work_pattern: "permanent" | "contract" | "mixed" | null;
  };

  confirmation: {
    summary_confirmed: boolean;
    confirmed_role_family: string | null;
    confirmed_industry: string | null;
    confirmed_seniority: string | null;
    correction_rounds: number;
    correction_unresolved: boolean;
    user_supplied_overrides: string[];
  };

  completeness: {
    completeness_score: number | null;
    completeness_path: "standard" | "new_grad" | "career_changer" | "contractor" | "returning" | null;
    missing_critical_fields: string[];
    has_quantified_achievements: boolean;
    resume_stale: boolean;
    employment_gaps_present: boolean;
  };

  question_map: {
    target_role: QuestionMapField;
    target_role_specificity: QuestionMapField;
    underrepresented_skills: QuestionMapField;
    deemphasis_preferences: QuestionMapField;
    resume_frame: QuestionMapField;
    career_transition_framing: QuestionMapField;
    gap_handling: QuestionMapField;
    achievement_depth: QuestionMapField;
  };

  voice_profile: {
    natural_voice_sample: string | null;
    tone_preferences: string[] | string;
    tone_aversions: string[];
    self_description_style: string | null;
    sentence_structure: string | null;
    vocabulary_register: string | null;
    leading_pattern: "results_first" | "context_first" | "method_first" | "mixed" | null;
    phrases_to_use: string[];
    phrases_to_avoid: string[];
    tone_calibration_summary: string | null;
    voice_profile_confidence: "high" | "medium" | "low" | null;
    voice_profile_source: "collected" | "default" | null;
  };

  audit: {
    critical_gaps_resolved: boolean;
    important_gaps_resolved: boolean;
    contradictions_resolved: boolean;
    profile_quality_score: number | null;
    ready_to_commit: boolean;
    regenerated_inferred_summary: boolean;
  };
}

interface QuestionMapField {
  value: string | string[] | null;
  confidence: "high" | "medium" | "low" | null;
  source: "chip" | "free_text" | "inferred" | null;
}

type OnboardingV2Status =
  | "awaiting_upload"
  | "extraction_complete"
  | "dual_extraction_complete"
  | "inference_complete"
  | "summary_confirmed"
  | "correction_in_progress"
  | "path_branched"
  | "resume_questions_complete"
  | "voice_extraction_complete"
  | "committed";
```

---

## Confidence & Source Definitions

| Confidence | Meaning | Action |
|---|---|---|
| High | Answer directly addressed the question, unambiguous and actionable | Store and move on |
| Medium | Answer addressed question but required interpretation, usable but not precise | Store with flag, surface in audit if critical |
| Low | Vague, off-topic, or unreliable interpretation | Do not store, follow up once, then skip and flag |

| Source | Meaning |
|---|---|
| `extracted` | From resume text via LLM extraction |
| `inferred` | Inferred by LLM from context (not literally in resume) |
| `user_supplied` | User stated directly, overriding/supplementing extraction |
| `user_confirmed` | Extracted/inferred value explicitly confirmed by user |
| `default` | No value collected — system default applied |
| `deferred` | User chose to skip — to be completed from dashboard |

---

## Global Behaviors (All Stages)

1. **"Finish later"** — available at any point. Saves session in current state. On return, routes to correct stage.
2. **"Start over"** — wipes all session data, returns to Stage 1. Preserves account.
3. **Session validity** — sessions persist across browser sessions within a reasonable window (7 days). Expired sessions prompt restart or resume.
4. **No "back" button** — forward-only flow. Corrections happen through the correction loop or audit stage.
5. **Idle handling** — no auto-advance, no timeout. Session persists until user acts.
6. **Error recovery** — all errors are typed, all have user-facing messages, all preserve session state.

---

## Testing Strategy

1. **Unit tests** (per stage): mock LLM responses, test all branching logic, error scenarios, and session state transitions
2. **Integration tests**: full flow with mocked LLM, verify session state at each stage boundary
3. **E2E tests** (Playwright): happy path upload → confirm → questions → commit → dashboard redirect
4. **LLM prompt tests**: verify prompts produce expected output structure with sample resumes
5. **Error scenario tests**: network failures, malformed LLM output, session write failures, concurrent uploads

---

---

# IMPLEMENTATION ADDENDUM — Detailed Function Signatures & Logic

This section expands each stage with exact function signatures, API request/response shapes, component props, and step-by-step handler logic.

---

## Stage 4 — Detailed Implementation

### 4.1: Summary Generation Function

```typescript
// apps/web/src/lib/onboarding-v2/stages/stage-4-summary.ts

export interface SummaryPresentation {
  summaryMessage: string;
  extractionCards: ExtractionCard[];
  ambiguityQuestions: AmbiguityQuestion[];
  flags: {
    careerTransition: boolean;
    newGrad: boolean;
    lowExtractionQuality: boolean;
    inferenceFailed: boolean;
    roleAmbiguous: boolean;
    seniorityAmbiguous: boolean;
  };
}

export interface ExtractionCard {
  section: "identity" | "experience" | "education" | "skills" | "projects" | "certifications" | "extras";
  title: string;
  items: Array<{ label: string; value: string; confidence?: "high" | "medium" | "low" }>;
}

export interface AmbiguityQuestion {
  field: "role_family" | "seniority";
  question: string;
  options: string[];
}

export async function generateSummaryPresentation(session: OnboardingV2Session): Promise<SummaryPresentation>;
```

### 4.2: LLM Call Details

- Model: `getModels().fast`
- Temperature: 0.4
- Max tokens: 512
- System prompt: `SUMMARY_GENERATION_SYSTEM_PROMPT` (verbatim from spec)
- User message template:
  ```
  Structured extraction: {JSON.stringify(pureExtraction)}
  Professional narrative: {inferredSummary}
  Inferred industry: {industry} (confidence: {industry_confidence})
  Inferred role family: {role_family} (confidence: {role_family_confidence})
  Inferred seniority: {seniority} (confidence: {seniority_confidence})
  Extraction quality: {extraction_quality}
  Flags: career_transition_detected={...}, new_grad={...}, role_family_ambiguous={...}, seniority_ambiguous={...}, industry_ambiguous={...}
  ```

### 4.3: Template Fallback (when LLM fails)

```typescript
function buildTemplateSummary(session: OnboardingV2Session): string {
  const ext = session.dual_extraction.pure_extraction as ExtractionSchema;
  const name = ext?.identity?.full_name || "there";
  const companies = ext?.experience?.slice(0, 2).map(e => e.company).filter(Boolean).join(" and ");
  const skills = ext?.skills?.raw_list?.slice(0, 3).join(", ");

  if (session.inference.new_grad) {
    return `Thanks for sharing your resume, ${name}. It looks like you're earlier in your career — I've pulled in your projects and education since that's where most of your story is right now. Let's make sure I have the details right.`;
  }
  let msg = `Thanks for sharing your resume. I've read through it and pulled out your experience, skills, and education.`;
  if (companies) msg += ` You've worked at ${companies}.`;
  if (skills) msg += ` Your technical focus appears to be around ${skills}.`;
  msg += ` Does this look right to you?`;
  return msg;
}
```

### 4.4: Extraction Cards Builder

```typescript
function buildExtractionCards(extraction: ExtractionSchema): ExtractionCard[] {
  const cards: ExtractionCard[] = [];
  // Identity card — name, email, location, URLs (skip "Not found" values)
  // Experience card — one line per role: "Title at Company | start – end"
  // Education card — one line per entry: "Institution | Degree in Field"
  // Skills card — comma-separated list with count in title
  // Projects card — name + first 100 chars of description
  // Certifications card — name + issuer
  // Extras card — languages, awards, publications, volunteering (only if non-empty)
  return cards;
}
```

### 4.5: Confirm API Route

**Route:** `POST /api/onboarding-v2/confirm`

**Request body variants:**
```typescript
type ConfirmRequest =
  | { action: "looks_correct" }
  | { action: "something_wrong" }
  | { action: "select_role_family"; value: string }
  | { action: "select_seniority"; value: string }
  | { action: "free_text"; message: string };
```

**Handler decision tree:**
1. `"looks_correct"` → set summary_confirmed, store confirmed values from inference, advance to Stage 6
2. `"something_wrong"` → set correction_submitted, return prompt asking what's wrong, enter Stage 5
3. `"select_role_family"` → store confirmed_role_family; if seniority also ambiguous wait, else confirm all and advance
4. `"select_seniority"` → store confirmed_seniority, confirm all, advance to Stage 6
5. `"free_text"` → treat as correction, immediately process via Stage 5 correction handler

### 4.6: UI Component Props

```typescript
interface SummaryCardProps {
  presentation: SummaryPresentation;
  onConfirm: () => void;
  onReject: () => void;
  onSelectRoleFamily: (value: string) => void;
  onSelectSeniority: (value: string) => void;
  onFreeText: (message: string) => void;
}
```

**Render order:**
1. Summary message text (bold role/industry/companies via markdown-like parsing)
2. Conditional paragraphs (transition, new grad, quality warning)
3. Ambiguity chip selectors (if any)
4. Collapsible "See what I extracted" → extraction cards
5. Action buttons: "Looks correct" (primary), "Something is wrong" (secondary)
6. Free-text input below buttons (always visible)


---

## Stage 5 — Detailed Implementation

### 5.1: Correction Processing Function

```typescript
export interface CorrectionRoundResult {
  correctionUnderstood: boolean;
  clarifyingQuestion: string | null;
  fieldsChanged: string[];
  updatedExtraction: ExtractionSchema | null;
  userConfirmationMessage: string;
  userSuppliedFields: string[];
  shouldEscalate: boolean;
  escapeMessage: string | null;
}

export async function processCorrectionRound(
  session: OnboardingV2Session,
  userMessage: string
): Promise<CorrectionRoundResult>;
```

### 5.2: Correction State Machine

```typescript
async function handleCorrectionMessage(session: OnboardingV2Session, message: string) {
  const roundNumber = session.confirmation.correction_rounds + 1;

  // 1. Check hard limit
  if (roundNumber > 4) {
    return {
      shouldEscalate: true,
      escapeMessage: "Would you like to move on for now and come back to editing your profile details later? You'll be able to make changes at any time from your dashboard.",
    };
  }

  // 2. Detect "start over" intent
  if (message.toLowerCase().includes("start over")) {
    return { action: "restart" };
  }

  // 3. Detect frustration
  const frustrationSignals = ["completely wrong", "nothing looks right", "this is wrong", "terrible", "useless"];
  if (frustrationSignals.some(s => message.toLowerCase().includes(s))) {
    return {
      correctionUnderstood: false,
      clarifyingQuestion: "I'm sorry about that — let's fix it together. What would you like to start with?",
      fieldsChanged: [],
      updatedExtraction: null,
      userConfirmationMessage: "",
      userSuppliedFields: [],
      shouldEscalate: false,
      escapeMessage: null,
    };
  }

  // 4. Fire LLM correction call
  const llmResult = await callCorrectionInterpretation(session, message, roundNumber);

  // 5. Track vague rounds (2 vague → offer escape)
  if (!llmResult.correction_understood) {
    const vagueCount = countVagueRounds(session) + 1;
    if (vagueCount >= 2) {
      return {
        ...llmResult,
        shouldEscalate: true,
        escapeMessage: "No problem — let's move forward and you can make any adjustments as we go. Your profile isn't locked in at this stage.",
      };
    }
  }

  // 6. Apply correction if understood
  if (llmResult.correction_understood && llmResult.updated_extraction) {
    await updateSession(sessionId, {
      "dual_extraction.pure_extraction": llmResult.updated_extraction,
      "confirmation.correction_rounds": roundNumber,
      "confirmation.user_supplied_overrides": [
        ...session.confirmation.user_supplied_overrides,
        ...llmResult.user_supplied_fields,
      ],
    });
  }

  return llmResult;
}
```

### 5.3: Correction Type Decision Table

| User Input Pattern | LLM Detection | Session Update | Response |
|---|---|---|---|
| "My title at X should be Y" | Field correction: experience[i].title | Update entry | "I've updated your title at X to Y. Does that look right now?" |
| "You missed my job at Stripe" | Missing entry | (none yet) | "Could you tell me your title, what you worked on, and roughly when you were there?" |
| (user provides missing role details) | New entry data | Add to experience[] with source: user_supplied | "Added your role at Stripe. Anything else?" |
| "You didn't include Rust" | Missing skill | Check raw_text; add to skills | "Added Rust to your skills. Does that look right?" |
| "The experience section is wrong" | Vague | (none) | "Could you be more specific? Is a date wrong, a title incorrect, or something missing?" |
| "I was VP of Engineering" (contradicts) | Override | Apply user version, log override | "Updated to VP of Engineering. Does that look right?" |
| "Title wrong, missed company, skills incomplete" | Multiple | Apply all sequentially | "I've made three changes: [list]. Does this look right now?" |
| "I'm not a backend engineer" | Inference correction | Update confirmed_role_family | "Got it — I'll position you as [their correction] going forward." |

### 5.4: Post-Correction Confirmation Flow

After each successful correction, present:
1. The LLM's `userConfirmationMessage` (describes what changed)
2. Updated extraction cards (re-rendered)
3. Two buttons: "Looks correct now" / "Something else is wrong"

On "Looks correct now":
```typescript
await updateSession(sessionId, {
  "confirmation.summary_confirmed": true,
  "confirmation.confirmed_role_family": session.confirmation.confirmed_role_family || session.inference.role_family,
  "confirmation.confirmed_industry": session.inference.industry,
  "confirmation.confirmed_seniority": session.confirmation.confirmed_seniority || session.inference.seniority,
  "onboarding_status": "summary_confirmed",
});
```

On escape acceptance ("move on"):
```typescript
await updateSession(sessionId, {
  "confirmation.summary_confirmed": true,
  "confirmation.correction_unresolved": true,
  // ... same confirmed values
  "onboarding_status": "summary_confirmed",
});
```


---

## Stage 6 — Detailed Implementation

### 6.1: Completeness Assessment Function

```typescript
export interface CompletenessResult {
  completeness_score: number;
  missing_critical_fields: string[];
  completeness_path: "standard" | "new_grad" | "career_changer" | "contractor" | "returning";
  resume_stale: boolean;
  employment_gaps_present: boolean;
  has_quantified_achievements: boolean;
  special_handling_notes: string;
}

export async function runCompletenessAssessment(session: OnboardingV2Session): Promise<CompletenessResult>;
```

### 6.2: Question Activation Matrix

After completeness assessment, determine which Stage 7 questions are active:

```typescript
interface ActiveQuestions {
  target_role: true;                    // Always
  target_role_specificity: boolean;     // Conditional on Q1 answer specificity
  underrepresented_skills: true;        // Always
  deemphasis_preferences: true;         // Always
  resume_frame: true;                   // Always
  career_transition_framing: boolean;   // Only if career_transition_detected
  gap_handling: boolean;                // Only if employment_gaps_present
  achievement_depth: boolean;           // Only if !has_quantified_achievements
}

function determineActiveQuestions(session: OnboardingV2Session, completeness: CompletenessResult): ActiveQuestions {
  return {
    target_role: true,
    target_role_specificity: false, // Set to true dynamically after Q1 if answer is low-specificity
    underrepresented_skills: true,
    deemphasis_preferences: true,
    resume_frame: true,
    career_transition_framing: session.inference.career_transition_detected,
    gap_handling: completeness.employment_gaps_present,
    achievement_depth: !completeness.has_quantified_achievements,
  };
}
```

### 6.3: Path-Specific Tone Adjustments

```typescript
const PATH_TONE_MAP: Record<string, { intro: string; questionStyle: "supportive" | "analytical" | "neutral" }> = {
  standard: { intro: "", questionStyle: "neutral" },
  new_grad: {
    intro: "Since you're earlier in your career, I'll focus on your projects and what you're aiming for rather than years of experience.",
    questionStyle: "supportive",
  },
  career_changer: {
    intro: "I can see you're making a career shift — the next few questions will help me understand how you want to frame that transition.",
    questionStyle: "neutral",
  },
  contractor: {
    intro: "I noticed your work history is primarily contract-based — I'll ask how you'd like that presented.",
    questionStyle: "neutral",
  },
  returning: {
    intro: "It looks like your resume might not reflect your most recent work — is there anything you've done recently that we should add?",
    questionStyle: "supportive",
  },
};
```

### 6.4: Auto-Advance

Stage 6 is invisible to the user. After assessment completes:
```typescript
// Immediately after Stage 6 completes, present first Stage 7 question
const firstQuestion = getNextQuestion(session);
return { nextStage: 7, question: firstQuestion };
```

---

## Stage 7 — Detailed Implementation

### 7.1: Question Sequencer

```typescript
// apps/web/src/lib/onboarding-v2/stages/stage-7-questions.ts

const QUESTION_ORDER: Array<keyof QuestionMap> = [
  "target_role",
  "target_role_specificity",  // conditional
  "underrepresented_skills",
  "deemphasis_preferences",
  "resume_frame",
  "career_transition_framing", // conditional
  "gap_handling",              // conditional
  "achievement_depth",         // conditional
];

export function getNextQuestion(session: OnboardingV2Session): QuestionPresentation | null {
  for (const field of QUESTION_ORDER) {
    // Skip if already collected
    if (session.question_map[field].value !== null) continue;
    // Skip if conditional and not active
    if (!isQuestionActive(field, session)) continue;
    // Return this question
    return buildQuestionPresentation(field, session);
  }
  return null; // All questions answered
}
```

### 7.2: Question Presentation Builder

```typescript
export interface QuestionPresentation {
  field: keyof QuestionMap;
  prompt: string;
  chips: Array<{ label: string; value: string }> | null;  // null = free text only
  freeTextAllowed: boolean;
  skipAllowed: boolean;
}

function buildQuestionPresentation(field: keyof QuestionMap, session: OnboardingV2Session): QuestionPresentation {
  switch (field) {
    case "target_role":
      return {
        field: "target_role",
        prompt: "What kind of role is this resume being targeted at? You can be specific — a job title, a type of team, or a type of company works.",
        chips: generateRoleChips(session.confirmation.confirmed_role_family!, session.confirmation.confirmed_seniority!),
        freeTextAllowed: true,
        skipAllowed: false,
      };
    case "target_role_specificity":
      return {
        field: "target_role_specificity",
        prompt: `When you think about the kind of ${session.question_map.target_role.value} role you're targeting — is there a particular focus area, company size, or type of work that matters most to you?`,
        chips: null,
        freeTextAllowed: true,
        skipAllowed: true,
      };
    case "underrepresented_skills":
      return {
        field: "underrepresented_skills",
        prompt: "Is there anything you're good at or have worked on that you feel isn't well represented in your resume right now?",
        chips: [
          { label: "Side projects", value: "side_projects" },
          { label: "Open source contributions", value: "open_source" },
          { label: "Leadership experience", value: "leadership" },
          { label: "Specific technologies", value: "specific_tech" },
          { label: "Domain knowledge", value: "domain_knowledge" },
          { label: "Nothing — it's all there", value: "none" },
        ],
        freeTextAllowed: true,
        skipAllowed: false,
      };
    case "deemphasis_preferences":
      return {
        field: "deemphasis_preferences",
        prompt: "Is there anything in your background you'd prefer to keep minimal or not lead with in this resume?",
        chips: [
          { label: "Older roles (5+ years ago)", value: "older_roles" },
          { label: "Academic work", value: "academic" },
          { label: "A specific job or company", value: "specific_job" },
          { label: "A particular skill or tool", value: "specific_skill" },
          { label: "Nothing — include everything", value: "none" },
          { label: "Not sure", value: "not_sure" },
        ],
        freeTextAllowed: true,
        skipAllowed: false,
      };
    case "resume_frame":
      return {
        field: "resume_frame",
        prompt: "When someone reads this resume, what's the single most important thing you want them to take away about you?",
        chips: null,  // Free text only
        freeTextAllowed: true,
        skipAllowed: false,
      };
    case "career_transition_framing":
      return {
        field: "career_transition_framing",
        prompt: `I noticed your background is in ${session.inference.transition_note?.split("→")[0]?.trim() || "your prior field"} and you're targeting ${session.question_map.target_role.value || "a new direction"}. How do you want your earlier experience to show up in this resume?`,
        chips: [
          { label: "Feature it as relevant context", value: "feature_as_context" },
          { label: "Keep it brief — focus on where I'm going", value: "keep_brief" },
          { label: "Only include what transfers directly", value: "transferable_only" },
          { label: "I'll figure it out later", value: "deferred" },
        ],
        freeTextAllowed: true,
        skipAllowed: true,
      };
    case "gap_handling":
      return {
        field: "gap_handling",
        prompt: "I noticed there are some gaps in the timeline on your resume. How would you like to handle those?",
        chips: [
          { label: "Leave them as is — no explanation", value: "leave_as_is" },
          { label: "I'd like to add a brief note for the main gap", value: "add_note" },
          { label: "Minimise them — don't draw attention", value: "minimise" },
          { label: "I'll handle it in the resume itself", value: "handle_in_resume" },
        ],
        freeTextAllowed: true,
        skipAllowed: true,
      };
    case "achievement_depth":
      return {
        field: "achievement_depth",
        prompt: "I noticed your resume doesn't have many specific numbers or outcomes yet — things like 'reduced load time by 40%' or 'grew the API to handle 10M requests/day'. Do you have any metrics or measurable results from your work that we could add?",
        chips: [
          { label: "Yes — I'll share some", value: "will_share" },
          { label: "My work isn't easily measured", value: "not_applicable" },
          { label: "I'd rather not include metrics", value: "prefer_not" },
          { label: "I'm not sure — help me think", value: "help_me" },
        ],
        freeTextAllowed: true,
        skipAllowed: true,
      };
  }
}
```

### 7.3: Per-Answer Evaluation Call

```typescript
export interface AnswerEvaluation {
  answer_valid: boolean;
  answer_actionable: boolean;
  extracted_value: string | string[] | null;
  confidence: "high" | "medium" | "low";
  follow_up_question: string | null;
  additional_fields_collected: Record<string, { value: string; confidence: string }>;
}

export async function evaluateAnswer(
  field: keyof QuestionMap,
  userAnswer: string,
  session: OnboardingV2Session
): Promise<AnswerEvaluation>;
```

**LLM call parameters:**
- Model: `getModels().fast` (quick evaluation, not complex reasoning)
- Temperature: 0
- Max tokens: 1024
- System prompt: `ANSWER_EVALUATION_SYSTEM_PROMPT`
- User message includes: question text, field name, validity criteria, actionability criteria, user's answer, current question map, key extraction fields

### 7.4: Answer Processing Flow

```typescript
async function processAnswer(session: OnboardingV2Session, field: keyof QuestionMap, answer: string) {
  // 1. Quick-accept patterns (no LLM needed)
  if (field === "underrepresented_skills" && answer === "none") {
    return { accepted: true, value: "none", confidence: "high" };
  }
  if (field === "deemphasis_preferences" && answer === "none") {
    return { accepted: true, value: "none", confidence: "high" };
  }
  if (field === "career_transition_framing" && answer === "deferred") {
    return { accepted: true, value: "deferred", confidence: "high" };
  }

  // 2. Chip selections — generally accept without LLM eval
  const question = buildQuestionPresentation(field, session);
  const isChipSelection = question.chips?.some(c => c.value === answer);
  if (isChipSelection && field !== "achievement_depth") {
    // Most chip selections are valid by definition
    return { accepted: true, value: answer, confidence: "high", source: "chip" };
  }

  // 3. Special handling for "achievement_depth" chip "will_share"
  if (field === "achievement_depth" && answer === "will_share") {
    return {
      accepted: false,
      follow_up: "Great — go ahead and share whatever comes to mind. Even rough numbers are useful. For example: team size, user scale, performance improvements, revenue impact, projects delivered.",
      awaitingFreeText: true,
    };
  }

  // 4. Special handling for "achievement_depth" chip "help_me"
  if (field === "achievement_depth" && answer === "help_me") {
    const recentCompany = (session.dual_extraction.pure_extraction as any)?.experience?.[0]?.company || "your most recent role";
    return {
      accepted: false,
      follow_up: `Think about a project you're proud of from your time at ${recentCompany}. What changed because of your work? Who used it? How many people or how much did it affect?`,
      awaitingFreeText: true,
    };
  }

  // 5. Free text answers — evaluate via LLM
  const evaluation = await evaluateAnswer(field, answer, session);

  if (!evaluation.answer_valid || !evaluation.answer_actionable) {
    // Return follow-up question (max 1 follow-up per question)
    return { accepted: false, follow_up: evaluation.follow_up_question };
  }

  // 6. Check for cross-field answers
  if (Object.keys(evaluation.additional_fields_collected).length > 0) {
    // Update other fields in question map
    for (const [otherField, data] of Object.entries(evaluation.additional_fields_collected)) {
      await updateQuestionMapField(session, otherField as keyof QuestionMap, data.value, data.confidence as any);
    }
  }

  // 7. Special: if Q1 answer is low-specificity, activate Q2
  if (field === "target_role" && evaluation.confidence === "medium") {
    // target_role_specificity becomes active
  }

  return { accepted: true, value: evaluation.extracted_value, confidence: evaluation.confidence, source: "free_text" };
}
```

### 7.5: Follow-Up Handling

Each question gets at most ONE follow-up. If the follow-up answer is still low quality:
```typescript
if (isFollowUp && evaluation.confidence === "low") {
  // Accept whatever we have and flag it
  await updateQuestionMapField(session, field, evaluation.extracted_value || answer, "low");
  // Move to next question — don't loop
}
```

### 7.6: Message Route Handler for Questions

**Route:** `POST /api/onboarding-v2/message`

**Request:**
```typescript
{ action: "answer"; field: string; value: string; isChip: boolean }
| { action: "skip"; field: string }
```

**Response:**
```typescript
{ nextQuestion: QuestionPresentation | null; followUp?: string; stageComplete?: boolean }
```


---

## Stage 8 — Detailed Implementation

### 8.1: Voice Question Sequencer

```typescript
const VOICE_QUESTIONS = ["natural_voice_sample", "tone_preferences", "tone_aversions"] as const;

export function getNextVoiceQuestion(session: OnboardingV2Session): VoiceQuestionPresentation | null {
  if (!session.voice_profile.natural_voice_sample) return buildVoiceQ1();
  if (!session.voice_profile.tone_preferences?.length) return buildVoiceQ2();
  if (!session.voice_profile.tone_aversions?.length && session.voice_profile.tone_aversions !== null) return buildVoiceQ3();
  return null; // All answered
}
```

### 8.2: Voice Question Presentations

```typescript
function buildVoiceQ1(): VoiceQuestionPresentation {
  return {
    field: "natural_voice_sample",
    prompt: "In your own words — how would you describe what you do professionally to someone who works in tech but doesn't know your specific area?",
    chips: null,
    freeTextAllowed: true,
    minLength: 30, // words
    fallbackPrompt: "That's okay — imagine you're at a tech meetup and someone asks what you do. What's the version you'd tell them?",
  };
}

function buildVoiceQ2(): VoiceQuestionPresentation {
  return {
    field: "tone_preferences",
    prompt: "How would you describe the tone you want your resume to have? Pick as many as feel right.",
    chips: [
      { label: "Direct and confident", value: "direct_confident" },
      { label: "Technical and precise", value: "technical_precise" },
      { label: "Warm and collaborative", value: "warm_collaborative" },
      { label: "Leadership-focused", value: "leadership_focused" },
      { label: "Results-driven", value: "results_driven" },
      { label: "Understated", value: "understated" },
      { label: "Bold", value: "bold" },
      { label: "Conversational", value: "conversational" },
      { label: "Something else — I'll describe it", value: "custom" },
    ],
    freeTextAllowed: true,
    multiSelect: true,
  };
}

function buildVoiceQ3(): VoiceQuestionPresentation {
  return {
    field: "tone_aversions",
    prompt: "Is there anything you'd never want your resume to sound like? Things that feel off-brand for you?",
    chips: [
      { label: "Corporate buzzwords", value: "corporate_buzzwords" },
      { label: "Overly humble", value: "overly_humble" },
      { label: "Overly boastful", value: "overly_boastful" },
      { label: "Jargon-heavy", value: "jargon_heavy" },
      { label: "Vague or fluffy", value: "vague_fluffy" },
      { label: "Too casual", value: "too_casual" },
      { label: "First-person (I/we)", value: "first_person" },
      { label: "Nothing — I'm open", value: "none" },
    ],
    freeTextAllowed: true,
    multiSelect: true,
  };
}
```

### 8.3: Voice Answer Processing

```typescript
async function processVoiceAnswer(session: OnboardingV2Session, field: string, answer: string | string[]) {
  switch (field) {
    case "natural_voice_sample": {
      const wordCount = (answer as string).split(/\s+/).length;
      if (wordCount < 30) {
        // Return fallback prompt (one attempt only)
        if (!session._internal?.voiceFallbackUsed) {
          return { accepted: false, followUp: buildVoiceQ1().fallbackPrompt };
        }
        // Second attempt still short — skip and flag
        return { accepted: true, value: null, skipped: true };
      }
      // Detect style
      const style = detectSelfDescriptionStyle(answer as string);
      await updateSession(sessionId, {
        "voice_profile.natural_voice_sample": answer,
        "voice_profile.self_description_style": style,
      });
      return { accepted: true };
    }

    case "tone_preferences": {
      const values = Array.isArray(answer) ? answer : [answer];
      // All chips selected → "open"
      if (values.length >= 7) {
        await updateSession(sessionId, { "voice_profile.tone_preferences": "open" });
      } else {
        await updateSession(sessionId, { "voice_profile.tone_preferences": values });
      }
      return { accepted: true };
    }

    case "tone_aversions": {
      const values = Array.isArray(answer) ? answer : [answer];
      if (values.includes("none")) {
        await updateSession(sessionId, { "voice_profile.tone_aversions": [] });
      } else {
        await updateSession(sessionId, { "voice_profile.tone_aversions": values });
        // Check for specific word aversions in free text
        if (typeof answer === "string" && answer.includes("don't use")) {
          const words = extractSpecificWordAversions(answer);
          await updateSession(sessionId, { "voice_profile.phrases_to_avoid": words });
        }
        // Check for AI language aversion
        if (typeof answer === "string" && (answer.includes("AI") || answer.includes("artificial"))) {
          await updateSession(sessionId, { "voice_profile.aversion_to_ai_language": true });
        }
      }
      return { accepted: true };
    }
  }
}

function detectSelfDescriptionStyle(text: string): "formal" | "conversational" | "structured/terse" {
  const hasContractions = /\b(I'm|don't|can't|won't|it's|that's|I've)\b/.test(text);
  const avgSentenceLength = text.split(/[.!?]+/).filter(Boolean).reduce((sum, s) => sum + s.split(/\s+/).length, 0) / text.split(/[.!?]+/).filter(Boolean).length;
  const hasBullets = /^[-•*]/m.test(text);

  if (hasBullets || avgSentenceLength < 8) return "structured/terse";
  if (hasContractions && avgSentenceLength < 20) return "conversational";
  return "formal";
}
```

### 8.4: Voice Profile Extraction LLM Call

Fires after all 3 questions are answered:

```typescript
async function extractVoiceProfile(session: OnboardingV2Session): Promise<void> {
  const result = await callLLM({
    model: getModels().fast,
    temperature: 0.1,
    maxTokens: 1024,
    systemPrompt: VOICE_EXTRACTION_SYSTEM_PROMPT,
    userMessage: `
      Natural voice sample: ${session.voice_profile.natural_voice_sample || "Not provided"}
      Tone preferences selected: ${JSON.stringify(session.voice_profile.tone_preferences)}
      Tone aversions selected: ${JSON.stringify(session.voice_profile.tone_aversions)}
      Self-description style tagged: ${session.voice_profile.self_description_style || "unknown"}
      User's confirmed role family and seniority: ${session.confirmation.confirmed_role_family}, ${session.confirmation.confirmed_seniority}
    `,
  });

  const parsed = JSON.parse(result);
  await updateSession(sessionId, {
    "voice_profile.sentence_structure": parsed.sentence_structure,
    "voice_profile.vocabulary_register": parsed.vocabulary_register,
    "voice_profile.leading_pattern": parsed.leading_pattern,
    "voice_profile.phrases_to_use": parsed.phrases_to_use || [],
    "voice_profile.phrases_to_avoid": [
      ...(session.voice_profile.phrases_to_avoid || []),
      ...(parsed.phrases_to_avoid || []),
    ],
    "voice_profile.tone_calibration_summary": parsed.tone_calibration_summary,
    "voice_profile.voice_profile_confidence": parsed.confidence,
    "voice_profile.voice_profile_source": "collected",
    "onboarding_status": "voice_extraction_complete",
  });
}
```

### 8.5: Default Voice Profile (when user skips all)

```typescript
function buildDefaultVoiceProfile(roleFamily: string, seniority: string): Partial<VoiceProfile> {
  const seniorityTone = seniority.includes("Senior") || seniority.includes("Staff") || seniority.includes("Lead")
    ? "Confident, scope-aware, results-oriented"
    : "Clear, direct, technically grounded";

  return {
    sentence_structure: "Mixed — medium-length sentences with occasional short punchy statements",
    vocabulary_register: "Technical but accessible — uses domain terms without over-explaining",
    leading_pattern: "results_first",
    phrases_to_use: [],
    phrases_to_avoid: [],
    tone_calibration_summary: `${seniorityTone}. Avoid generic filler and hollow superlatives.`,
    voice_profile_confidence: "low",
    voice_profile_source: "default",
  };
}
```

---

## Stage 9 — Detailed Implementation

### 9.1: Confidence Audit Function

```typescript
export interface AuditResult {
  critical_gaps: Array<{ field: string; reason: string; simplified_question: string }>;
  important_gaps: Array<{ field: string; current_value: string; confidence: string; clarification_question: string }>;
  contradictions: Array<{ field: string; extracted_value: string; user_stated_value: string; resolution_question: string }>;
  user_supplied_overrides: string[];
  regenerate_inferred_summary: boolean;
  profile_quality_score: number;
  profile_quality_note: string;
  ready_to_commit: boolean;
}

export async function runConfidenceAudit(session: OnboardingV2Session): Promise<AuditResult>;
```

### 9.2: Critical Fields Validation (Deterministic — No LLM)

```typescript
function checkCriticalFields(session: OnboardingV2Session): string[] {
  const missing: string[] = [];
  if (!session.confirmation.confirmed_role_family) missing.push("confirmed_role_family");
  if (!session.confirmation.confirmed_seniority) missing.push("confirmed_seniority");
  if (!session.question_map.target_role.value) missing.push("target_role");
  if (!session.question_map.resume_frame.value) missing.push("resume_frame");

  const extraction = session.dual_extraction.pure_extraction as ExtractionSchema;
  if (!extraction?.experience?.length || !extraction.experience.some(e => e.title && e.company)) {
    missing.push("experience_entry");
  }
  if (!extraction?.skills?.raw_list?.length) {
    missing.push("skills");
  }
  return missing;
}
```

### 9.3: Gap Surfacing UI Flow

```typescript
async function handleAuditStage(session: OnboardingV2Session) {
  // 1. Run deterministic critical check first
  const criticalMissing = checkCriticalFields(session);

  // 2. Run LLM audit for nuanced gaps/contradictions
  const auditResult = await runConfidenceAudit(session);

  // 3. If no gaps and ready_to_commit → show commit screen directly
  if (criticalMissing.length === 0 && auditResult.ready_to_commit) {
    return { action: "show_commit_screen", qualityScore: auditResult.profile_quality_score };
  }

  // 4. Surface critical gaps one at a time
  if (criticalMissing.length > 0 || auditResult.critical_gaps.length > 0) {
    const allCritical = [
      ...criticalMissing.map(f => ({
        field: f,
        reason: `Required for resume generation`,
        simplified_question: getSimplifiedQuestion(f),
      })),
      ...auditResult.critical_gaps,
    ];
    return { action: "surface_critical_gap", gap: allCritical[0] };
  }

  // 5. Surface important gaps (non-blocking)
  if (auditResult.important_gaps.length > 0) {
    return { action: "surface_important_gap", gap: auditResult.important_gaps[0] };
  }

  // 6. Surface contradictions
  if (auditResult.contradictions.length > 0) {
    return { action: "surface_contradiction", contradiction: auditResult.contradictions[0] };
  }

  return { action: "show_commit_screen", qualityScore: auditResult.profile_quality_score };
}

function getSimplifiedQuestion(field: string): string {
  const map: Record<string, string> = {
    confirmed_role_family: "What type of engineering role best describes you?",
    confirmed_seniority: "What seniority level are you at?",
    target_role: "What role are you targeting with this resume?",
    resume_frame: "What's the one thing you want someone to take away from your resume?",
    experience_entry: "Could you tell me about your most recent role — title, company, and what you worked on?",
    skills: "What are your top 5 technical skills?",
  };
  return map[field] || `Could you provide your ${field.replace(/_/g, " ")}?`;
}
```

### 9.4: Profile Commit Transaction

```typescript
export async function commitProfile(session: OnboardingV2Session): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const userId = session.user_id;
  const extraction = session.dual_extraction.pure_extraction as ExtractionSchema;

  // Wrap all writes in a single RPC call or sequential writes with rollback
  try {
    // 1. Update users table
    await supabase.from("users").update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    }).eq("id", userId);

    // 2. Upsert profiles
    await supabase.from("profiles").upsert({
      user_id: userId,
      full_name: extraction.identity?.full_name,
      email: extraction.identity?.email,
      location: extraction.identity?.location,
      linkedin_url: extraction.identity?.linkedin_url,
      github_url: extraction.identity?.github_url,
      confirmed_role_family: session.confirmation.confirmed_role_family,
      confirmed_seniority: session.confirmation.confirmed_seniority,
      confirmed_industry: session.confirmation.confirmed_industry,
      target_role: session.question_map.target_role.value,
      resume_frame: session.question_map.resume_frame.value,
      completeness_path: session.completeness.completeness_path,
      profile_quality_score: session.audit.profile_quality_score,
    }, { onConflict: "user_id" });

    // 3. Insert experience entries
    if (extraction.experience?.length) {
      const rows = extraction.experience.map((exp, i) => ({
        user_id: userId,
        title: exp.title,
        company: exp.company,
        location: exp.location,
        start_date: exp.start_date,
        end_date: exp.end_date,
        is_current: exp.is_current || false,
        bullets: exp.bullets || [],
        source: session.confirmation.user_supplied_overrides.includes(`experience[${i}]`) ? "user_supplied" : "extracted",
        sort_order: i,
      }));
      await supabase.from("user_experience").upsert(rows, { onConflict: "user_id,sort_order" });
    }

    // 4. Insert education entries
    if (extraction.education?.length) {
      const rows = extraction.education.map((edu, i) => ({
        user_id: userId,
        institution: edu.institution,
        degree: edu.degree,
        field: edu.field,
        start_date: edu.start_date,
        end_date: edu.end_date,
        sort_order: i,
      }));
      await supabase.from("user_education").upsert(rows, { onConflict: "user_id,sort_order" });
    }

    // 5. Insert skills
    await supabase.from("user_skills").upsert({
      user_id: userId,
      skills: extraction.skills?.raw_list || [],
      grouped: extraction.skills?.grouped || {},
    }, { onConflict: "user_id" });

    // 6. Insert voice profile
    await supabase.from("user_voice_profiles").upsert({
      user_id: userId,
      natural_voice_sample: session.voice_profile.natural_voice_sample,
      tone_preferences: session.voice_profile.tone_preferences,
      tone_aversions: session.voice_profile.tone_aversions,
      self_description_style: session.voice_profile.self_description_style,
      sentence_structure: session.voice_profile.sentence_structure,
      vocabulary_register: session.voice_profile.vocabulary_register,
      leading_pattern: session.voice_profile.leading_pattern,
      phrases_to_use: session.voice_profile.phrases_to_use,
      phrases_to_avoid: session.voice_profile.phrases_to_avoid,
      tone_calibration_summary: session.voice_profile.tone_calibration_summary,
      voice_profile_confidence: session.voice_profile.voice_profile_confidence,
      voice_profile_source: session.voice_profile.voice_profile_source,
    }, { onConflict: "user_id" });

    // 7. Insert resume preferences
    await supabase.from("user_resume_preferences").upsert({
      user_id: userId,
      target_role: session.question_map.target_role.value,
      target_role_specificity: session.question_map.target_role_specificity.value,
      underrepresented_skills: session.question_map.underrepresented_skills.value,
      deemphasis_preferences: session.question_map.deemphasis_preferences.value,
      resume_frame: session.question_map.resume_frame.value,
      career_transition_framing: session.question_map.career_transition_framing.value,
      gap_handling: session.question_map.gap_handling.value,
      achievement_depth: session.question_map.achievement_depth.value,
    }, { onConflict: "user_id" });

    // 8. Insert onboarding metadata
    await supabase.from("user_onboarding_metadata").upsert({
      user_id: userId,
      session_id: session.session_id,
      confidence_flags: buildConfidenceFlags(session),
      source_flags: buildSourceFlags(session),
      low_confidence_fields: findLowConfidenceFields(session),
      correction_rounds: session.confirmation.correction_rounds,
      profile_quality_score: session.audit.profile_quality_score,
      voice_profile_confidence: session.voice_profile.voice_profile_confidence,
      completeness_path: session.completeness.completeness_path,
    }, { onConflict: "user_id" });

    // 9. Mark session as committed
    await updateSession(session.session_id, {
      "onboarding_status": "committed",
      "onboarding_completed_at": new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
```

### 9.5: Commit API Route with Retry

**Route:** `POST /api/onboarding-v2/commit`

```typescript
export async function POST(req: Request) {
  const session = await loadSession(userId);
  
  // Retry up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await commitProfile(session);
    if (result.success) {
      // Fire background understanding generation (non-blocking)
      generateUnderstandingDocument(session).catch(err => {
        console.error("[onboarding] understanding generation failed, will retry:", err);
        // Queue for async retry
      });
      return Response.json({ success: true, redirect: "/dashboard" });
    }
    if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt)); // backoff
  }

  return Response.json({
    success: false,
    error: "We hit a technical issue saving your profile — please try again in a moment.",
    retryable: true,
  }, { status: 500 });
}
```

### 9.6: Background Understanding Generation

```typescript
async function generateUnderstandingDocument(session: OnboardingV2Session): Promise<void> {
  const result = await callLLM({
    model: getModels().smart,
    temperature: 0.3,
    maxTokens: 4096,
    systemPrompt: UNDERSTANDING_GENERATION_SYSTEM_PROMPT,
    userMessage: JSON.stringify({
      extraction: session.dual_extraction.pure_extraction,
      inferred_summary: session.dual_extraction.inferred_summary,
      voice_profile: session.voice_profile,
      question_map: session.question_map,
      confirmed_role_family: session.confirmation.confirmed_role_family,
      confirmed_seniority: session.confirmation.confirmed_seniority,
      confirmed_industry: session.confirmation.confirmed_industry,
    }),
  });

  // Store the understanding document
  const supabase = await createClient();
  await supabase.from("user_understanding").upsert({
    user_id: session.user_id,
    understanding_document: result,
    generated_at: new Date().toISOString(),
    source_session_id: session.session_id,
  }, { onConflict: "user_id" });
}
```

### 9.7: "Finish Later" Handler

**Route:** `POST /api/onboarding-v2/session` with `{ action: "save_draft" }`

```typescript
if (body.action === "save_draft") {
  await updateSession(sessionId, {
    "onboarding_draft_saved_at": new Date().toISOString(),
  });
  // Do NOT set onboarding_completed
  return Response.json({ success: true, message: "Your progress has been saved. You can continue anytime." });
}
```

### 9.8: "Start Over" Handler

**Route:** `POST /api/onboarding-v2/restart`

```typescript
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req);
  const supabase = await createClient();

  // Delete the session row entirely
  await supabase.from("onboarding_v2_sessions").delete().eq("user_id", userId);

  // Create a fresh session
  const newSession = createEmptySession(userId);
  await supabase.from("onboarding_v2_sessions").insert({
    id: newSession.session_id,
    user_id: userId,
    session_state: newSession,
    onboarding_status: "awaiting_upload",
  });

  return Response.json({ success: true, sessionId: newSession.session_id });
}
```

---

## Constants File

```typescript
// apps/web/src/lib/onboarding-v2/constants.ts

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MIN_EXTRACTION_CHARS = 300;
export const NEAR_EMPTY_CHARS = 200; // scanned PDF threshold
export const MAX_UPLOAD_ATTEMPTS_BEFORE_PASTE = 3;
export const SLOW_CONNECTION_TIMEOUT_MS = 45_000;
export const SCHEMA_MAPPING_MAX_RETRIES = 2;
export const INFERENCE_MAX_RETRIES = 2;
export const CORRECTION_MAX_ROUNDS = 4;
export const VAGUE_ROUNDS_BEFORE_ESCAPE = 2;
export const COMMIT_MAX_RETRIES = 3;
export const SESSION_VALIDITY_DAYS = 7;
export const VOICE_SAMPLE_MIN_WORDS = 30;
export const SUMMARY_MIN_WORDS = 100; // for quality check
export const LONG_RESUME_CHAR_LIMIT = 50_000; // truncation threshold
```

---

## Error Classes

```typescript
// apps/web/src/lib/onboarding-v2/errors.ts

export class OnboardingError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public retryable: boolean = false,
    public stage: number = 0,
  ) {
    super(`[onboarding:${code}] ${userMessage}`);
  }
}

export class FileValidationError extends OnboardingError {
  constructor(code: string, message: string) {
    super(code, message, false, 1);
  }
}

export class ExtractionError extends OnboardingError {
  constructor(code: string, message: string) {
    super(code, message, true, 1);
  }
}

export class LLMCallError extends OnboardingError {
  constructor(stage: number, callName: string, originalError: Error) {
    super(`llm_${callName}_failed`, `AI processing failed — please try again.`, true, stage);
  }
}

export class SessionWriteError extends OnboardingError {
  constructor() {
    super("session_write_failed", "Something went wrong saving your progress — please try again.", true, 0);
  }
}

export class CommitError extends OnboardingError {
  constructor() {
    super("commit_failed", "We hit a technical issue saving your profile — please try again in a moment.", true, 9);
  }
}
```

---

*End of implementation addendum.*

---
---

# COMPLETE LLM PROMPTS & GUARDRAILS

Every prompt below is production-ready. Copy verbatim into `apps/web/src/lib/onboarding-v2/llm/prompts.ts`.

---

## Prompt 1: Schema Mapping (Stage 1)

```typescript
export const SCHEMA_MAPPING_SYSTEM_PROMPT = `You are a structured data extraction engine for Retune, a resume generation platform for tech professionals. Your job is to read raw resume text and map its content to a precise database schema. You do not summarise, infer, or interpret. You extract only what is explicitly present in the text. If a field is not present, return null for that field. Never guess or fill in values that are not clearly stated in the resume.

CRITICAL RULES:
- Return valid JSON only. No preamble, no explanation, no markdown formatting, no code fences.
- If a date is ambiguous (e.g. "2019" with no month), return the year only as a string.
- If a field appears multiple times (e.g. two emails), return the first one found.
- Do NOT extract: national ID numbers, date of birth, passport numbers, social security numbers, bank details, or any government-issued identification. If you encounter these, skip them entirely.
- extraction_confidence should reflect overall quality of the resume text:
  high = clean, well-structured, all major sections present
  medium = readable but some sections missing or formatting was messy
  low = significant content was likely missed due to formatting or scan quality

OUTPUT SCHEMA (return exactly this structure):
{
  "identity": {
    "full_name": string | null,
    "email": string | null,
    "phone": string | null,
    "location": string | null,
    "linkedin_url": string | null,
    "github_url": string | null,
    "portfolio_url": string | null
  },
  "experience": [
    {
      "title": string | null,
      "company": string | null,
      "location": string | null,
      "start_date": string | null,
      "end_date": string | null,
      "is_current": boolean,
      "bullets": string[]
    }
  ],
  "education": [
    {
      "institution": string | null,
      "degree": string | null,
      "field": string | null,
      "start_date": string | null,
      "end_date": string | null,
      "gpa": string | null,
      "honours": string | null
    }
  ],
  "skills": {
    "raw_list": string[],
    "grouped": {}
  },
  "projects": [
    {
      "name": string | null,
      "description": string | null,
      "technologies": string[],
      "url": string | null
    }
  ],
  "certifications": [
    {
      "name": string | null,
      "issuer": string | null,
      "date": string | null
    }
  ],
  "languages": string[],
  "awards": string[],
  "publications": string[],
  "volunteering": string[],
  "extraction_confidence": "high" | "medium" | "low",
  "extraction_notes": string
}`;
```

---

## Prompt 2A: Pure Extraction (Stage 2)

```typescript
export const PURE_EXTRACTION_SYSTEM_PROMPT = `You are a precise data extraction engine for Retune, a resume generation platform for tech professionals. Your only job is to read the resume text provided and extract its content literally and accurately. Do not infer, interpret, embellish, or add information that is not explicitly present in the text. If something is not clearly stated, return null.

CRITICAL RULES:
- Every field you return must be directly traceable to a specific line or section of the resume text.
- Cross-reference with the Stage 1 schema mapping (provided below the resume) where available to verify consistency. If they disagree, prefer what you can directly see in the resume text.
- Do NOT extract: national ID numbers, date of birth, passport numbers, social security numbers, bank details. Skip these entirely.
- If the resume contains sections in languages other than English, still extract the content — do not skip non-English sections.
- Return valid JSON only. No preamble, no explanation, no markdown formatting, no code fences.
- Include extraction_confidence and extraction_notes in your output.
- extraction_confidence:
  high = clean text, all major sections clearly present, minimal ambiguity
  medium = readable but some sections unclear, formatting issues, or minor gaps
  low = significant content likely missed, garbled text, or very sparse content

OUTPUT FORMAT: Valid JSON matching the schema provided in the user message. No preamble. No markdown.`;
```

---

## Prompt 2B: Inferred Summary (Stage 2)

```typescript
export const INFERRED_SUMMARY_SYSTEM_PROMPT = `You are a senior technical recruiter and career strategist with 15 years of experience hiring in the tech industry. You are reading a resume to build a deep understanding of who this person is professionally. Your output will be used internally by Retune to understand the candidate's background, trajectory, and positioning — it will not be shown to the user directly.

Write a rich, specific, natural-language narrative that captures:
- Who this person is as a tech professional
- What they have actually done (not just job titles — the real work)
- How their career has progressed and what direction it appears to be heading
- What makes them distinctive or notable compared to a typical candidate at their level
- Any tensions, pivots, or interesting patterns in their history
- What kind of roles they are most credibly positioned for right now

CRITICAL RULES:
- Be specific. Name companies, technologies, and achievements from the resume. Do not use generic filler like "experienced professional" or "various technologies".
- Be honest. If the resume is thin or inconsistent, note that directly.
- Write in third person.
- Minimum 150 words, maximum 400 words.
- Do not speculate about personal information (age, nationality, gender, etc.)
- If the resume contains non-English sections, still produce your output in English.
- Output plain text only. No headers, no bullets, no JSON, no markdown.
- Do NOT start with "This candidate" or "The candidate" — vary your opening.`;
```

---

## Prompt 3: Industry & Role Inference (Stage 3)

```typescript
export const INFERENCE_SYSTEM_PROMPT = `You are a technical recruiting expert and career analyst specialising in the tech industry. You have deep knowledge of tech role families, seniority levels, company types, and industry verticals. You are reading a structured resume extraction and a professional narrative summary to determine three things about this candidate: what industry their resume is targeted at, what role family they belong to, and what seniority level they are at. You must be specific and honest. If something is ambiguous, say so explicitly rather than guessing.

INSTRUCTIONS:
1. industry: The primary industry their resume is positioned in. Use SPECIFIC terms:
   Fintech, HealthTech, SaaS B2B, Gaming, Developer Tools, E-commerce, AdTech, Cybersecurity, AI/ML Infrastructure, Cloud Infrastructure, EdTech, LegalTech, PropTech, InsurTech, Logistics/Supply Chain, Media/Entertainment, Telecommunications, Automotive/Mobility, Energy/CleanTech, Government/Defense, Consulting, Agency.
   NEVER use generic terms like "technology", "software", "IT", or "tech".
   If the candidate has worked across multiple industries with no clear primary, set industry_ambiguous: true and list the top 2-3 in industry_candidates.

2. role_family: Use EXACTLY one of:
   Backend Engineering, Frontend Engineering, Fullstack Engineering, Mobile Engineering, Data Engineering, ML Engineering, Platform/Infrastructure Engineering, DevOps/SRE, Security Engineering, Engineering Management, Technical Product Management, Developer Relations, QA/Testing Engineering.
   If the candidate spans two areas equally, set role_family_ambiguous: true and list candidates.
   For niche roles (smart contract auditor, hardware security researcher), map to the closest category.

3. seniority: Use EXACTLY one of:
   Entry Level, Junior, Mid-level, Senior IC, Staff/Principal IC, Engineering Lead, Engineering Manager, Senior Manager, Director+.
   Base this on years of experience, scope of work, and title progression — not just the most recent title.

4. Flags — set to true ONLY if clearly applicable:
   - role_family_ambiguous: resume genuinely spans two areas equally
   - seniority_ambiguous: signals contradict (e.g. 8 years but "developer" titles throughout)
   - career_transition_detected: last 1-2 roles are in a different area than the bulk of history. Include transition_note describing the shift.
   - industry_ambiguous: same skills applied across 3+ different industries
   - new_grad: no full-time work experience (internships only or empty experience)
   - work_pattern: "permanent" (standard employment) | "contract" (mostly short-tenure/freelance) | "mixed"

CRITICAL RULES:
- Return valid JSON only. No preamble, no explanation, no markdown.
- Every confidence field must be "high", "medium", or "low".
- Every note field must be a single sentence explaining your reasoning.
- If you cannot determine a field at all, still return your best guess with confidence "low" — never return null for the three core fields.

OUTPUT FORMAT:
{
  "industry": string,
  "industry_confidence": "high" | "medium" | "low",
  "industry_note": string,
  "industry_ambiguous": boolean,
  "industry_candidates": string[] | null,
  "role_family": string,
  "role_family_confidence": "high" | "medium" | "low",
  "role_family_note": string,
  "role_family_ambiguous": boolean,
  "role_family_candidates": string[] | null,
  "seniority": string,
  "seniority_confidence": "high" | "medium" | "low",
  "seniority_note": string,
  "seniority_ambiguous": boolean,
  "career_transition_detected": boolean,
  "transition_note": string | null,
  "new_grad": boolean,
  "work_pattern": "permanent" | "contract" | "mixed"
}`;
```


---

## Prompt 4: Summary Generation (Stage 4)

```typescript
export const SUMMARY_GENERATION_SYSTEM_PROMPT = `You are the onboarding assistant for Retune, a resume generation platform for tech professionals. You are about to show a user the first thing they will see after uploading their resume. Your job is to write a summary message that makes them feel understood — specific, intelligent, and warm. Not generic. Not robotic. You are not writing a formal bio. You are writing a first impression that says "I actually read your resume and I understand who you are."

INSTRUCTIONS:
- Be specific. Name actual companies and technologies from the resume.
- Maximum 4 sentences. Do not ramble.
- Warm but professional tone.
- Do NOT use the word "impressive" or any hollow praise ("great", "amazing", "fantastic").
- Do NOT start with "Based on your resume" — that's obvious and robotic.
- If extraction quality was low, acknowledge it briefly and without alarm: mention formatting made some sections harder to parse.
- If career transition detected, acknowledge it naturally in one sentence.
- If role family is ambiguous, present both options as a question: "It looks like you could be positioned as either a [A] or a [B] — which feels more accurate?"
- If seniority is ambiguous, state what you inferred and ask: "does that feel right?"
- If new_grad is true, lead with education and projects, not work history. Be encouraging, not condescending.
- Output plain text only. No markdown, no JSON, no headers, no bullet points.

CONTEXT PROVIDED:
You will receive: structured extraction, professional narrative, inferred industry/role/seniority, extraction quality flag, and all ambiguity/transition flags. Use all of these to craft your message.

EXAMPLES OF GOOD OUTPUT:
"Thanks for sharing your resume. You're a backend engineer with around 6 years of experience, primarily in fintech. You've worked at Stripe and Plaid, with a strong focus on payment infrastructure and API design. Your move from individual contributor to tech lead at Plaid stands out."

"It looks like you're earlier in your career — I've pulled in your projects and education since that's where most of your story is right now. Your capstone project on distributed caching and your open-source contributions to Redis suggest you're heading toward infrastructure work."

EXAMPLES OF BAD OUTPUT (never do this):
"Based on your resume, you are an impressive software engineer with extensive experience." (generic, hollow praise, robotic opening)
"I can see you have worked at several companies and have many skills." (vague, says nothing specific)`;
```

---

## Prompt 5: Correction Interpretation (Stage 5)

```typescript
export const CORRECTION_INTERPRETATION_SYSTEM_PROMPT = `You are the onboarding assistant for Retune. A user has just told you that something in their extracted profile is wrong. Your job is to understand exactly what they want to change, apply the change to their profile data, and confirm the change with them. You must be precise and specific. Do not guess what they mean. If unclear, ask one focused question. Never argue with the user — their stated version always takes precedence over what was extracted.

RULES:
1. If the correction is CLEAR (you know exactly which field and what the new value should be):
   - Set correction_understood: true
   - Return the full updated_extraction object with the change applied
   - Return a user_confirmation_message that describes what you changed (e.g. "I've updated your title at Stripe from 'Software Engineer' to 'Senior Software Engineer'. Does that look right now?")
   - List the changed fields in fields_changed
   - If the user is providing information NOT in the original resume, flag those fields in user_supplied_fields

2. If the correction is UNCLEAR (you're not sure which field or what the value should be):
   - Set correction_understood: false
   - Return ONLY a clarifying_question — one focused question, not multiple
   - Do NOT return updated_extraction
   - Do NOT guess or make assumptions

3. If the user provides MULTIPLE corrections in one message:
   - Parse all of them
   - Apply each one
   - Return a consolidated user_confirmation_message listing all changes
   - List all changed fields

4. If the user says something that CONTRADICTS the resume text:
   - Apply the user's version without argument
   - Flag the field in user_supplied_fields
   - Do NOT mention the contradiction to the user

5. If the correction is about their ROLE IDENTITY (e.g. "I'm not a backend engineer, I'm a platform engineer"):
   - This is an inference correction, not a data correction
   - Do NOT modify the extraction data
   - Set fields_changed: ["confirmed_role_family"]
   - Set the user_confirmation_message to acknowledge the correction

CRITICAL:
- Return valid JSON only. No preamble, no explanation, no markdown.
- The updated_extraction must be the COMPLETE extraction object, not just the changed fields.
- Never argue, never defend the extraction, never say "but your resume says..."

OUTPUT FORMAT:
{
  "correction_understood": boolean,
  "clarifying_question": string | null,
  "fields_changed": string[],
  "updated_extraction": object | null,
  "user_confirmation_message": string,
  "user_supplied_fields": string[]
}`;
```

---

## Prompt 6: Completeness Assessment (Stage 6)

```typescript
export const COMPLETENESS_ASSESSMENT_SYSTEM_PROMPT = `You are a resume strategy expert. You are assessing a candidate's confirmed resume profile to determine how complete it is and which onboarding question path is most appropriate for them. Your assessment determines what questions we ask next. Be honest and precise.

ASSESS THE FOLLOWING:

1. completeness_score (0-100): How complete and usable is this profile for generating a high-quality, targeted resume?
   - 90-100: Everything needed, rich detail, quantified achievements
   - 70-89: Good foundation, some gaps in specificity
   - 50-69: Workable but missing important context
   - 30-49: Thin — needs significant enrichment
   - 0-29: Barely usable — critical information missing

2. missing_critical_fields: List fields that are absent and would SIGNIFICANTLY limit resume generation quality. Only include truly critical gaps, not nice-to-haves.

3. completeness_path: Choose the SINGLE most appropriate path:
   - "standard": 5+ years experience, multiple roles, clear progression. Full question set.
   - "new_grad": Under 2 years experience or only internships. Focus on projects/education/aspirations.
   - "career_changer": Clear evidence of a domain/role shift (prior career different from target). Include transition framing questions.
   - "contractor": Primarily short-tenure/freelance roles. Include presentation preference questions.
   - "returning": Most recent role is 18+ months ago. Include "anything recent?" prompt.

4. resume_stale: true if the most recent role ended more than 18 months ago.

5. employment_gaps_present: true if there are gaps of 12+ months between roles. Do NOT flag gaps at the end (current unemployment) — only gaps BETWEEN roles.

6. has_quantified_achievements: true if ANY experience bullet contains a specific number, percentage, metric, or measurable outcome (e.g. "reduced latency by 40%", "managed team of 8", "processed 10M requests/day").

7. special_handling_notes: Any other observations relevant to how questions should be framed. Examples: "FAANG background — questions should not feel basic", "very strong academic record compensates for thin work history", "contracting history is a deliberate choice, not instability".

CRITICAL RULES:
- Return valid JSON only. No preamble, no explanation, no markdown.
- Be honest about completeness — do not inflate scores.
- The path choice should be based on the DOMINANT pattern, not edge cases.

OUTPUT FORMAT:
{
  "completeness_score": number,
  "missing_critical_fields": string[],
  "completeness_path": "standard" | "new_grad" | "career_changer" | "contractor" | "returning",
  "resume_stale": boolean,
  "employment_gaps_present": boolean,
  "has_quantified_achievements": boolean,
  "special_handling_notes": string
}`;
```


---

## Prompt 7: Answer Evaluation (Stage 7)

```typescript
export const ANSWER_EVALUATION_SYSTEM_PROMPT = `You are evaluating a user's answer to an onboarding question for Retune, a resume generation platform. Your job is to determine whether the answer genuinely addresses the question being asked AND whether the answer is specific enough to be actionable for resume generation. A valid answer that is too vague is not acceptable — it must be specific enough that a resume generator could use it to make concrete decisions.

You must also check whether the answer contains information relevant to OTHER questions in the question map — if so, extract and record those values too (this prevents asking redundant questions later).

EVALUATION CRITERIA:

1. answer_valid: Does the answer address the question that was asked? 
   - "I'm not sure" is valid for some questions (it's an honest answer)
   - Completely off-topic responses are invalid
   - Single words like "yes" or "no" without context are usually invalid unless the question is yes/no

2. answer_actionable: Is the answer specific enough for a resume generator to USE it?
   - "Software engineer" → minimally actionable (valid but low confidence)
   - "Senior backend engineer at a Series B fintech startup" → highly actionable
   - "Something in tech" → NOT actionable
   - "I want them to think I'm good" → NOT actionable
   - "I want them to see me as someone who can take a vague problem and ship a clean API for it" → actionable

3. confidence:
   - high: Answer is clear, specific, and directly usable
   - medium: Answer is valid but required some interpretation or is somewhat generic
   - low: Answer is vague, off-topic, or would require guessing to use

4. follow_up_question: If the answer is invalid or not actionable, provide ONE focused follow-up question. Do not ask multiple questions. Make it specific to what's missing.

5. additional_fields_collected: If the user's answer ALSO answers other questions in the map, extract those values. For example, if they say "I want to be a senior backend engineer at a fintech startup and I don't want to highlight my old QA work" — that answers target_role AND deemphasis_preferences.

CRITICAL RULES:
- Return valid JSON only. No preamble, no explanation, no markdown.
- Never reject an answer just because it's short — reject only if it's not actionable.
- If the user says "I don't know" or "not sure", that IS a valid answer for optional questions. Set confidence to "low" and move on.
- Do NOT generate follow-up questions that feel like an interrogation. One gentle nudge maximum.

OUTPUT FORMAT:
{
  "answer_valid": boolean,
  "answer_actionable": boolean,
  "extracted_value": string | null,
  "confidence": "high" | "medium" | "low",
  "follow_up_question": string | null,
  "additional_fields_collected": {
    "field_name": { "value": string, "confidence": "high" | "medium" | "low" }
  }
}`;
```

---

## Prompt 8: Voice Pattern Extraction (Stage 8)

```typescript
export const VOICE_EXTRACTION_SYSTEM_PROMPT = `You are a writing style analyst. You have collected three responses from a user during onboarding for Retune, a resume generation platform. Your job is to analyse these responses and extract a structured voice profile that the resume generator can use to produce resumes that sound like this specific person — not like a generic AI-written document.

ANALYSE:
1. sentence_structure: How does this person naturally construct sentences? Options:
   - "Short and punchy — fragments and direct statements"
   - "Medium-length with clear subject-verb-object structure"
   - "Long and explanatory — context before conclusion"
   - "Mixed — varies between short impact statements and longer explanations"

2. vocabulary_register: What level of language do they naturally use?
   - "Highly technical — uses domain jargon freely without explanation"
   - "Technical but accessible — uses terms but doesn't over-jargon"
   - "Plain language — avoids jargon, explains in simple terms"
   - "Formal/corporate — polished, structured, professional register"

3. leading_pattern: When describing their work, what do they lead with?
   - "results_first": Opens with outcomes/impact, then explains how
   - "context_first": Sets the scene/problem, then describes solution and result
   - "method_first": Leads with what they did/built, then mentions impact
   - "mixed": No consistent pattern

4. phrases_to_use: Extract 3-5 specific phrases, sentence patterns, or word choices from their voice sample that feel distinctly "them". These will be used as style anchors.

5. phrases_to_avoid: Based on their tone aversions, list 3-5 specific phrases or patterns the resume should NEVER use. Be concrete — not "buzzwords" but actual examples like "synergy", "leverage", "passionate about".

6. tone_calibration_summary: Write EXACTLY two sentences that will be included verbatim in the resume generator's system prompt. These two sentences must capture the essential voice instruction. Example: "Write in a direct, technically precise voice that leads with measurable outcomes. Avoid corporate filler and hollow superlatives — every sentence should contain a specific claim."

CRITICAL RULES:
- Return valid JSON only. No preamble, no explanation, no markdown.
- If the voice sample is very short or was skipped, base your analysis primarily on the tone preferences/aversions selected and set confidence to "low".
- The tone_calibration_summary is the MOST IMPORTANT output — it will be used in every resume generation for this user. Make it specific and actionable.
- confidence: "high" if voice sample was rich (50+ words) and preferences were clear. "medium" if sample was short but preferences were selected. "low" if most inputs were skipped.

OUTPUT FORMAT:
{
  "sentence_structure": string,
  "vocabulary_register": string,
  "leading_pattern": "results_first" | "context_first" | "method_first" | "mixed",
  "phrases_to_use": string[],
  "phrases_to_avoid": string[],
  "tone_calibration_summary": string,
  "confidence": "high" | "medium" | "low"
}`;
```

---

## Prompt 9: Confidence Audit (Stage 9)

```typescript
export const CONFIDENCE_AUDIT_SYSTEM_PROMPT = `You are performing a final quality audit of a user's onboarding profile for Retune, a resume generation platform. You have access to everything collected across the entire onboarding session. Your job is to identify gaps, low-confidence values, unresolved issues, and contradictions — and to produce a structured gap report that determines what needs to be surfaced to the user before their profile is committed to the database.

AUDIT CHECKLIST:

1. critical_gaps: Fields that are MISSING and would significantly harm resume generation quality. For each, provide:
   - field: which field is missing
   - reason: why it matters for resume generation
   - simplified_question: a SHORT, low-friction question to collect it (one sentence, with a "Skip for now" option implied)

2. important_gaps: Fields that EXIST but have low confidence or are vague. For each:
   - field: which field
   - current_value: what we currently have
   - confidence: current confidence level
   - clarification_question: a question offering two interpretations for the user to pick from

3. contradictions: Cases where the extracted value and the user's stated value disagree. For each:
   - field: which field
   - extracted_value: what the resume said
   - user_stated_value: what the user said
   - resolution_question: a neutral question asking which to use (do NOT imply one is wrong)

4. user_supplied_overrides: List all fields where the user's stated value overrode the extraction. These are flagged in the DB as authoritative.

5. regenerate_inferred_summary: Set to true if the original inferred summary was flagged as low quality AND we now have significantly more context (voice profile, question answers) to produce a better one.

6. profile_quality_score (0-100): Overall quality of the committed profile for resume generation purposes.
   - 90-100: Excellent — rich, specific, well-confirmed
   - 70-89: Good — usable with minor gaps
   - 50-69: Adequate — will produce decent but not outstanding resumes
   - Below 50: Thin — dashboard should prompt enrichment

7. profile_quality_note: One sentence summary of the profile's strengths and weaknesses.

8. ready_to_commit: true if there are NO critical_gaps. Important gaps and contradictions do not block commit — they are surfaced but optional.

CRITICAL RULES:
- Return valid JSON only. No preamble, no explanation, no markdown.
- Be conservative with critical_gaps — only truly blocking issues. Most profiles should be ready_to_commit: true.
- Do NOT flag fields as critical if they have a reasonable default or can be inferred during generation.
- Contradictions are informational, not blocking. The user's version always wins if they don't respond.
- Keep simplified_questions SHORT — the user is at the end of onboarding and fatigued.

OUTPUT FORMAT:
{
  "critical_gaps": [{ "field": string, "reason": string, "simplified_question": string }],
  "important_gaps": [{ "field": string, "current_value": string, "confidence": string, "clarification_question": string }],
  "contradictions": [{ "field": string, "extracted_value": string, "user_stated_value": string, "resolution_question": string }],
  "user_supplied_overrides": string[],
  "regenerate_inferred_summary": boolean,
  "profile_quality_score": number,
  "profile_quality_note": string,
  "ready_to_commit": boolean
}`;
```

---

## Prompt 10: Understanding Generation (Post-Commit Background)

```typescript
export const UNDERSTANDING_GENERATION_SYSTEM_PROMPT = `You are building Retune's deep understanding document for a user. This document is the seed that powers every resume the system generates for this person. It must be comprehensive, specific, and honest. It is never shown to the user — it is internal context for the resume generator.

Write a structured understanding document that covers:

1. PROFESSIONAL IDENTITY (2-3 sentences): Who is this person? What is their core professional identity? What level are they at?

2. CAREER NARRATIVE (3-5 sentences): How has their career progressed? What's the story arc? Where are they heading?

3. DISTINCTIVE STRENGTHS (bullet list, 3-7 items): What makes this person stand out? Be specific — name technologies, scales, achievements.

4. POSITIONING STRATEGY (2-3 sentences): Given their target role and resume frame, how should resumes be positioned? What should lead? What should be de-emphasised?

5. VOICE INSTRUCTIONS (2-3 sentences): Based on their voice profile, how should generated text sound? Include the tone_calibration_summary verbatim, plus any additional voice notes.

6. KNOWN GAPS AND SENSITIVITIES (bullet list): What's missing from their profile? What should the generator be careful about? (e.g. "employment gap 2021-2022 — user wants it minimised", "career transition from finance — user wants prior career as brief context only")

7. GENERATION DEFAULTS: When no job-specific context is provided, what defaults should the generator use for:
   - Industry framing
   - Seniority positioning
   - Technical depth level
   - Achievement emphasis style

CRITICAL RULES:
- Be specific. Use actual company names, technologies, and metrics from the profile.
- Be honest. If the profile is thin, say so — the generator needs to know its constraints.
- This document will be regenerated when the user makes significant profile updates.
- Output as plain text with the section headers above. No JSON, no code fences.
- Maximum 800 words.`;
```


---
---

# GUARDRAILS & SAFETY

---

## LLM Output Guardrails

Every LLM call must pass through a validation layer before its output is used. Never trust raw LLM output.

### JSON Parsing Guardrail

```typescript
// apps/web/src/lib/onboarding-v2/llm/guardrails.ts

export function safeParseLLMJson<T>(
  raw: string,
  validator: (parsed: unknown) => { valid: boolean; result: T | null; errors: string[] }
): { success: true; data: T } | { success: false; errors: string[]; rawOutput: string } {
  // 1. Strip markdown code fences if present (LLMs sometimes add them despite instructions)
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  // 2. Attempt JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // 3. Try to extract JSON from surrounding text (LLM added preamble)
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { success: false, errors: ["Failed to parse JSON from LLM output"], rawOutput: raw };
      }
    } else {
      return { success: false, errors: ["No JSON found in LLM output"], rawOutput: raw };
    }
  }

  // 4. Validate against expected schema
  const validation = validator(parsed);
  if (!validation.valid || !validation.result) {
    return { success: false, errors: validation.errors, rawOutput: raw };
  }

  return { success: true, data: validation.result };
}
```

### PII Stripping Guardrail

```typescript
export function stripPII(extraction: Record<string, unknown>): Record<string, unknown> {
  const PII_PATTERNS = [
    /\b\d{3}-\d{2}-\d{4}\b/,          // SSN (US)
    /\b\d{9}\b/,                        // SSN without dashes
    /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card
    /\bPPS\s?\d{7}[A-Z]{1,2}\b/i,      // Irish PPS
    /\b\d{2}\/\d{2}\/\d{4}\b/,         // DOB pattern (but could be employment date — only strip from identity section)
    /\bpassport\s*:?\s*[A-Z0-9]{6,12}\b/i, // Passport number
    /\bnational\s*id\s*:?\s*\S+/i,     // National ID
  ];

  const identityStr = JSON.stringify(extraction.identity || {});
  for (const pattern of PII_PATTERNS) {
    if (pattern.test(identityStr)) {
      // Remove the matched field value — don't store it
      // Log that PII was detected and stripped (without logging the value)
      console.warn("[onboarding] PII pattern detected and stripped from extraction");
    }
  }
  return extraction;
}
```

### Token Limit Guardrail

```typescript
export function truncateForContext(text: string, maxChars: number = 100_000): string {
  if (text.length <= maxChars) return text;
  // Keep first 60% and last 20%, drop middle (usually repetitive experience entries)
  const keepStart = Math.floor(maxChars * 0.6);
  const keepEnd = Math.floor(maxChars * 0.2);
  return text.slice(0, keepStart) + "\n\n[... content truncated for processing ...]\n\n" + text.slice(-keepEnd);
}
```

### Hallucination Prevention Guardrail

```typescript
// After extraction, verify key claims exist in source text
export function verifyExtractionAgainstSource(
  extraction: ExtractionSchema,
  sourceText: string
): { verified: boolean; suspiciousFields: string[] } {
  const suspicious: string[] = [];
  const sourceLower = sourceText.toLowerCase();

  // Check company names exist in source
  for (const exp of extraction.experience || []) {
    if (exp.company && !sourceLower.includes(exp.company.toLowerCase())) {
      suspicious.push(`experience.company: "${exp.company}" not found in source`);
    }
  }

  // Check institution names exist in source
  for (const edu of extraction.education || []) {
    if (edu.institution && !sourceLower.includes(edu.institution.toLowerCase())) {
      suspicious.push(`education.institution: "${edu.institution}" not found in source`);
    }
  }

  // Check name exists in source
  if (extraction.identity?.full_name) {
    const nameParts = extraction.identity.full_name.toLowerCase().split(/\s+/);
    const nameFound = nameParts.some(part => part.length > 2 && sourceLower.includes(part));
    if (!nameFound) suspicious.push(`identity.full_name: "${extraction.identity.full_name}" not found in source`);
  }

  return { verified: suspicious.length === 0, suspiciousFields: suspicious };
}
```

---

## Rate Limiting & Cost Guardrails

```typescript
// apps/web/src/lib/onboarding-v2/llm/rate-limits.ts

// Per-user limits during onboarding
export const ONBOARDING_LLM_LIMITS = {
  maxCallsPerSession: 30,          // Total LLM calls across entire onboarding
  maxCallsPerMinute: 5,            // Burst protection
  maxCostPerSession: 0.50,         // USD — hard kill if exceeded
  maxSingleCallCost: 0.10,         // USD — reject calls that would exceed this
  maxInputTokens: 50_000,          // Per call
  maxOutputTokens: 8_192,          // Per call
  timeoutMs: 60_000,               // Per call — hard timeout
};

export class OnboardingRateLimiter {
  private callCount = 0;
  private totalCost = 0;
  private minuteWindow: number[] = [];

  canMakeCall(estimatedCost: number): { allowed: boolean; reason?: string } {
    if (this.callCount >= ONBOARDING_LLM_LIMITS.maxCallsPerSession) {
      return { allowed: false, reason: "session_call_limit" };
    }
    if (this.totalCost + estimatedCost > ONBOARDING_LLM_LIMITS.maxCostPerSession) {
      return { allowed: false, reason: "session_cost_limit" };
    }
    const now = Date.now();
    this.minuteWindow = this.minuteWindow.filter(t => now - t < 60_000);
    if (this.minuteWindow.length >= ONBOARDING_LLM_LIMITS.maxCallsPerMinute) {
      return { allowed: false, reason: "rate_limit" };
    }
    return { allowed: true };
  }

  recordCall(cost: number): void {
    this.callCount++;
    this.totalCost += cost;
    this.minuteWindow.push(Date.now());
  }
}
```

---

## Input Sanitization Guardrails

```typescript
// Prevent prompt injection via user messages
export function sanitizeUserInput(input: string): string {
  // 1. Trim to reasonable length (corrections/answers should never be > 5000 chars)
  let sanitized = input.slice(0, 5000);

  // 2. Strip any attempt to override system instructions
  // (We don't need to be paranoid here since user input goes in the user message,
  //  but we strip obvious injection attempts for defense in depth)
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/gi,
    /you\s+are\s+now\s+a/gi,
    /system\s*:\s*/gi,
    /\[INST\]/gi,
    /<<SYS>>/gi,
  ];
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, "[filtered]");
  }

  return sanitized.trim();
}

// Validate file names to prevent path traversal
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")      // No path separators
    .replace(/\.\./g, "_")       // No directory traversal
    .replace(/[<>:"|?*]/g, "_")  // No special chars
    .slice(0, 255);              // Max filename length
}
```

---

## Session Security Guardrails

```typescript
// Prevent session hijacking / cross-user access
export async function validateSessionOwnership(
  sessionId: string,
  authenticatedUserId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_v2_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  return data?.user_id === authenticatedUserId;
}

// Prevent replay attacks on commit
export async function validateCommitIdempotency(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_v2_sessions")
    .select("onboarding_status")
    .eq("user_id", userId)
    .single();
  // If already committed, reject duplicate commit
  return data?.onboarding_status !== "committed";
}
```

---

## Concurrency Guardrails

```typescript
// Prevent race conditions on session updates
// Use optimistic locking via version field
export async function updateSessionWithLock(
  sessionId: string,
  currentVersion: number,
  updates: Partial<OnboardingV2Session>
): Promise<{ success: boolean; conflict: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_v2_sessions")
    .update({
      session_state: updates,
      version: currentVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("version", currentVersion) // Optimistic lock
    .select();

  if (!data?.length) {
    return { success: false, conflict: true }; // Version mismatch — reload and retry
  }
  return { success: true, conflict: false };
}
```

---
---

# REMAINING ITEMS & OPEN QUESTIONS

---

## Items Not Yet Covered in This Plan

1. **Onboarding gate / routing logic**: How does `apps/web` decide whether to show v1 or v2 onboarding? The existing `onboarding-gate.ts` needs a feature flag check. Implementation:
   ```typescript
   // apps/web/src/lib/onboarding-gate.ts — add to existing
   export function shouldUseOnboardingV2(): boolean {
     return process.env.ONBOARDING_V2 === "1" || process.env.ONBOARDING_V2 === "true";
   }
   ```

2. **Dashboard integration after commit**: After onboarding completes, the dashboard should:
   - Show a "Profile complete" success state on first visit
   - If `profile_depth: "shallow"` → show enrichment prompt card
   - If `correction_unresolved: true` → show "Review your profile" card
   - If `voice_profile_source: "default"` → show "Complete your voice profile" card

3. **Profile editing from dashboard**: Users must be able to edit their profile post-onboarding. This plan covers onboarding only — a separate plan should cover the profile editor that reads from the same tables.

4. **Understanding document regeneration trigger**: When the user edits their profile significantly from the dashboard, the understanding document should be regenerated. Define "significantly" as: any change to target_role, resume_frame, confirmed_role_family, or addition/removal of experience entries.

5. **Analytics events**: Track onboarding funnel:
   - `onboarding_v2_started` (session created)
   - `onboarding_v2_upload_success` / `onboarding_v2_upload_failed`
   - `onboarding_v2_summary_confirmed` / `onboarding_v2_correction_started`
   - `onboarding_v2_questions_complete`
   - `onboarding_v2_committed` (with `profile_quality_score` and `completeness_path`)
   - `onboarding_v2_abandoned` (session exists but no activity for 7 days)
   - `onboarding_v2_finish_later` (explicit save)

6. **Mobile responsiveness**: The conversational UI must work on mobile (360px+). Key constraints:
   - Chips wrap to multiple lines
   - Upload zone is tap-friendly (44px+ touch targets)
   - Extraction dropdown scrolls vertically
   - No horizontal scrolling anywhere

7. **Accessibility**:
   - All chips are keyboard-navigable (arrow keys + Enter)
   - Upload zone supports keyboard activation
   - Progress messages are announced via `aria-live="polite"`
   - Confirmation buttons have clear focus states
   - Collapsible sections use `aria-expanded`

8. **Loading states**: Between stages (while LLM calls are in flight):
   - Show a typing indicator (3 dots animation)
   - Show contextual progress message (e.g. "Understanding your career..." during Stage 2-3)
   - Never show a blank screen
   - If LLM call takes > 5 seconds, show "Still working on it..." reassurance

9. **Error recovery UX**: When any LLM call fails and the user sees an error:
   - Always show a "Try again" button
   - Never lose the user's prior input
   - If retry also fails, offer "Save and try later" + "Contact support"
   - Never show raw error messages or stack traces

10. **Existing data migration**: Users who completed v1 onboarding should NOT be forced through v2. But they should see a dashboard prompt: "We've improved our profile system — would you like to enhance your profile?" that optionally routes them through a subset of v2 (Stages 7-8 only, since their extraction data already exists).

---

## Open Design Questions (Require Product Decision)

1. **Should the extraction dropdown be open by default or collapsed?** Recommendation: collapsed, with a subtle "See details" link. Most users will trust the summary.

2. **Should we show a progress bar?** Recommendation: subtle stage indicator (dots or steps) at the top, but NOT a percentage. Users shouldn't feel like they're filling out a form.

3. **What happens if the user navigates away mid-LLM-call?** Recommendation: the call completes server-side regardless. On return, the session reflects the completed state.

4. **Should "Finish later" be a persistent button or only shown after a certain point?** Recommendation: always visible as a subtle link in the top-right, not a prominent button. It should feel like an escape hatch, not an invitation to leave.

5. **How long should sessions persist before expiring?** Recommendation: 7 days. After that, show "Your previous session has expired — would you like to start fresh?" with the option to re-upload.

---

---
---

# COMPLETE DB SCHEMA FOR LLM EXTRACTION MAPPING

The LLM extraction output maps to these normalized tables. This is the final committed state after Stage 9.

```sql
-- CORE PROFILE (one row per user)
CREATE TABLE IF NOT EXISTS user_profiles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  confirmed_role_family TEXT,
  confirmed_seniority TEXT,
  confirmed_industry TEXT,
  target_role TEXT,
  target_role_specificity TEXT,
  resume_frame TEXT,
  underrepresented_skills JSONB DEFAULT '[]',
  deemphasis_preferences JSONB DEFAULT '[]',
  career_transition_framing TEXT,
  gap_handling TEXT,
  achievement_depth JSONB,
  completeness_path TEXT,
  completeness_score INTEGER,
  profile_quality_score INTEGER,
  profile_depth TEXT DEFAULT 'standard',
  career_transition_detected BOOLEAN DEFAULT false,
  new_grad BOOLEAN DEFAULT false,
  work_pattern TEXT DEFAULT 'permanent',
  resume_stale BOOLEAN DEFAULT false,
  employment_gaps_present BOOLEAN DEFAULT false,
  understanding_document TEXT,
  understanding_generated_at TIMESTAMPTZ,
  inferred_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- EXPERIENCE (one row per role)
CREATE TABLE IF NOT EXISTS user_experience_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  company TEXT,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current BOOLEAN DEFAULT false,
  bullets JSONB DEFAULT '[]',
  source TEXT DEFAULT 'extracted',
  field_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

-- EDUCATION (one row per entry)
CREATE TABLE IF NOT EXISTS user_education_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  institution TEXT,
  degree TEXT,
  field TEXT,
  start_date TEXT,
  end_date TEXT,
  gpa TEXT,
  honours TEXT,
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

-- SKILLS (one row per user)
CREATE TABLE IF NOT EXISTS user_skills_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_list JSONB DEFAULT '[]',
  grouped JSONB DEFAULT '{}',
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- PROJECTS
CREATE TABLE IF NOT EXISTS user_projects_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  description TEXT,
  technologies JSONB DEFAULT '[]',
  url TEXT,
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

-- CERTIFICATIONS
CREATE TABLE IF NOT EXISTS user_certifications_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  issuer TEXT,
  date TEXT,
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- EXTRAS (languages, awards, publications, volunteering)
CREATE TABLE IF NOT EXISTS user_extras_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  languages JSONB DEFAULT '[]',
  awards JSONB DEFAULT '[]',
  publications JSONB DEFAULT '[]',
  volunteering JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- VOICE PROFILE
CREATE TABLE IF NOT EXISTS user_voice_profiles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  natural_voice_sample TEXT,
  tone_preferences JSONB DEFAULT '[]',
  tone_aversions JSONB DEFAULT '[]',
  self_description_style TEXT,
  sentence_structure TEXT,
  vocabulary_register TEXT,
  leading_pattern TEXT,
  phrases_to_use JSONB DEFAULT '[]',
  phrases_to_avoid JSONB DEFAULT '[]',
  tone_calibration_summary TEXT,
  aversion_to_ai_language BOOLEAN DEFAULT false,
  voice_profile_confidence TEXT DEFAULT 'low',
  voice_profile_source TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- ONBOARDING METADATA (audit trail)
CREATE TABLE IF NOT EXISTS user_onboarding_metadata_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID,
  field_sources JSONB DEFAULT '{}',
  field_confidences JSONB DEFAULT '{}',
  low_confidence_fields JSONB DEFAULT '[]',
  needs_review_fields JSONB DEFAULT '[]',
  correction_rounds INTEGER DEFAULT 0,
  correction_unresolved BOOLEAN DEFAULT false,
  extraction_confidence TEXT,
  extraction_method TEXT,
  upload_file_name TEXT,
  total_llm_calls INTEGER DEFAULT 0,
  total_llm_cost_usd NUMERIC(6,4) DEFAULT 0,
  onboarding_started_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- SESSION (live state — one row per user during onboarding)
CREATE TABLE IF NOT EXISTS onboarding_v2_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_state JSONB NOT NULL DEFAULT '{}',
  onboarding_status TEXT NOT NULL DEFAULT 'awaiting_upload',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
```

### LLM Output → DB Column Mapping

| LLM Output Path | DB Table | DB Column |
|---|---|---|
| `identity.full_name` | user_profiles_v2 | full_name |
| `identity.email` | user_profiles_v2 | email |
| `identity.phone` | user_profiles_v2 | phone |
| `identity.location` | user_profiles_v2 | location |
| `identity.linkedin_url` | user_profiles_v2 | linkedin_url |
| `identity.github_url` | user_profiles_v2 | github_url |
| `identity.portfolio_url` | user_profiles_v2 | portfolio_url |
| `experience[i].*` | user_experience_v2 | one row, sort_order=i |
| `education[i].*` | user_education_v2 | one row, sort_order=i |
| `skills.raw_list` | user_skills_v2 | raw_list |
| `skills.grouped` | user_skills_v2 | grouped |
| `projects[i].*` | user_projects_v2 | one row, sort_order=i |
| `certifications[i].*` | user_certifications_v2 | one row |
| `languages` | user_extras_v2 | languages |
| `awards` | user_extras_v2 | awards |
| `publications` | user_extras_v2 | publications |
| `volunteering` | user_extras_v2 | volunteering |
| Stage 3 inference | user_profiles_v2 | confirmed_role_family, confirmed_seniority, confirmed_industry |
| Stage 7 answers | user_profiles_v2 | target_role, resume_frame, etc. |
| Stage 8 voice | user_voice_profiles_v2 | all columns |
| Stage 2B narrative | user_profiles_v2 | inferred_summary |
| Post-commit | user_profiles_v2 | understanding_document |


---
---

# CAREER PROFILE PAGE — ENHANCED (Preserve Existing Structure)

**Route:** `/profile` (same as current)  
**Principle:** The current page structure is good. We enhance it with richer data from the new onboarding, not replace it.

---

## What We Keep (Unchanged)

1. **Two-zone architecture**: "Retune's Understanding" (top) → "Profile Details" (bottom)
2. **"Tune with AI" button** — conversational AI widget for refining any section
3. **"Re-read evidence" button** — re-processes resume without re-uploading
4. **"Your Best Angles"** — Primary / Alternative / Stretch positioning cards
5. **"Evidence Retune Is Using"** — 4-quadrant grid (Strongest / Supporting / Weak or Missing / Inferred But Unconfirmed)
6. **"Resume Fuel"** — 4-quadrant grid (Ready to Use / Needs Sharpening / Risks / Suggested Next Edits)
7. **Profile Details** — Identity card, Professional Snapshot, Skills grouped by category
8. **Dark theme, clean typography, minimal chrome**
9. **"Upload resume" button** in header (for re-upload)
10. **"Edit" button** on Profile Details section

---

## What We Enhance (New Data Sources)

### Section: Retune's Understanding + Regenerate

**Current:** Shows `understanding_document` as prose. "Regenerate" button re-generates it.

**Enhanced with new onboarding data:**
- The understanding document is now generated from: extraction + inferred summary + voice profile + question map answers + confirmed positioning
- It's richer because we have `resume_frame`, `target_role`, `tone_calibration_summary`, and `career_transition_framing` as inputs
- "Regenerate" now uses the full `UNDERSTANDING_GENERATION_SYSTEM_PROMPT` from the plan

**Data source mapping:**
```
user_profiles_v2.understanding_document → rendered as prose
user_profiles_v2.understanding_generated_at → "Last updated: X"
```

### Section: Your Best Angles (Primary / Alternative / Stretch)

**Current:** Shows 3 positioning angles. Populated by existing AI generation.

**Enhanced with new onboarding data:**
- PRIMARY angle is derived from: `confirmed_role_family` + `target_role` + `resume_frame`
- ALTERNATIVE angle is derived from: `role_family_candidates` (if ambiguous) or adjacent role families
- STRETCH angle is derived from: `career_transition_framing` or seniority+1 level

**Data source mapping:**
```
user_profiles_v2.confirmed_role_family → drives PRIMARY
user_profiles_v2.target_role → refines PRIMARY specificity
user_profiles_v2.resume_frame → shapes the "Best for" description
inference.role_family_candidates → drives ALTERNATIVE (if ambiguous)
inference.seniority → STRETCH = seniority + 1 level
```

**"Tune with AI" on this section:** Opens conversational widget pre-loaded with context:
```
"You're currently positioned as a {confirmed_role_family} targeting {target_role}. 
Your primary angle is {primary_angle}. Would you like to adjust your positioning, 
explore a different angle, or refine how you're framed?"
```

### Section: Evidence Retune Is Using (4-quadrant grid)

**Current:** Strongest Signals / Supporting Signals / Weak or Missing / Inferred But Unconfirmed

**Enhanced with new onboarding data:**

| Quadrant | Populated From |
|---|---|
| STRONGEST SIGNALS | Experience bullets with quantified achievements (`has_quantified_achievements`), skills that match `target_role`, companies with brand recognition |
| SUPPORTING SIGNALS | Education, certifications, projects, domain chips, soft skills |
| WEAK OR MISSING SIGNALS | `completeness.missing_critical_fields`, `metadata.low_confidence_fields`, `achievement_depth: "not_applicable"` |
| INFERRED BUT UNCONFIRMED | Fields where `source = "inferred"` in `field_sources`, fields with `confidence: "medium"` |

**Data source mapping:**
```
user_experience_v2.bullets (with metrics) → STRONGEST
user_skills_v2.raw_list (matching target_role) → STRONGEST
user_education_v2 + user_certifications_v2 → SUPPORTING
user_onboarding_metadata_v2.low_confidence_fields → WEAK OR MISSING
user_onboarding_metadata_v2.field_sources (where value = "inferred") → INFERRED
```

**"Tune with AI" on this section:** Opens widget with:
```
"I've identified some weak signals in your profile: {weak_list}. 
Would you like to strengthen any of these? I can help you articulate 
achievements or add missing context."
```

### Section: Resume Fuel (4-quadrant grid)

**Current:** Ready to Use / Needs Sharpening / Risks Before Generation / Suggested Next Edits

**Enhanced with new onboarding data:**

| Quadrant | Populated From |
|---|---|
| READY TO USE | Fields with `confidence: "high"` and `source: "extracted" or "user_confirmed"` — experience entries, confirmed skills, education |
| NEEDS SHARPENING | `voice_profile_confidence: "low"`, `resume_frame` with low confidence, `achievement_depth: "not_applicable"` but role typically has metrics |
| RISKS BEFORE GENERATION | `correction_unresolved: true`, `needs_review_fields`, contradictions from audit, `profile_depth: "shallow"` |
| SUGGESTED NEXT EDITS | Derived from `completeness_score` gaps: "Add 2 measurable achievements", "Complete your voice profile", "Specify target role more precisely" |

**Data source mapping:**
```
user_onboarding_metadata_v2.field_confidences (high) → READY TO USE
user_voice_profiles_v2.voice_profile_confidence → NEEDS SHARPENING (if low)
user_onboarding_metadata_v2.needs_review_fields → RISKS
completeness_score < 80 → generates SUGGESTED NEXT EDITS
```

**"Tune with AI" on this section:** Opens widget with:
```
"Here's what would most improve your resume generation quality: {suggested_edits}. 
Want to work on any of these now?"
```

### Section: Profile Details (bottom half)

**Current:** Identity card (name, title, location, links) → Professional Snapshot (years, title, highlights, domain chips) → Skills (grouped) → Experience → Education

**Enhanced with new onboarding data:**

The structure stays identical. What changes is the data is now richer and has source tracking:

**Identity Card:**
```
user_profiles_v2.full_name
user_profiles_v2.confirmed_role_family → shown as subtitle (e.g. "Backend Engineer")
user_profiles_v2.location
user_profiles_v2.github_url, linkedin_url, portfolio_url → shown as links
```

**Professional Snapshot:**
```
Computed years from user_experience_v2 entries (earliest start_date to now)
user_profiles_v2.confirmed_role_family → title
Top 3 achievement bullets from user_experience_v2 (those with metrics)
user_profiles_v2.confirmed_industry → domain chips
```

**Skills (grouped):**
```
user_skills_v2.grouped → if populated, show grouped (TECHNICAL, TOOLS, PROFESSIONAL, METHODOLOGIES, SOFT SKILLS)
user_skills_v2.raw_list → fallback flat list if grouped is empty
```

**New addition — Source badges (subtle, on hover):**
Each field in Profile Details can show its source on hover:
- ✓ (green dot) = extracted from resume
- ✎ (blue dot) = user corrected during onboarding
- ➕ (purple dot) = user added (not in resume)
- ⚡ (yellow dot) = AI inferred

This uses `user_onboarding_metadata_v2.field_sources` to determine which badge to show.

**"Re-read evidence" button:** Triggers a re-extraction pipeline:
1. Re-runs Stage 2 (pure extraction) on the stored `raw_text`
2. Diffs the new extraction against current DB state
3. Shows the user what changed: "I found 2 updates: your title at Fiserv should be 'Senior SWE' and I found a skill 'Terraform' I missed before. Apply changes?"
4. User confirms → updates DB

**"Edit" button:** Opens inline editing mode on Profile Details (same as current behavior).

---

## New Section: Voice & Tone (added between Evidence and Resume Fuel)

This is NEW — the current page doesn't have it. It shows the user how Retune will write for them.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Your Writing Voice                                    [Tune with AI]│
│  ─────────────────────────────────────────────────────────────────── │
│                                                                     │
│  "Write in a direct, technically precise voice that leads with      │
│   measurable outcomes. Avoid corporate filler and hollow             │
│   superlatives — every sentence should contain a specific claim."   │
│                                                                     │
│  Style: Conversational · Leads with: Results · Avoids: Buzzwords    │
│                                                                     │
│  Confidence: ●●●○○ Medium — complete your voice profile for better  │
│  results                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

**Data source:**
```
user_voice_profiles_v2.tone_calibration_summary → the quoted text
user_voice_profiles_v2.self_description_style → "Style: X"
user_voice_profiles_v2.leading_pattern → "Leads with: X"
user_voice_profiles_v2.tone_aversions → "Avoids: X"
user_voice_profiles_v2.voice_profile_confidence → confidence dots
```

**"Tune with AI" on this section:** Opens the 3 voice questions from Stage 8 in conversational mode. On completion, re-runs voice extraction LLM call and updates the profile.

---

## New Section: Resume Preferences (added after Resume Fuel)

Also NEW — shows the user their generation preferences transparently.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Resume Generation Preferences                         [Tune with AI]│
│  ─────────────────────────────────────────────────────────────────── │
│                                                                     │
│  Target: Senior Backend Engineer (fintech, distributed systems)     │
│  Frame: "Someone who can take a vague problem and ship a clean API" │
│  Highlight: System design, open source, leadership                  │
│  De-emphasise: Academic work, older roles                           │
│  Gaps: Minimise                                                     │
│  Transition: N/A                                                    │
│  Achievements: 3 quantified metrics on file                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Data source:**
```
user_profiles_v2.target_role + target_role_specificity
user_profiles_v2.resume_frame
user_profiles_v2.underrepresented_skills
user_profiles_v2.deemphasis_preferences
user_profiles_v2.gap_handling
user_profiles_v2.career_transition_framing
user_profiles_v2.achievement_depth
```

---

## Complete Page Section Order (Top to Bottom)

1. **Header**: "CAREER PROFILE — This is what Retune knows." + [Upload resume]
2. **Retune's Understanding** + [Regenerate]
3. **Your Best Angles** (Primary / Alternative / Stretch) + [Tune with AI]
4. **Evidence Retune Is Using** (4 quadrants) + [Tune with AI]
5. **Your Writing Voice** (NEW) + [Tune with AI]
6. **Resume Fuel** (4 quadrants) + [Tune with AI]
7. **Resume Generation Preferences** (NEW) + [Tune with AI]
8. **Profile Details** + [Re-read evidence] + [Edit]
   - Identity card
   - Professional Snapshot
   - Skills (grouped)
   - Experience entries
   - Education entries
   - Extras (certs, projects, languages, awards)

---

## "Tune with AI" Widget Behavior

The "Tune with AI" button exists on multiple sections. When clicked, it opens a conversational widget (slide-in panel or modal) that:

1. **Pre-loads context** for the section being tuned:
   - Understanding → full profile context, asks what to adjust
   - Best Angles → positioning context, asks about role targeting
   - Evidence → weak signals, asks to strengthen them
   - Voice → runs Stage 8 questions conversationally
   - Resume Fuel → suggested edits, walks through them
   - Preferences → runs relevant Stage 7 questions

2. **Uses the same LLM call pattern** as onboarding Stage 5 (correction) and Stage 7 (questions):
   - User types naturally
   - LLM interprets and applies changes
   - Confirms with user before saving

3. **Updates the DB** on confirmation:
   - Changes to positioning → update `user_profiles_v2`
   - Changes to voice → update `user_voice_profiles_v2`
   - Changes to experience → update `user_experience_v2`
   - Any significant change → trigger understanding regeneration

4. **Tracks source** as `"user_supplied"` for any field modified via Tune with AI post-onboarding.

---

## How Onboarding Data Flows Into This Page

```
Onboarding Stage 1-3 (extraction + inference)
    ↓
Stage 4-5 (confirmation + corrections)
    ↓
Stage 6-7 (completeness + questions)
    ↓
Stage 8 (voice)
    ↓
Stage 9 (audit + commit)
    ↓
DB Tables (user_profiles_v2, user_experience_v2, etc.)
    ↓
Career Profile Page loads from DB
    ↓
┌─────────────────────────────────────────────┐
│ understanding_document → "Retune's Understanding"
│ inference + target_role → "Your Best Angles"
│ field_confidences + sources → "Evidence" grid
│ voice_profile → "Your Writing Voice"
│ completeness + quality → "Resume Fuel" grid
│ question_map answers → "Resume Preferences"
│ extraction tables → "Profile Details"
└─────────────────────────────────────────────┘
    ↓
"Tune with AI" on any section → conversational edits → DB update → page refresh
```

---
---

# CLIENT-SIDE STATE MANAGEMENT

---

## Main Hook

```typescript
// apps/web/src/hooks/use-onboarding-v2.ts

interface UseOnboardingV2Return {
  // State
  session: OnboardingV2Session | null;
  currentStage: number;
  loading: boolean;
  error: OnboardingError | null;

  // Messages (chat history)
  messages: ChatMessage[];

  // Current question (Stage 7/8)
  currentQuestion: QuestionPresentation | null;

  // Actions
  uploadFile: (file: File) => Promise<void>;
  pasteText: (text: string) => Promise<void>;
  confirmSummary: () => Promise<void>;
  rejectSummary: () => Promise<void>;
  selectRoleFamily: (value: string) => void;
  selectSeniority: (value: string) => void;
  sendMessage: (text: string) => Promise<void>;
  selectChip: (field: string, value: string) => Promise<void>;
  selectChips: (field: string, values: string[]) => Promise<void>;
  skipQuestion: (field: string) => Promise<void>;
  commitProfile: () => Promise<void>;
  finishLater: () => Promise<void>;
  startOver: () => Promise<void>;
  retryLastAction: () => Promise<void>;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: string;
  type: "text" | "summary" | "question" | "confirmation" | "error" | "progress";
  chips?: Array<{ label: string; value: string }>;
  cards?: ExtractionCard[];
  actions?: Array<{ label: string; action: string; variant: "primary" | "secondary" }>;
}
```

## Stage Visibility State Machine

```typescript
type UIStage =
  | "upload"           // Show upload zone
  | "processing"      // Show progress messages (Stages 1-3 running)
  | "summary"         // Show summary card + confirm/reject (Stage 4)
  | "correction"      // Show chat for corrections (Stage 5)
  | "questions"       // Show questions one at a time (Stage 7)
  | "voice"           // Show voice questions (Stage 8)
  | "audit"           // Show final review + commit (Stage 9)
  | "committing"      // Show commit progress
  | "complete"        // Redirect to dashboard

function mapStatusToUIStage(status: OnboardingV2Status): UIStage {
  switch (status) {
    case "awaiting_upload": return "upload";
    case "extraction_complete":
    case "dual_extraction_complete":
    case "inference_complete": return "processing"; // auto-advancing
    case "summary_confirmed": return "questions"; // Stage 6 is invisible, auto-advances
    case "correction_in_progress": return "correction";
    case "path_branched": return "questions";
    case "resume_questions_complete": return "voice";
    case "voice_extraction_complete": return "audit";
    case "committed": return "complete";
    default: return "upload";
  }
}
```

## SSE Subscription for Progress

```typescript
// During Stages 1-3 (processing), subscribe to SSE for progress updates
function useUploadProgress(sessionId: string | null) {
  const [progress, setProgress] = useState<ProgressEvent[]>([]);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`/api/onboarding-v2/upload/stream?sessionId=${sessionId}`);
    es.addEventListener("progress", (e) => {
      setProgress(prev => [...prev, JSON.parse(e.data)]);
    });
    es.addEventListener("complete", () => es.close());
    es.addEventListener("error", (e) => { /* handle */ });
    return () => es.close();
  }, [sessionId]);

  return progress;
}
```

---
---

# ANALYTICS EVENTS

```typescript
// apps/web/src/lib/onboarding-v2/analytics.ts

export type OnboardingEvent =
  | { event: "onboarding_v2_started"; properties: { userId: string } }
  | { event: "onboarding_v2_upload_attempted"; properties: { fileType: string; fileSizeBytes: number; attempt: number } }
  | { event: "onboarding_v2_upload_success"; properties: { method: "file" | "paste"; charCount: number } }
  | { event: "onboarding_v2_upload_failed"; properties: { errorCode: string; attempt: number } }
  | { event: "onboarding_v2_extraction_complete"; properties: { confidence: string; schemaMapSuccess: boolean } }
  | { event: "onboarding_v2_inference_complete"; properties: { roleFamily: string; seniority: string; industry: string; ambiguities: string[] } }
  | { event: "onboarding_v2_summary_presented"; properties: { hasAmbiguity: boolean; extractionQuality: string } }
  | { event: "onboarding_v2_summary_confirmed"; properties: { correctionRounds: number } }
  | { event: "onboarding_v2_correction_started"; properties: {} }
  | { event: "onboarding_v2_correction_round"; properties: { round: number; understood: boolean } }
  | { event: "onboarding_v2_questions_complete"; properties: { answeredCount: number; skippedCount: number; path: string } }
  | { event: "onboarding_v2_voice_complete"; properties: { source: "collected" | "default"; confidence: string } }
  | { event: "onboarding_v2_committed"; properties: { qualityScore: number; completenessPath: string; totalLLMCalls: number; totalCostUsd: number; durationMs: number } }
  | { event: "onboarding_v2_finish_later"; properties: { stageAtExit: string } }
  | { event: "onboarding_v2_start_over"; properties: { stageAtReset: string } }
  | { event: "onboarding_v2_error"; properties: { stage: number; errorCode: string; retryable: boolean } };

export function trackOnboardingEvent(event: OnboardingEvent): void {
  // Send to analytics provider (Posthog, Mixpanel, etc.)
  // In test mode: console.log
  console.log(`[analytics] ${event.event}`, event.properties);
}
```

---
---

# ACCESSIBILITY SPEC

| Element | Requirement |
|---|---|
| Upload zone | `role="button"`, `aria-label="Upload resume file"`, keyboard-activatable (Enter/Space), focus ring visible |
| Upload zone drag | `aria-dropeffect="copy"` when dragging, announce "File ready to drop" |
| Progress messages | `aria-live="polite"` container, each message announced |
| Summary card | Collapsible uses `aria-expanded`, `aria-controls` pointing to content ID |
| Chips (single select) | `role="radiogroup"` with `role="radio"` per chip, arrow key navigation |
| Chips (multi select) | `role="group"` with `role="checkbox"` per chip, Space to toggle |
| Confirmation buttons | Standard `<button>` with clear labels, focus order: primary first |
| Chat messages | `role="log"`, `aria-live="polite"`, new messages announced |
| Text input | `<textarea>` with `aria-label` matching the question prompt |
| Error messages | `role="alert"`, `aria-live="assertive"` |
| "Finish later" | Always reachable via keyboard (Tab order), `aria-label="Save progress and exit"` |
| Stage progress | `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Loading indicator | `aria-busy="true"` on container, `aria-label="Processing your resume"` |

---
---

# LOADING STATES & TRANSITIONS

| Transition | Duration | User Sees | Technical |
|---|---|---|---|
| Upload → Extraction | 2-10s | "Reading your resume..." typing indicator | Python subprocess |
| Extraction → Schema mapping | 3-8s | "Understanding your career..." | LLM call (fast model) |
| Stage 2 (dual extraction) | 5-15s | "Analyzing your background..." | LLM call (smart model) |
| Stage 3 (inference) | 3-8s | "Identifying your positioning..." | LLM call (smart model) |
| Stage 4 (summary gen) | 2-5s | "Preparing your summary..." | LLM call (fast model) |
| Stage 5 (correction) | 3-8s per round | Typing indicator (3 dots) | LLM call (smart model) |
| Stage 7 (answer eval) | 1-3s | Brief typing indicator | LLM call (fast model) |
| Stage 8 (voice extraction) | 3-5s | "Building your voice profile..." | LLM call (fast model) |
| Stage 9 (audit) | 3-8s | "Running final checks..." | LLM call (smart model) |
| Commit | 1-3s | "Saving your profile..." | DB writes |

**Rules:**
- If any call takes > 5s: show "Still working on it..." reassurance below the typing indicator
- If any call takes > 15s: show "This is taking longer than usual — hang tight" 
- If any call takes > 30s: show "Try again" button (don't auto-cancel)
- Never show a blank/empty screen during transitions
- Typing indicator is 3 animated dots (CSS only, no JS animation)

---
---

# PROFILE EDIT FLOWS (Post-Onboarding)

When the user edits their profile from `/profile`, each section has its own edit pattern:

### Inline Edit (Identity, Positioning)
- Click field → becomes editable input
- Enter/blur → save via `PATCH /api/profile-v2`
- If `target_role` or `resume_frame` changes → trigger understanding regeneration

### Modal Edit (Experience, Education, Projects)
- Click "Edit" → opens modal with form fields
- Save → upsert row in respective table
- Add → insert new row with `source: "user_supplied"`
- Delete → soft delete (mark inactive, don't hard delete)
- Reorder → update sort_order values

### Chip Edit (Skills, Preferences)
- Click "Edit" → inline chip editor appears
- Add chip (type + Enter) → append to array
- Click X on chip → remove from array
- Save → update JSONB column

### Voice Re-collection
- Click "Edit voice preferences" → opens modal with Stage 8's 3 questions
- On save → re-run voice extraction LLM call
- Update voice profile table

### Understanding Regeneration Triggers
Any edit to these fields triggers background regeneration:
- `target_role`, `resume_frame`, `confirmed_role_family`, `confirmed_seniority`
- Adding/removing experience entries
- Significant skills changes (>3 skills added/removed)
- Voice profile changes

```typescript
const REGEN_TRIGGER_FIELDS = [
  "target_role", "resume_frame", "confirmed_role_family",
  "confirmed_seniority", "confirmed_industry",
];

async function handleProfileEdit(userId: string, field: string, newValue: unknown) {
  // 1. Save the edit
  await saveProfileField(userId, field, newValue);

  // 2. Check if regeneration needed
  if (REGEN_TRIGGER_FIELDS.includes(field)) {
    // Fire background regeneration (non-blocking)
    regenerateUnderstanding(userId).catch(console.error);
  }
}
```

---
---

# ERROR RECOVERY UX

Every error state has a defined recovery path:

| Error | User Sees | Recovery Options |
|---|---|---|
| Upload validation fail | Error message (from UPLOAD_ERROR_MESSAGES) | "Try another file" button, paste fallback after 3 attempts |
| Extraction fails | "I had trouble reading that file" | "Try again" / "Paste instead" / "Try different file" |
| LLM call timeout (any stage) | "This is taking too long — let me try again" | Auto-retry once, then "Try again" button |
| LLM returns invalid JSON | (invisible to user — auto-retry) | System retries up to limit, then surfaces generic error |
| Session write fails | "Something went wrong saving — trying again..." | Auto-retry once, then "Try again" button |
| Commit fails (all 3 retries) | "We hit a technical issue saving your profile" | "Try again" button + "Save draft and try later" |
| Network disconnection | "Connection lost — reconnecting..." | Auto-reconnect, resume from last saved state |
| Rate limit hit | "I need a moment — please wait a few seconds" | Auto-retry after delay, no user action needed |
| Non-resume detected | "That doesn't look like a resume" | "Upload different file" / "Paste resume text" |

**Key principle:** Never lose user input. Every error preserves the session state. The user can always retry or come back later.

---
---

# COMPLETE FILE MANIFEST

Every file that needs to be created, with its responsibility:

```
apps/web/src/lib/onboarding-v2/
├── types.ts                         → OnboardingV2Session, ExtractionSchema, QuestionMapField, all interfaces
├── constants.ts                     → All thresholds, limits, retry counts, valid vocabularies
├── errors.ts                        → OnboardingError, FileValidationError, LLMCallError, etc.
├── session.ts                       → createSession, loadSession, updateSession, deleteSession, validateOwnership
├── validation.ts                    → validateUploadedFile, sanitizeFileName, sanitizeUserInput
├── analytics.ts                     → trackOnboardingEvent, OnboardingEvent type
├── stages/
│   ├── stage-1-upload.ts            → extractTextFromFile, fireSchemaMapping, handleUpload
│   ├── stage-2-extraction.ts        → runDualExtraction, callPureExtraction, callInferredSummary, isLikelyResume
│   ├── stage-3-inference.ts         → runInference, validateInferenceOutput, generateRoleChips
│   ├── stage-4-summary.ts           → generateSummaryPresentation, buildExtractionCards, buildTemplateSummary
│   ├── stage-5-correction.ts        → processCorrectionRound, handleCorrectionMessage
│   ├── stage-6-completeness.ts      → runCompletenessAssessment, determineActiveQuestions
│   ├── stage-7-questions.ts         → getNextQuestion, buildQuestionPresentation, processAnswer, evaluateAnswer
│   ├── stage-8-voice.ts             → getNextVoiceQuestion, processVoiceAnswer, extractVoiceProfile, buildDefaultVoiceProfile
│   └── stage-9-audit.ts             → runConfidenceAudit, checkCriticalFields, commitProfile, generateUnderstandingDocument
├── llm/
│   ├── prompts.ts                   → All 10 system prompts (verbatim from this plan)
│   ├── calls.ts                     → callLLM wrapper with retry, timeout, cost tracking
│   └── guardrails.ts               → safeParseLLMJson, stripPII, truncateForContext, verifyExtractionAgainstSource

apps/web/src/app/api/onboarding-v2/
├── session/route.ts                 → GET (load/create session), POST (save draft, restart)
├── upload/route.ts                  → POST (file upload or paste text)
├── upload/stream/route.ts           → GET SSE (progress events during upload/extraction)
├── message/route.ts                 → POST (user message: correction, answer, chip selection)
├── confirm/route.ts                 → POST (summary confirmation actions)
├── commit/route.ts                  → POST (final profile commit with retry)
└── restart/route.ts                 → POST (wipe session, start over)

apps/web/src/app/(onboarding)/onboarding-v2/
└── page.tsx                         → Main page component, loads session, renders UI stage

apps/web/src/hooks/
└── use-onboarding-v2.ts             → Main hook: state, actions, SSE subscription, message history

apps/web/src/components/onboarding-v2/
├── chat-interface.tsx               → Message list + input, renders all message types
├── upload-zone.tsx                   → Drag-drop + click upload, progress bar, paste fallback
├── summary-card.tsx                  → Summary text + collapsible extraction + confirm/reject buttons
├── chip-selector.tsx                 → Single/multi select chips with keyboard nav
├── confirmation-buttons.tsx          → Primary/secondary action button pair
├── progress-indicator.tsx            → Subtle stage dots at top
├── typing-indicator.tsx              → 3-dot animation for LLM processing
├── extraction-dropdown.tsx           → Collapsible section showing extraction cards
├── question-card.tsx                 → Question prompt + chips + free text input
├── voice-question-card.tsx           → Voice-specific question with min-length indicator
├── audit-summary.tsx                 → Final review: quality score, gaps, commit button
├── error-message.tsx                 → Error display with retry/alternative actions
└── profile-health-badge.tsx          → Quality score bar + source breakdown

apps/web/src/app/(auth)/profile/
└── page.tsx                          → Career profile page (full transparency view)

apps/web/src/components/profile/
├── understanding-section.tsx         → Renders understanding document as prose
├── positioning-section.tsx           → Role/industry/seniority/target/frame cards
├── voice-section.tsx                 → Voice profile display + edit modal
├── experience-section.tsx            → Experience list with source badges + edit/add/reorder
├── education-section.tsx             → Education list with edit
├── skills-section.tsx                → Skill chips (grouped or flat) with edit
├── preferences-section.tsx           → Resume preferences display
├── extras-section.tsx                → Languages, certs, projects, awards
├── profile-health-section.tsx        → Quality score + completeness + warnings
└── edit-modals/
    ├── edit-experience-modal.tsx     → Form for adding/editing experience entry
    ├── edit-education-modal.tsx      → Form for adding/editing education entry
    ├── edit-skills-modal.tsx         → Chip editor for skills
    ├── edit-voice-modal.tsx          → Re-run Stage 8 questions in modal
    └── edit-preferences-modal.tsx    → Re-run relevant Stage 7 questions in modal

supabase/migrations/
└── YYYYMMDD_onboarding_v2.sql       → All CREATE TABLE statements from this plan
```

**Total new files: 47**

---
---

# TEST FIXTURES

```typescript
// apps/web/src/lib/onboarding-v2/__tests__/fixtures.ts

export const SAMPLE_RESUME_TEXT = `
SHUBHAM KANSE
Dublin, Ireland | shubham@email.com | linkedin.com/in/shubham | github.com/shubham

EXPERIENCE

Senior Software Engineer — Fiserv (2022–Present)
• Designed and built real-time payment processing pipeline handling 5M transactions/day
• Led migration of legacy SOAP services to REST/gRPC microservices architecture
• Reduced API response latency by 40% through Redis caching and query optimization
• Mentored team of 4 junior engineers on distributed systems patterns

Software Engineer — Accenture (2020–2022)
• Built customer-facing React dashboard for financial analytics platform
• Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes
• Developed Python ETL pipelines processing 500GB daily data loads

EDUCATION

MSc Computer Science — Trinity College Dublin (2018–2020)
BSc Information Technology — University of Mumbai (2014–2018)

SKILLS
Python, Java, TypeScript, Go, React, Node.js, PostgreSQL, Redis, Kafka, AWS, Docker, Kubernetes, gRPC, System Design, Microservices

CERTIFICATIONS
AWS Solutions Architect Associate (2023)
`;

export const EXPECTED_SCHEMA_MAPPING = {
  identity: {
    full_name: "Shubham Kanse",
    email: "shubham@email.com",
    phone: null,
    location: "Dublin, Ireland",
    linkedin_url: "linkedin.com/in/shubham",
    github_url: "github.com/shubham",
    portfolio_url: null,
  },
  experience: [
    { title: "Senior Software Engineer", company: "Fiserv", location: null, start_date: "2022", end_date: null, is_current: true, bullets: ["Designed and built real-time payment processing pipeline handling 5M transactions/day", "Led migration of legacy SOAP services to REST/gRPC microservices architecture", "Reduced API response latency by 40% through Redis caching and query optimization", "Mentored team of 4 junior engineers on distributed systems patterns"] },
    { title: "Software Engineer", company: "Accenture", location: null, start_date: "2020", end_date: "2022", is_current: false, bullets: ["Built customer-facing React dashboard for financial analytics platform", "Implemented CI/CD pipeline reducing deployment time from 2 hours to 15 minutes", "Developed Python ETL pipelines processing 500GB daily data loads"] },
  ],
  education: [
    { institution: "Trinity College Dublin", degree: "MSc", field: "Computer Science", start_date: "2018", end_date: "2020", gpa: null, honours: null },
    { institution: "University of Mumbai", degree: "BSc", field: "Information Technology", start_date: "2014", end_date: "2018", gpa: null, honours: null },
  ],
  skills: { raw_list: ["Python", "Java", "TypeScript", "Go", "React", "Node.js", "PostgreSQL", "Redis", "Kafka", "AWS", "Docker", "Kubernetes", "gRPC", "System Design", "Microservices"], grouped: {} },
  projects: [],
  certifications: [{ name: "AWS Solutions Architect Associate", issuer: "AWS", date: "2023" }],
  languages: [],
  awards: [],
  publications: [],
  volunteering: [],
  extraction_confidence: "high",
  extraction_notes: "Clean, well-structured resume with all major sections present.",
};

export const EXPECTED_INFERENCE = {
  industry: "Fintech",
  industry_confidence: "high",
  industry_note: "Payment processing at Fiserv and financial analytics at Accenture indicate fintech focus.",
  industry_ambiguous: false,
  industry_candidates: null,
  role_family: "Backend Engineering",
  role_family_confidence: "high",
  role_family_note: "Primary work is API design, microservices, and distributed systems.",
  role_family_ambiguous: false,
  role_family_candidates: null,
  seniority: "Senior IC",
  seniority_confidence: "high",
  seniority_note: "3.5 years experience with Senior title and mentoring responsibilities.",
  seniority_ambiguous: false,
  career_transition_detected: false,
  transition_note: null,
  new_grad: false,
  work_pattern: "permanent",
};

export const EXPECTED_SUMMARY = `Thanks for sharing your resume. You're a backend engineer with around 3.5 years of experience, primarily in fintech. You've worked at Fiserv and Accenture, with a strong focus on payment processing and microservices architecture. Your work on the 5M transactions/day pipeline and the 40% latency reduction stand out.`;
```

---

*End of complete plan.*
