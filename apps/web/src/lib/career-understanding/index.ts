// ─── Client-safe exports ─────────────────────────────────────────────────────
// Only types, Zod schemas, fingerprint helpers, and the patch helper are safe
// to import in client components. Everything else pulls in Node.js-only deps.

export {
  CAREER_UNDERSTANDING_VERSION,
  type CareerUnderstandingV1,
  type UnderstandingSection,
  type UnderstandingScope,
  type UnderstandingSummary,
  type PositioningModel,
  type PositioningOption,
  type EvidenceMap,
  type EvidenceSignal,
  type EvidenceRef,
  type EvidenceRefSource,
  type ResumeFuelModel,
  type ResumeFuelItem,
  type ResumeFuelSection,
  type UnderstandingFeedback,
  type UnderstandingFeedbackNote,
  type CareerUnderstandingPatch,
  type CareerUnderstandingSlice,
  type CareerUnderstandingRecord,
  type UnderstandingIntentPreset,
} from "./types";

export {
  careerUnderstandingSchema,
  careerUnderstandingPatchSchema,
  careerUnderstandingSliceSchema,
  careerUnderstandingAiOutputSchema,
  type CareerUnderstandingAiOutput,
  understandingSummarySchema,
  positioningModelSchema,
  positioningOptionSchema,
  evidenceMapSchema,
  evidenceSignalSchema,
  evidenceRefSchema,
  resumeFuelModelSchema,
  resumeFuelItemSchema,
  understandingFeedbackSchema,
  understandingScopeSchema,
  understandingSectionSchema,
  isCareerUnderstandingV1,
  assertCareerUnderstandingV1,
  emptyCareerUnderstanding,
} from "./schema";

export {
  careerProfileFingerprint,
  isUnderstandingStale,
  stableStringify,
} from "./fingerprint";

export { applyCareerUnderstandingPatch, buildSliceForPatch } from "./patch";

// ─── Server-only modules (do NOT import through this barrel) ─────────────────
// Import these directly in API routes and server components:
//
//   @/lib/career-understanding/service        — imports @retune/agent/web (postgres)
//   @/lib/career-understanding/context        — used only by service
//   @/lib/career-understanding/prompt         — used only by service
//   @/lib/career-understanding/guardrails     — used only by service
//   @/lib/career-understanding/preview-token  — server-only JWT signing
//   @/lib/career-understanding/repository     — imports @/lib/supabase/server (next/headers)
