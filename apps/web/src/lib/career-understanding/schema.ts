/**
 * Zod schema for CareerUnderstandingV1.
 *
 * All arrays and strings are bounded to keep AI output sane and to prevent
 * payload abuse. Caps come straight from the technical spec (§5.4).
 */

import { z } from "zod";
import {
  CAREER_UNDERSTANDING_VERSION,
  type CareerUnderstandingPatch,
  type CareerUnderstandingV1,
} from "./types";

const HEADLINE_MAX = 160;
const NARRATIVE_MAX = 900;
const LABEL_MAX = 200;
const TITLE_MAX = 120;
const DESCRIPTION_MAX = 600;
const _INSTRUCTION_MAX = 2000;
const QUOTE_MAX = 500;
const PATH_MAX = 200;
const ID_MAX = 64;
const NOTE_INSTR_MAX = 2000;

const POSITIONING_MAX = 5;
const EVIDENCE_PER_GROUP_MAX = 24;
const EVIDENCE_REFS_PER_NODE_MAX = 12;
const RESUME_FUEL_GROUP_MAX = 12;
const STRING_LIST_MAX = 12;
const CAVEAT_MAX = 8;
const NOTES_MAX = 32;

export const evidenceRefSourceSchema = z.enum(["resume", "user", "ai_inferred", "system"]);

export const evidenceRefSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  profilePath: z.string().min(1).max(PATH_MAX),
  source: evidenceRefSourceSchema,
  label: z.string().min(1).max(LABEL_MAX),
  quote: z.string().max(QUOTE_MAX).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const understandingSummarySchema = z.object({
  headline: z.string().min(1).max(HEADLINE_MAX),
  narrative: z.string().min(1).max(NARRATIVE_MAX),
  confidenceLabel: z.enum(["low", "medium", "high"]),
  caveats: z.array(z.string().min(1).max(LABEL_MAX)).max(CAVEAT_MAX).default([]),
  sourceRefs: z.array(evidenceRefSchema).max(EVIDENCE_REFS_PER_NODE_MAX).default([]),
  confirmed: z.boolean().default(false),
});

export const positioningOptionSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  kind: z.enum(["primary", "alternative", "stretch"]),
  title: z.string().min(1).max(TITLE_MAX),
  description: z.string().min(1).max(DESCRIPTION_MAX),
  bestFor: z.array(z.string().min(1).max(LABEL_MAX)).max(STRING_LIST_MAX).default([]),
  emphasize: z.array(z.string().min(1).max(LABEL_MAX)).max(STRING_LIST_MAX).default([]),
  deEmphasize: z.array(z.string().min(1).max(LABEL_MAX)).max(STRING_LIST_MAX).default([]),
  risks: z.array(z.string().min(1).max(LABEL_MAX)).max(STRING_LIST_MAX).default([]),
  evidenceRefs: z.array(evidenceRefSchema).max(EVIDENCE_REFS_PER_NODE_MAX).default([]),
  userDecision: z.enum(["accepted", "rejected", "use_sometimes", "undecided"]).default("undecided"),
});

export const positioningModelSchema = z.object({
  selectedId: z.string().max(ID_MAX).nullable(),
  options: z.array(positioningOptionSchema).max(POSITIONING_MAX).default([]),
});

export const evidenceSignalSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  label: z.string().min(1).max(LABEL_MAX),
  interpretation: z.string().min(1).max(DESCRIPTION_MAX),
  strength: z.enum(["strong", "medium", "weak"]),
  sourceRefs: z.array(evidenceRefSchema).max(EVIDENCE_REFS_PER_NODE_MAX).default([]),
  actionHint: z.string().max(LABEL_MAX).optional(),
});

export const evidenceMapSchema = z.object({
  strongestSignals: z.array(evidenceSignalSchema).max(EVIDENCE_PER_GROUP_MAX).default([]),
  supportingSignals: z.array(evidenceSignalSchema).max(EVIDENCE_PER_GROUP_MAX).default([]),
  weakSignals: z.array(evidenceSignalSchema).max(EVIDENCE_PER_GROUP_MAX).default([]),
  inferredUnconfirmed: z.array(evidenceSignalSchema).max(EVIDENCE_PER_GROUP_MAX).default([]),
});

export const resumeFuelItemSchema = z.object({
  id: z.string().min(1).max(ID_MAX),
  label: z.string().min(1).max(LABEL_MAX),
  whyItMatters: z.string().min(1).max(DESCRIPTION_MAX),
  section: z.enum([
    "identity",
    "experience",
    "education",
    "skills",
    "projects",
    "career_intent",
    "writing_preferences",
  ]),
  severity: z.enum(["info", "warning", "blocker"]),
  sourceRefs: z.array(evidenceRefSchema).max(EVIDENCE_REFS_PER_NODE_MAX).default([]),
});

export const resumeFuelModelSchema = z.object({
  ready: z.array(resumeFuelItemSchema).max(RESUME_FUEL_GROUP_MAX).default([]),
  needsSharpening: z.array(resumeFuelItemSchema).max(RESUME_FUEL_GROUP_MAX).default([]),
  risks: z.array(resumeFuelItemSchema).max(RESUME_FUEL_GROUP_MAX).default([]),
  suggestedNextEdits: z.array(resumeFuelItemSchema).max(RESUME_FUEL_GROUP_MAX).default([]),
});

export const understandingSectionSchema = z.enum([
  "summary",
  "positioning",
  "evidence",
  "resume_fuel",
  "skills_interpretation",
  "resume_strategy",
]);

export const understandingScopeSchema = z.enum([
  "summary",
  "selected_positioning",
  "all_positioning",
  "evidence_map",
  "resume_fuel",
  "skills_interpretation",
  "resume_strategy",
  "everything_affected",
]);

export const understandingFeedbackNoteSchema = z.object({
  section: understandingSectionSchema,
  instruction: z.string().min(1).max(NOTE_INSTR_MAX),
  createdAt: z.string().min(1),
});

export const understandingFeedbackSchema = z.object({
  summary: z.enum(["accurate", "not_quite", "different_angle_requested"]).nullable().default(null),
  rejectedPositioningIds: z.array(z.string().min(1).max(ID_MAX)).max(POSITIONING_MAX).default([]),
  preferredPositioningIds: z.array(z.string().min(1).max(ID_MAX)).max(POSITIONING_MAX).default([]),
  notes: z.array(understandingFeedbackNoteSchema).max(NOTES_MAX).default([]),
});

export const careerUnderstandingSchema = z.object({
  schemaVersion: z.literal(CAREER_UNDERSTANDING_VERSION),
  id: z.string().min(1).max(ID_MAX),
  userId: z.string().min(1).max(128),
  profileId: z.string().min(1).max(128).nullable(),
  sourceProfileVersion: z.string().min(1).max(64),
  sourceProfileFingerprint: z.string().min(1).max(128),
  revision: z.number().int().min(0),
  status: z.enum(["draft", "active", "stale", "archived"]),
  summary: understandingSummarySchema,
  positioning: positioningModelSchema,
  evidenceMap: evidenceMapSchema,
  resumeFuel: resumeFuelModelSchema,
  userFeedback: understandingFeedbackSchema,
  generatedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  staleSince: z.string().min(1).nullable(),
});

/** AI-only output shape — server fills metadata. */
export const careerUnderstandingAiOutputSchema = z.object({
  summary: understandingSummarySchema,
  positioning: positioningModelSchema,
  evidenceMap: evidenceMapSchema,
  resumeFuel: resumeFuelModelSchema,
});

export type CareerUnderstandingAiOutput = z.infer<typeof careerUnderstandingAiOutputSchema>;

export const careerUnderstandingPatchSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("summary"), summary: understandingSummarySchema }),
  z.object({ section: z.literal("positioning"), positioning: positioningModelSchema }),
  z.object({ section: z.literal("evidence"), evidenceMap: evidenceMapSchema }),
  z.object({ section: z.literal("resume_fuel"), resumeFuel: resumeFuelModelSchema }),
  z.object({
    section: z.literal("multiple"),
    summary: understandingSummarySchema.optional(),
    positioning: positioningModelSchema.optional(),
    evidenceMap: evidenceMapSchema.optional(),
    resumeFuel: resumeFuelModelSchema.optional(),
  }),
]);

export const careerUnderstandingSliceSchema = z.object({
  summary: understandingSummarySchema.optional(),
  positioning: positioningModelSchema.optional(),
  evidenceMap: evidenceMapSchema.optional(),
  resumeFuel: resumeFuelModelSchema.optional(),
});

export function isCareerUnderstandingV1(value: unknown): value is CareerUnderstandingV1 {
  return careerUnderstandingSchema.safeParse(value).success;
}

export function assertCareerUnderstandingV1(
  value: unknown,
): asserts value is CareerUnderstandingV1 {
  const parsed = careerUnderstandingSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Invalid CareerUnderstandingV1: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`,
    );
  }
}

/**
 * A blank-but-valid CareerUnderstandingV1 used as the default state in the
 * UI before any AI generation has been requested.
 */
export function emptyCareerUnderstanding(params: {
  userId: string;
  profileId?: string | null;
  sourceProfileVersion?: string;
  sourceProfileFingerprint?: string;
  generatedAt?: string;
}): CareerUnderstandingV1 {
  const now = params.generatedAt ?? new Date().toISOString();
  return {
    schemaVersion: CAREER_UNDERSTANDING_VERSION,
    id: "empty",
    userId: params.userId,
    profileId: params.profileId ?? null,
    sourceProfileVersion: params.sourceProfileVersion ?? "career-profile-v1",
    sourceProfileFingerprint: params.sourceProfileFingerprint ?? "empty",
    revision: 0,
    status: "draft",
    summary: {
      headline: "Retune has not built an interpretation of your career yet.",
      narrative:
        "Retune needs your profile facts before it can describe how it understands your career. Add your resume or fill in the profile details, then generate the first read.",
      confidenceLabel: "low",
      caveats: [],
      sourceRefs: [],
      confirmed: false,
    },
    positioning: { selectedId: null, options: [] },
    evidenceMap: {
      strongestSignals: [],
      supportingSignals: [],
      weakSignals: [],
      inferredUnconfirmed: [],
    },
    resumeFuel: { ready: [], needsSharpening: [], risks: [], suggestedNextEdits: [] },
    userFeedback: {
      summary: null,
      rejectedPositioningIds: [],
      preferredPositioningIds: [],
      notes: [],
    },
    generatedAt: now,
    updatedAt: now,
    staleSince: null,
  };
}

export type CareerUnderstandingPatchSchema = z.infer<typeof careerUnderstandingPatchSchema>;

// Compile-time check that the inferred type matches the hand-written union.
type _PatchAlignment = CareerUnderstandingPatchSchema extends CareerUnderstandingPatch
  ? CareerUnderstandingPatch extends CareerUnderstandingPatchSchema
    ? true
    : never
  : never;
const _patchAlignmentCheck: _PatchAlignment = true;
void _patchAlignmentCheck;
