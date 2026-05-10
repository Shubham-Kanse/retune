import { z } from "zod";
import { ConfidenceSchema } from "./confidence";

/**
 * Evidence — the typed, sourced atom of all claims in the system.
 *
 * Every named entity, metric, scope claim, and verb that appears in any
 * generated document MUST trace back to one or more EvidenceSpan ids
 * (PRD §8.8 acceptance: ≥ 92% provenance verification rate).
 *
 * @brain hippocampus: episodic record bound to space/time/source
 */

export const SpanKindSchema = z.enum([
  "skill",
  "tool",
  "framework",
  "metric",
  "scope",
  "duration",
  "project",
  "compliance",
  "company",
  "role",
  "achievement",
  "verb",
  "domain",
  "leadership_signal",
  "named_system",
]);
export type SpanKind = z.infer<typeof SpanKindSchema>;

export const SourceDocKindSchema = z.enum([
  "profile",
  "resume_upload",
  "github_pr",
  "github_readme",
  "linkedin_about",
  "linkedin_post",
  "rec_letter",
  "blog_post",
  "talk_transcript",
  "interview_transcript",
  "user_attestation",
  "rendered_document",
]);
export type SourceDocKind = z.infer<typeof SourceDocKindSchema>;

export const EvidenceProvenanceSchema = z.enum([
  "user_attested",
  "extracted",
  "inferred",
  "third_party",
]);
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const EvidenceSpanSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  source_doc_id: z.string().uuid(),
  source_doc_kind: SourceDocKindSchema,
  span_kind: SpanKindSchema,
  text: z.string().min(1),
  char_start: z.number().int().nonnegative(),
  char_end: z.number().int().nonnegative(),
  payload: z.record(z.string(), z.unknown()),
  confidence: ConfidenceSchema,
  extracted_by: z.string(), // model name + version, e.g. "gliner-multitask-large@0.4.0"
  extracted_at: z.string().datetime(),
  user_attested: z.boolean().default(false),
  provenance: EvidenceProvenanceSchema,
});
export type EvidenceSpan = z.infer<typeof EvidenceSpanSchema>;

/**
 * A claim is something we are about to assert in a generated document.
 * It must be grounded in ≥ 1 EvidenceSpan.
 */
export const ClaimSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  evidence_span_ids: z.array(z.string().uuid()).min(1),
  confidence: ConfidenceSchema,
  claim_kind: z.enum([
    "metric",
    "scope",
    "leadership",
    "technical_depth",
    "duration",
    "named_entity",
    "achievement",
    "skill_usage",
  ]),
});
export type Claim = z.infer<typeof ClaimSchema>;
