import { z } from "zod";
import { BetaPriorSchema, ConfidenceSchema } from "./confidence";
import { ConflictRecordSchema } from "./conflict";
import { ClaimSchema } from "./evidence";
import { GoalSchema } from "./goal";
import { NarrativeArcCandidateSchema } from "./narrative-arc";

/**
 * Blackboard — the cognitive workbench's working-memory store.
 *
 * Every specialist reads and writes to this transactional, typed graph.
 * Writes emit events on the trigger bus that subscribed monitors and
 * specialists react to. The full audit trail is replay-able for debugging,
 * provenance, and GDPR Article 22 disclosure (PRD §12.4).
 *
 * @brain dorsolateral PFC: working memory + active maintenance
 */

// ───────────────────────── Hypotheses ─────────────────────────
//
// Each comprehension specialist writes its calibrated belief here.
// All fields are nullable until the specialist responsible has run.

export const RoleSchemaSchema = z.object({
  canonical_role_id: z.string(),
  display_name: z.string(),
  family: z.string(),
  level: z.string(),
  yoe_band: z.tuple([z.number(), z.number()]),
  archetype: z.string().optional(),
  inflated: z.boolean(),
});

export const CompanySchemaSchema = z.object({
  canonical_company_id: z.string(),
  display_name: z.string(),
  tier: z.string(),
  funding_stage: z.string().optional(),
  hq_country: z.string().optional(),
  industries: z.array(z.string()),
  cultural_fingerprint: z.array(z.number()).length(8),
});

export const DiscourseFunctionSchema = z.enum([
  "filter",
  "actual_test",
  "aspiration",
  "culture",
  "legal",
  "boilerplate",
]);

export const DiscourseLabeledSentenceSchema = z.object({
  sentence_index: z.number().int().nonnegative(),
  text: z.string(),
  function: DiscourseFunctionSchema,
  importance: z.number().min(0).max(1),
});

export const HypothesesSchema = z.object({
  role_schema: RoleSchemaSchema.nullable(),
  company_schema: CompanySchemaSchema.nullable(),
  discourse_map: z.array(DiscourseLabeledSentenceSchema).nullable(),
  hidden_disqualifiers: z.array(z.string()).nullable(),
  desperation_index: ConfidenceSchema.nullable(),
  cultural_vector: z.array(z.number()).length(8).nullable(),
  candidate_credibility_prior: BetaPriorSchema.nullable(),
  voice_fingerprint: z.array(z.number()).nullable(),
  honesty_calibration: z.record(z.string(), z.number()).nullable(),
  narrative_arcs_candidates: z.array(NarrativeArcCandidateSchema).default([]),
  chosen_narrative_arc: NarrativeArcCandidateSchema.nullable(),
});
export type Hypotheses = z.infer<typeof HypothesesSchema>;

// ───────────────────────── Evidence graph ─────────────────────

export const RequirementDispositionSchema = z.enum([
  "direct_hit",
  "implied_hit",
  "transferable",
  "missable",
  "must_address_in_cover_letter",
  "must_omit_from_application",
]);

export const RequirementMatchSchema = z.object({
  requirement_id: z.string(),
  requirement_text: z.string(),
  disposition: RequirementDispositionSchema,
  evidence_span_ids: z.array(z.string().uuid()),
  match_confidence: ConfidenceSchema,
});

export const EvidenceGraphSchema = z.object({
  span_ids: z.array(z.string().uuid()),
  requirement_matches: z.array(RequirementMatchSchema),
});
export type EvidenceGraph = z.infer<typeof EvidenceGraphSchema>;

// ───────────────────────── Draft state ────────────────────────

export const BulletDraftSchema = z.object({
  id: z.string().uuid(),
  section_id: z.string(),
  text: z.string(),
  template_family: z.enum(["CAR", "PAR", "XYZ", "STAR", "hybrid"]),
  verb_quality: z.enum(["weak", "standard", "strong", "elite"]),
  evidence_span_ids: z.array(z.string().uuid()).min(1),
  /** Resolved Claim ids that this bullet expresses. */
  claim_ids: z.array(z.string().uuid()).default([]),
  honesty_post_check_passed: z.boolean(),
  first_impression_passed: z.boolean(),
  coherence_post_check_passed: z.boolean(),
  voice_drift_cosine: z.number().min(-1).max(1),
  retry_count: z.number().int().nonnegative().default(0),
});
export type BulletDraft = z.infer<typeof BulletDraftSchema>;

export const SectionDraftSchema = z.object({
  id: z.string(),
  kind: z.enum(["skills", "experience", "summary", "education", "projects"]),
  bullet_ids: z.array(z.string().uuid()).default([]),
  rendered_text: z.string().optional(),
});
export type SectionDraft = z.infer<typeof SectionDraftSchema>;

export const DraftStateSchema = z.object({
  sections: z.record(z.string(), SectionDraftSchema),
  bullets: z.record(z.string(), BulletDraftSchema),
  claims: z.record(z.string(), ClaimSchema),
  pending_revisions: z.array(
    z.object({
      target: z.string(),
      reason: z.string(),
      requested_by: z.string(),
    }),
  ),
  /** Plain-text cover letter body written by CoverLetterComposer. */
  cover_letter_text: z.string().optional(),
  /** Structured markdown strategy document written by ApplicationStrategyComposer. */
  strategy_text: z.string().optional(),
});
export type DraftState = z.infer<typeof DraftStateSchema>;

// ───────────────────────── Cost budget ────────────────────────

export const CostBudgetSchema = z.object({
  spent_usd: z.number().nonnegative(),
  ceiling_usd: z.number().positive(),
  hard_kill_usd: z.number().positive(),
  per_specialist_spent: z.record(z.string(), z.number().nonnegative()).default({}),
});
export type CostBudget = z.infer<typeof CostBudgetSchema>;

// ───────────────────────── Audit trail ────────────────────────

export const AuditEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  specialist: z.string(),
  micro_stage: z.string().optional(),
  inputs_hash: z.string(),
  output_hash: z.string(),
  justification: z.string().optional(),
  model_version: z.string().optional(),
  latency_ms: z.number().nonnegative(),
  cost_usd: z.number().nonnegative(),
  timestamp: z.string().datetime(),
  /** Pointer into blackboard nodes that were written. */
  writes: z.array(z.string()).default([]),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

// ───────────────────────── Blackboard ─────────────────────────

export const BlackboardSchema = z.object({
  generation_id: z.string().uuid(),
  user_id: z.string().uuid(),
  jd_id: z.string().uuid(),
  market: z.enum(["US", "UK"]).default("US"),
  ontology_version: z.string(),
  goals: z.array(GoalSchema),
  hypotheses: HypothesesSchema,
  evidence_graph: EvidenceGraphSchema,
  draft: DraftStateSchema,
  conflicts: z.array(ConflictRecordSchema),
  outcome_estimate: ConfidenceSchema.nullable(),
  blocking_factors: z.array(z.string()).default([]),
  cost_budget: CostBudgetSchema,
  audit_trail: z.array(AuditEntrySchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Blackboard = z.infer<typeof BlackboardSchema>;

// ───────────────────────── Trigger bus event ──────────────────

/**
 * BlackboardEvent — emitted on every committed write.
 * Monitors and specialists subscribe by `path` glob.
 */
export const BlackboardEventSchema = z.object({
  type: z.enum(["write", "delete", "conflict_raised", "conflict_resolved", "goal_pushed"]),
  /** Dot-path into the blackboard, e.g. "draft.bullets.<id>" */
  path: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  by_specialist: z.string(),
  seq: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});
export type BlackboardEvent = z.infer<typeof BlackboardEventSchema>;
