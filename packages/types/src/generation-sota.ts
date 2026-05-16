/**
 * Generation SOTA contracts (003 upgrade).
 *
 * Authoritative source: docs/specs/003-generation-sota-upgrade/final-sota-technical-work-document.md.
 *
 * These schemas formalise the v3 blackboard nodes and the
 * StartGenerationCommand that the API and Temporal workflow share.
 *
 * Design principles:
 *
 *   - **Additive, not breaking.** The legacy `BlackboardSchema` (v2.0)
 *     remains the canonical write-target for every existing specialist.
 *     The v3 nodes are layered on top so the cognitive cycle can move
 *     forward incrementally.
 *
 *   - **Schema-first.** Every blackboard node is a Zod schema; runtime
 *     parse failures become typed conflicts rather than silent corruption.
 *
 *   - **Provenance by construction.** Every claim carries source and
 *     evidence ids; no generated line in the resume can outlive its
 *     ledger entry.
 *
 *   - **Article 22 ready.** The QualityBoard mirrors the gates the
 *     refuse/revise/ship logic emits, so the GDPR audit packet is a
 *     direct projection of the live blackboard, not a separate render.
 *
 * @brain DLPFC contract layer + ACC error-aware constraint enforcement
 */

import { z } from "zod";
import { ConfidenceSchema } from "./confidence";
import { GoalKindSchema } from "./goal";

// ─────────────────────────────────────────────────────────────────────────────
// 0. Common primitives
// ─────────────────────────────────────────────────────────────────────────────

export const SotaSchemaVersionSchema = z.literal("sota-v3");
export type SotaSchemaVersion = z.infer<typeof SotaSchemaVersionSchema>;

/**
 * BlackboardPath — typed dot-path into the blackboard graph.
 *
 * Used by goal prerequisites, claim allowed-uses, and audit writes.
 * Format mirrors `BlackboardEvent.path` (e.g. `draft.bullets.<id>`).
 */
export const BlackboardPathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_\-\.\*\[\]]+$/, {
    message: "blackboard path must contain only [A-Za-z0-9_-.*[]]",
  });
export type BlackboardPath = z.infer<typeof BlackboardPathSchema>;

export const SourceKindSchema = z.enum([
  "career_profile",
  "profile_markdown",
  "resume_upload",
  "user_message",
  "preflight_answer",
  "linkedin",
  "github",
  "company_research",
  "jd_text",
  "jd_url",
  "ai_inference",
  "system",
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceRecordSchema = z.object({
  /** Stable id within the user's data graph. */
  id: z.string().min(1),
  kind: SourceKindSchema,
  /** Optional pointer to the actual artifact (e.g. profile field path). */
  ref: BlackboardPathSchema.optional(),
  /** Free-form metadata (e.g. `{file_name: "resume.pdf", page: 1}`). */
  meta: z.record(z.string(), z.unknown()).default({}),
  /** ISO-8601 timestamp when the source was captured. */
  captured_at: z.string().datetime(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

/**
 * EvidenceQuote — a literal substring of a source artifact.
 *
 * Stored as a quote rather than a span pointer so the claim ledger
 * can be inspected without rejoining the evidence_graph table during
 * an Article 22 export.
 */
export const EvidenceQuoteSchema = z.object({
  source_id: z.string().min(1),
  quote: z.string().min(1).max(2_000),
  /** Optional 0-indexed character offsets into the source's text. */
  char_start: z.number().int().nonnegative().optional(),
  char_end: z.number().int().nonnegative().optional(),
  /** Confidence that the quote actually grounds the claim. */
  confidence: z.number().min(0).max(1),
});
export type EvidenceQuote = z.infer<typeof EvidenceQuoteSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 1. CandidateModel — durable working memory of the candidate
// ─────────────────────────────────────────────────────────────────────────────

export const IdentityFieldSchema = z.object({
  value: z.string().nullable(),
  source_ids: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  user_confirmed: z.boolean().default(false),
});
export type IdentityField = z.infer<typeof IdentityFieldSchema>;

export const CareerTimelineEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["role", "education", "project", "certification", "gap"]),
  title: z.string(),
  organization: z.string().nullable(),
  start_iso: z.string().nullable(),
  end_iso: z.string().nullable(),
  /** Anchor seniority level when known. */
  seniority: z
    .enum(["intern", "junior", "ic_mid", "ic_senior", "ic_staff", "manager", "director", "vp", "exec"])
    .nullable(),
  description: z.string().nullable(),
  source_ids: z.array(z.string()).default([]),
});
export type CareerTimelineEntry = z.infer<typeof CareerTimelineEntrySchema>;

export const SkillEvidenceTierSchema = z.enum([
  "claimed",
  "self_described",
  "third_party_attested",
  "demonstrated",
  "measured_outcome",
]);
export type SkillEvidenceTier = z.infer<typeof SkillEvidenceTierSchema>;

export const SkillInventoryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Canonicalised category (`technical`, `tool`, `methodology`, …). */
  category: z.string(),
  /** Years of usage if known. Decimals allowed. */
  years: z.number().nonnegative().nullable(),
  evidence_tier: SkillEvidenceTierSchema,
  source_ids: z.array(z.string()).default([]),
  recency_iso: z.string().nullable(),
});
export type SkillInventoryEntry = z.infer<typeof SkillInventoryEntrySchema>;

export const MetricInventoryEntrySchema = z.object({
  id: z.string().min(1),
  metric: z.string(),
  value: z.string(),
  unit: z.string().nullable(),
  context: z.string().nullable(),
  /** What outcome direction means improvement. */
  direction: z.enum(["increase", "decrease", "neutral"]).default("neutral"),
  /** Time window for the metric, ISO 8601 duration if known. */
  window: z.string().nullable(),
  source_ids: z.array(z.string()).default([]),
  user_confirmed: z.boolean().default(false),
});
export type MetricInventoryEntry = z.infer<typeof MetricInventoryEntrySchema>;

export const LeadershipInventoryEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.enum(["self", "small_team", "team", "multi_team", "org", "company"]),
  team_size: z.number().int().nonnegative().nullable(),
  budget_usd: z.number().nonnegative().nullable(),
  description: z.string(),
  source_ids: z.array(z.string()).default([]),
});
export type LeadershipInventoryEntry = z.infer<typeof LeadershipInventoryEntrySchema>;

export const PreferenceModelSchema = z.object({
  emphasis_areas: z.array(z.string()).default([]),
  de_emphasis_areas: z.array(z.string()).default([]),
  tone_signals: z.array(z.string()).default([]),
  style_constraints: z.array(z.string()).default([]),
  preferred_markets: z.array(z.string()).default([]),
  work_preference: z.enum(["remote", "hybrid", "onsite", "open", "unknown"]).default("unknown"),
  seniority_comfort: z.array(z.string()).default([]),
  industries_of_interest: z.array(z.string()).default([]),
  role_dealbreakers: z.array(z.string()).default([]),
});
export type PreferenceModel = z.infer<typeof PreferenceModelSchema>;

export const VoiceModelSchema = z.object({
  fingerprint: z.array(z.number()),
  fingerprint_dim: z.number().int().positive(),
  baseline_source_ids: z.array(z.string()).default([]),
  cohesion_drift_30d: z.number().nullable(),
});
export type VoiceModel = z.infer<typeof VoiceModelSchema>;

export const PriorPackageRefSchema = z.object({
  generation_id: z.string().uuid(),
  created_at: z.string().datetime(),
  verdict: z.enum(["ship", "revise", "refuse"]),
  ats_score: z.number().min(0).max(100).nullable(),
  callback: z.boolean().nullable(),
});
export type PriorPackageRef = z.infer<typeof PriorPackageRefSchema>;

export const EditMemorySchema = z.array(
  z.object({
    bullet_id: z.string(),
    diff: z.string(),
    accepted: z.boolean(),
    timestamp: z.string().datetime(),
  }),
);
export type EditMemory = z.infer<typeof EditMemorySchema>;

export const OutcomeMemorySchema = z.array(
  z.object({
    application_id: z.string().uuid(),
    outcome: z.enum([
      "submitted",
      "callback",
      "screen",
      "onsite",
      "offer",
      "rejection_with_reason",
      "rejection_without_reason",
      "ghosted",
    ]),
    delta_priority: z.number().nullable(),
    notes: z.string().nullable(),
    recorded_at: z.string().datetime(),
  }),
);
export type OutcomeMemory = z.infer<typeof OutcomeMemorySchema>;

export const CandidateModelSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  user_id: z.string().uuid(),
  identity: z.object({
    full_name: IdentityFieldSchema,
    email: IdentityFieldSchema,
    phone: IdentityFieldSchema,
    location: IdentityFieldSchema,
    linkedin: IdentityFieldSchema,
    github: IdentityFieldSchema,
    portfolio: IdentityFieldSchema,
  }),
  career_timeline: z.array(CareerTimelineEntrySchema).default([]),
  skill_inventory: z.array(SkillInventoryEntrySchema).default([]),
  metric_inventory: z.array(MetricInventoryEntrySchema).default([]),
  achievement_inventory: z.array(z.object({
    id: z.string(),
    text: z.string(),
    metric_ids: z.array(z.string()).default([]),
    source_ids: z.array(z.string()).default([]),
    defensibility: z.enum(["strong", "moderate", "weak", "unsafe"]),
  })).default([]),
  leadership_inventory: z.array(LeadershipInventoryEntrySchema).default([]),
  domain_inventory: z.array(z.string()).default([]),
  credential_inventory: z.array(z.object({
    id: z.string(),
    name: z.string(),
    issuer: z.string().nullable(),
    issued_iso: z.string().nullable(),
    source_ids: z.array(z.string()).default([]),
  })).default([]),
  preference_model: PreferenceModelSchema,
  voice_model: VoiceModelSchema.nullable(),
  edit_memory: EditMemorySchema.default([]),
  outcome_memory: OutcomeMemorySchema.default([]),
  prior_packages: z.array(PriorPackageRefSchema).default([]),
  /** Hard candidate constraints (work auth, geo, etc.) the gate must respect. */
  constraint_inventory: z.array(z.object({
    id: z.string(),
    kind: z.enum([
      "work_authorization",
      "location",
      "compensation",
      "schedule",
      "non_compete",
      "background_check",
      "security_clearance",
      "language",
      "other",
    ]),
    description: z.string(),
    is_dealbreaker: z.boolean().default(false),
    source_ids: z.array(z.string()).default([]),
  })).default([]),
  /** Optional opt-in flag for global learning (Section 19). */
  opt_in_global_learning: z.boolean().default(false),
  hydrated_at: z.string().datetime(),
});
export type CandidateModel = z.infer<typeof CandidateModelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 2. JobModel — deep job description cognition
// ─────────────────────────────────────────────────────────────────────────────

export const RequirementCriticalitySchema = z.enum([
  "hard_filter",
  "must_have",
  "strong_preference",
  "nice_to_have",
  "aspiration",
  "boilerplate",
]);
export type RequirementCriticality = z.infer<typeof RequirementCriticalitySchema>;

export const RequirementGroupOpSchema = z.enum(["AND", "OR", "AT_LEAST"]);
export type RequirementGroupOp = z.infer<typeof RequirementGroupOpSchema>;

export const RequirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  normalized: z.string(),
  criticality: RequirementCriticalitySchema,
  is_hard_filter: z.boolean(),
  group_id: z.string().nullable(),
  /** Yields-of-experience hints if extracted ("3+ years"). */
  years_min: z.number().nonnegative().nullable(),
  years_max: z.number().nonnegative().nullable(),
  /** Discourse function inferred for the source sentence. */
  discourse_function: z.enum([
    "filter",
    "actual_test",
    "aspiration",
    "culture",
    "legal",
    "boilerplate",
  ]),
  /** Source character span in the canonical JD text. */
  char_start: z.number().int().nonnegative().nullable(),
  char_end: z.number().int().nonnegative().nullable(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const RequirementGroupSchema = z.object({
  id: z.string().min(1),
  op: RequirementGroupOpSchema,
  /** For AT_LEAST(N), `min` is the satisfaction threshold. */
  min: z.number().int().positive().default(1),
  member_ids: z.array(z.string()).min(1),
});
export type RequirementGroup = z.infer<typeof RequirementGroupSchema>;

export const AtsKeywordSchema = z.object({
  id: z.string().min(1),
  surface: z.string().min(1),
  /** Normalised form used for coverage matching. */
  normalized: z.string().min(1),
  variants: z.array(z.string()).default([]),
  /** Where the JD wants this keyword to appear (heuristic). */
  preferred_section: z
    .enum(["summary", "skills", "experience", "projects", "education", "any"])
    .default("any"),
  weight: z.number().min(0).max(1).default(0.5),
});
export type AtsKeyword = z.infer<typeof AtsKeywordSchema>;

export const HiddenConstraintSchema = z.object({
  id: z.string().min(1),
  category: z.enum([
    "work_authorization",
    "security_clearance",
    "citizenship",
    "language",
    "education_min",
    "tenure_min",
    "background_check",
    "drug_test",
    "non_compete",
    "shift",
    "travel",
    "geo_lock",
    "other",
  ]),
  text: z.string(),
  severity: z.enum(["soft", "hard", "dealbreaker"]),
  source_quote: z.string().nullable(),
});
export type HiddenConstraint = z.infer<typeof HiddenConstraintSchema>;

export const ScorecardLineSchema = z.object({
  id: z.string().min(1),
  observer: z.enum(["recruiter", "hiring_manager", "ats", "interview_panel"]),
  rubric: z.string(),
  weight: z.number().min(0).max(1),
  pass_threshold: z.number().min(0).max(1).default(0.5),
});
export type ScorecardLine = z.infer<typeof ScorecardLineSchema>;

export const JobModelSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  jd_id: z.string().uuid(),
  jd_hash: z.string(),
  canonical_text: z.string(),
  canonical_text_truncated: z.boolean().default(false),
  posting_source: z
    .enum(["workday", "lever", "greenhouse", "linkedin", "ashby", "ats_other", "url_unknown", "user_paste"])
    .default("user_paste"),
  role_title_normalized: z.string(),
  role_title_raw: z.string(),
  role_family: z.string().nullable(),
  seniority: z
    .enum(["intern", "junior", "ic_mid", "ic_senior", "ic_staff", "manager", "director", "vp", "exec"])
    .nullable(),
  yoe_band: z.tuple([z.number(), z.number()]).nullable(),
  market: z.enum(["US", "UK"]).default("US"),
  language: z.string().default("en"),
  requirements: z.array(RequirementSchema).default([]),
  requirement_groups: z.array(RequirementGroupSchema).default([]),
  hard_filters: z.array(z.string()).default([]),
  soft_preferences: z.array(z.string()).default([]),
  ats_keywords: z.array(AtsKeywordSchema).default([]),
  hidden_constraints: z.array(HiddenConstraintSchema).default([]),
  recruiter_scorecard: z.array(ScorecardLineSchema).default([]),
  hiring_manager_scorecard: z.array(ScorecardLineSchema).default([]),
  interview_topics: z.array(z.string()).default([]),
  compensation_signals: z.array(z.string()).default([]),
  location_constraints: z.array(z.string()).default([]),
  work_authorization_constraints: z.array(z.string()).default([]),
  posting_noise_score: z.number().min(0).max(1).default(0),
  built_at: z.string().datetime(),
});
export type JobModel = z.infer<typeof JobModelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 3. CompanyModel — current company / team / product context
// ─────────────────────────────────────────────────────────────────────────────

export const CompanyResearchCitationSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  /** Snippet pulled from the page. */
  snippet: z.string().nullable(),
  fetched_at: z.string().datetime(),
});
export type CompanyResearchCitation = z.infer<typeof CompanyResearchCitationSchema>;

export const CompanyModelSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  canonical_company_id: z.string(),
  display_name: z.string(),
  industry: z.string().nullable(),
  product_lines: z.array(z.string()).default([]),
  size_band: z
    .enum(["seed", "pre_a", "series_a", "series_b", "series_c_plus", "public", "private_late_stage", "non_profit", "gov", "unknown"])
    .default("unknown"),
  hq_country: z.string().nullable(),
  business_priorities: z.array(z.string()).default([]),
  technology_signals: z.array(z.string()).default([]),
  hiring_bar: z.enum(["broad", "competitive", "selective", "elite"]).nullable(),
  recruiter_style: z.enum(["fast", "rigorous", "process_heavy", "consultative", "unknown"]).default("unknown"),
  culture_vector: z.array(z.number()).length(8).nullable(),
  risk_signals: z.array(z.string()).default([]),
  citations: z.array(CompanyResearchCitationSchema).default([]),
  /** ISO 8601 timestamp of the freshest signal in this snapshot. */
  freshness_iso: z.string().datetime(),
  /** Set when this snapshot is older than the configured TTL. */
  stale: z.boolean().default(false),
  fetch_consent: z.boolean().default(false),
});
export type CompanyModel = z.infer<typeof CompanyModelSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 4. ApplicationContext — per-generation knobs/config
// ─────────────────────────────────────────────────────────────────────────────

export const QualityModeSchema = z.enum(["fast", "balanced", "frontier"]);
export type QualityMode = z.infer<typeof QualityModeSchema>;

export const OutputArtifactSchema = z.enum([
  "resume",
  "cover_letter",
  "linkedin",
  "outreach",
  "strategy",
]);
export type OutputArtifact = z.infer<typeof OutputArtifactSchema>;

export const ApplicationContextSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  generation_id: z.string().uuid(),
  application_id: z.string().uuid().nullable(),
  market: z.enum(["US", "UK"]).default("US"),
  output_suite: z.array(OutputArtifactSchema).default(["resume"]),
  quality_mode: QualityModeSchema.default("balanced"),
  allow_company_web_research: z.boolean().default(false),
  allow_file_search: z.boolean().default(false),
  max_questions: z.number().int().nonnegative().max(10).default(3),
  /** Initial idempotency / dedupe key. */
  idempotency_key: z.string().min(1),
  preflight: z
    .object({
      preflight_id: z.string().min(1),
      verified: z.boolean().default(false),
      answers: z.array(z.unknown()).default([]),
    })
    .nullable(),
  consent: z.object({
    company_web_research: z.boolean().default(false),
    file_search: z.boolean().default(false),
    case_base_learning: z.boolean().default(false),
  }),
  created_at: z.string().datetime(),
});
export type ApplicationContext = z.infer<typeof ApplicationContextSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 5. ClaimLedger — the single source of provenance for all generated text
// ─────────────────────────────────────────────────────────────────────────────

export const ClaimKindSchema = z.enum([
  "skill",
  "metric",
  "scope",
  "leadership",
  "domain",
  "responsibility",
  "achievement",
  "credential",
  "preference",
  "constraint",
]);
export type ClaimKind = z.infer<typeof ClaimKindSchema>;

export const ClaimDefensibilitySchema = z.enum(["strong", "moderate", "weak", "unsafe"]);
export type ClaimDefensibility = z.infer<typeof ClaimDefensibilitySchema>;

export const ClaimAllowedUseSchema = z.enum([
  "resume",
  "cover_letter",
  "linkedin",
  "outreach",
  "strategy",
]);
export type ClaimAllowedUse = z.infer<typeof ClaimAllowedUseSchema>;

export const SotaClaimSchema = z.object({
  id: z.string().min(1),
  kind: ClaimKindSchema,
  text: z.string().min(1),
  /** Lowercased + whitespace-collapsed form for dedupe. */
  normalized_text: z.string().min(1),
  source_ids: z.array(z.string().min(1)).default([]),
  evidence_quotes: z.array(EvidenceQuoteSchema).default([]),
  /** [0,1]; below 0.4 → marked weak; below 0.2 → unsafe. */
  confidence: z.number().min(0).max(1),
  verified_by_user: z.boolean().default(false),
  defensibility: ClaimDefensibilitySchema,
  /** Sentence the system would pose to test the claim in interview. */
  interview_defense_prompt: z.string().min(1),
  allowed_uses: z.array(ClaimAllowedUseSchema).default([]),
  forbidden_uses: z.array(z.string()).default([]),
  created_at: z.string().datetime(),
});
export type SotaClaim = z.infer<typeof SotaClaimSchema>;

/**
 * The ClaimLedger is the durable provenance store for a single generation.
 *
 * `locked === true` after the strategy phase is frozen; downstream
 * production specialists may only consume claims, never insert.
 */
export const ClaimLedgerSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  generation_id: z.string().uuid(),
  claims: z.array(SotaClaimSchema).default([]),
  locked: z.boolean().default(false),
  locked_at: z.string().datetime().nullable(),
  /**
   * Hash of the locked claim list. Downstream production verifies
   * against this so a bug that mutates the ledger after lock is detected.
   */
  locked_hash: z.string().nullable(),
});
export type ClaimLedger = z.infer<typeof ClaimLedgerSchema>;

export const emptyClaimLedger = (generation_id: string): ClaimLedger => ({
  schema_version: "sota-v3",
  generation_id,
  claims: [],
  locked: false,
  locked_at: null,
  locked_hash: null,
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. QuestionPlan — minimal-question active interview
// ─────────────────────────────────────────────────────────────────────────────

export const ProofQuestionSchema = z.object({
  id: z.string().min(1),
  question_text: z.string().min(1).max(2_000),
  /** What blackboard node the answer is meant to update. */
  target_path: BlackboardPathSchema,
  /** Linked claim or requirement id, if any. */
  links: z.array(z.string()).default([]),
  /** Estimated value-of-information. */
  expected_value: z.number().min(0).max(1),
  /** Cost (e.g. fraction of question budget) of asking. */
  cost: z.number().min(0).max(1).default(0.34),
  status: z.enum(["draft", "asked", "answered", "skipped", "expired"]).default("draft"),
  asked_at: z.string().datetime().nullable(),
  answered_at: z.string().datetime().nullable(),
  answer_text: z.string().nullable(),
});
export type ProofQuestion = z.infer<typeof ProofQuestionSchema>;

export const QuestionPlanSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  generation_id: z.string().uuid(),
  budget_remaining: z.number().int().nonnegative().default(3),
  questions: z.array(ProofQuestionSchema).default([]),
});
export type QuestionPlan = z.infer<typeof QuestionPlanSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 7. StrategyBoard
// ─────────────────────────────────────────────────────────────────────────────

export const NarrativeArchetypeSchema = z.object({
  id: z.string().min(1),
  thesis: z.string(),
  voice: z.string(),
  feasibility: z.number().min(0).max(1),
  truthfulness: z.number().min(0).max(1),
  callback_potential: z.number().min(0).max(1),
  description: z.string(),
});
export type NarrativeArchetype = z.infer<typeof NarrativeArchetypeSchema>;

export const SectionArchitectureSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["summary", "skills", "experience", "projects", "education"]),
  position: z.number().int().nonnegative(),
  bullet_budget: z.number().int().nonnegative(),
  notes: z.string().nullable(),
});
export type SectionArchitecture = z.infer<typeof SectionArchitectureSchema>;

export const StrategyBoardSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  generation_id: z.string().uuid(),
  positioning_options: z.array(z.string()).default([]),
  primary_arc_id: z.string().nullable(),
  backup_arc_id: z.string().nullable(),
  narrative_archetypes: z.array(NarrativeArchetypeSchema).default([]),
  section_architecture: z.array(SectionArchitectureSchema).default([]),
  keyword_placement_plan: z.array(z.object({
    keyword_id: z.string(),
    target_path: BlackboardPathSchema,
    weight: z.number().min(0).max(1),
  })).default([]),
  /** What to emphasise / de-emphasise / omit / address externally. */
  emphasis: z.array(z.string()).default([]),
  de_emphasis: z.array(z.string()).default([]),
  omissions: z.array(z.string()).default([]),
  cover_letter_addressed: z.array(z.string()).default([]),
});
export type StrategyBoard = z.infer<typeof StrategyBoardSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 8. DraftVariant — tournament entry
// ─────────────────────────────────────────────────────────────────────────────

export const DraftFlavorSchema = z.enum([
  "ats_forward",
  "recruiter_scan_forward",
  "hiring_manager_depth_forward",
  "authentic_voice_forward",
  "conservative_truth_forward",
  "merged",
]);
export type DraftFlavor = z.infer<typeof DraftFlavorSchema>;

export const DraftScoreCardSchema = z.object({
  ats: z.number().min(0).max(1),
  recruiter: z.number().min(0).max(1),
  hiring_manager: z.number().min(0).max(1),
  voice: z.number().min(0).max(1),
  defensibility: z.number().min(0).max(1),
  formatting: z.number().min(0).max(1),
  market_fit: z.number().min(0).max(1),
  fairness: z.number().min(0).max(1),
});
export type DraftScoreCard = z.infer<typeof DraftScoreCardSchema>;

export const DraftVariantSchema = z.object({
  id: z.string().min(1),
  flavor: DraftFlavorSchema,
  /** Markdown body of this variant. */
  markdown: z.string(),
  /** Claim ids consumed by this variant. */
  claim_ids: z.array(z.string()).default([]),
  scores: DraftScoreCardSchema,
  total_score: z.number().min(0).max(1),
  red_team_findings: z.array(z.object({
    id: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    summary: z.string(),
    repaired: z.boolean().default(false),
  })).default([]),
  reason_won: z.string().nullable(),
  is_final: z.boolean().default(false),
  created_at: z.string().datetime(),
});
export type DraftVariant = z.infer<typeof DraftVariantSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 9. QualityBoard — the projection the gate consumes
// ─────────────────────────────────────────────────────────────────────────────

export const QualityCheckResultSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "ats_coverage",
    "first_screen_clarity",
    "recruiter_scan",
    "hiring_manager_depth",
    "evidence_provenance",
    "fabrication_risk",
    "voice_authenticity",
    "ai_smoothness_risk",
    "fairness_risk",
    "legal_risk",
    "interview_defensibility",
    "market_fit",
    "formatting_parseability",
    "render_integrity",
    "outcome_estimate",
    "claim_ledger_locked",
    "audit_completeness",
  ]),
  passed: z.boolean(),
  score: z.number().min(0).max(1).nullable(),
  severity: z.enum(["info", "low", "medium", "high", "critical"]).default("info"),
  evidence: z.string().nullable(),
  repair_action: z.string().nullable(),
  created_at: z.string().datetime(),
});
export type QualityCheckResult = z.infer<typeof QualityCheckResultSchema>;

export const QualityBoardSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  generation_id: z.string().uuid(),
  /** Aggregate scores. Each is null until the corresponding gate runs. */
  ats_coverage: z.number().min(0).max(1).nullable(),
  first_screen_score: z.number().min(0).max(100).nullable(),
  recruiter_screen_score: z.number().min(0).max(100).nullable(),
  hiring_manager_score: z.number().min(0).max(100).nullable(),
  evidence_provenance_rate: z.number().min(0).max(1).nullable(),
  fabrication_risk: z.number().min(0).max(1).nullable(),
  voice_authenticity: z.number().min(0).max(1).nullable(),
  ai_smoothness_risk: z.number().min(0).max(1).nullable(),
  fairness_risk: z.number().min(0).max(1).nullable(),
  legal_risk: z.number().min(0).max(1).nullable(),
  interview_defensibility: z.number().min(0).max(1).nullable(),
  market_fit: z.number().min(0).max(1).nullable(),
  formatting_parseability: z.number().min(0).max(1).nullable(),
  render_integrity: z.number().min(0).max(1).nullable(),
  outcome_estimate: ConfidenceSchema.nullable(),
  /** Verdict reason tree mirrors the gate's structured output. */
  verdict: z.enum(["pending", "ship", "revise", "refuse"]).default("pending"),
  reason_tree: z.array(z.object({
    code: z.string(),
    severity: z.enum(["info", "low", "medium", "high", "critical"]),
    description: z.string(),
    contributing_check_ids: z.array(z.string()).default([]),
  })).default([]),
  checks: z.array(QualityCheckResultSchema).default([]),
  updated_at: z.string().datetime(),
});
export type QualityBoard = z.infer<typeof QualityBoardSchema>;

export const emptyQualityBoard = (generation_id: string): QualityBoard => ({
  schema_version: "sota-v3",
  generation_id,
  ats_coverage: null,
  first_screen_score: null,
  recruiter_screen_score: null,
  hiring_manager_score: null,
  evidence_provenance_rate: null,
  fabrication_risk: null,
  voice_authenticity: null,
  ai_smoothness_risk: null,
  fairness_risk: null,
  legal_risk: null,
  interview_defensibility: null,
  market_fit: null,
  formatting_parseability: null,
  render_integrity: null,
  outcome_estimate: null,
  verdict: "pending",
  reason_tree: [],
  checks: [],
  updated_at: new Date(0).toISOString(),
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. RenderedApplicationPackage — the audited output of Phase H
// ─────────────────────────────────────────────────────────────────────────────

export const RenderedArtifactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "resume_markdown",
    "resume_docx",
    "resume_pdf",
    "cover_letter_markdown",
    "cover_letter_docx",
    "cover_letter_pdf",
    "linkedin_about",
    "outreach_message",
    "strategy_memo",
    "audit_packet_json",
    "audit_packet_pdf",
    "claim_provenance_map",
    "interview_defense_sheet",
  ]),
  /** Storage handle (e.g. URL or local path). */
  uri: z.string(),
  bytes: z.number().int().nonnegative().nullable(),
  sha256: z.string().nullable(),
  parseable: z.boolean(),
  rendered_at: z.string().datetime(),
});
export type RenderedArtifact = z.infer<typeof RenderedArtifactSchema>;

export const RenderedApplicationPackageSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  generation_id: z.string().uuid(),
  artifacts: z.array(RenderedArtifactSchema).default([]),
  finalized: z.boolean().default(false),
  finalized_at: z.string().datetime().nullable(),
});
export type RenderedApplicationPackage = z.infer<typeof RenderedApplicationPackageSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 11. LearningSignal — the input edge of NightlyConsolidator and friends
// ─────────────────────────────────────────────────────────────────────────────

export const LearningSignalKindSchema = z.enum([
  "user_edited_bullet",
  "user_deleted_bullet",
  "user_selected_alternate_arc",
  "user_contested_decision",
  "outcome_callback",
  "outcome_rejection",
  "outcome_offer",
  "outcome_ghosted",
  "recruiter_feedback",
  "interview_question_asked",
]);
export type LearningSignalKind = z.infer<typeof LearningSignalKindSchema>;

export const LearningSignalSchema = z.object({
  id: z.string().min(1),
  generation_id: z.string().uuid(),
  user_id: z.string().uuid(),
  kind: LearningSignalKindSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  recorded_at: z.string().datetime(),
});
export type LearningSignal = z.infer<typeof LearningSignalSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 12. StartGenerationCommand — the API↔Temporal contract
// ─────────────────────────────────────────────────────────────────────────────

const JD_TEXT_MAX = 50_000;
const JD_HASH_MAX = 256;

export const StartGenerationCommandSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  user_id: z.string().uuid(),
  profile_id: z.string().min(1),
  application_id: z.string().uuid().optional(),
  /** Required dedupe key — same key ⇒ same generation row. */
  idempotency_key: z.string().min(8).max(256),
  jd: z
    .object({
      text: z.string().min(1).max(JD_TEXT_MAX).optional(),
      url: z.string().url().optional(),
      hash: z.string().min(8).max(JD_HASH_MAX),
      title_hint: z.string().min(1).max(256).optional(),
      company_hint: z.string().min(1).max(256).optional(),
    })
    .refine((j) => j.text || j.url, {
      message: "jd.text or jd.url required",
    }),
  market: z.enum(["US", "UK"]).default("US"),
  preflight: z
    .object({
      id: z.string().min(1),
      token: z.string().min(8),
      answers: z.array(z.unknown()).default([]),
    })
    .optional(),
  options: z
    .object({
      output_suite: z.array(OutputArtifactSchema).default(["resume"]),
      allow_company_web_research: z.boolean().default(false),
      allow_file_search: z.boolean().default(false),
      max_questions: z.number().int().nonnegative().max(10).default(3),
      quality_mode: QualityModeSchema.default("balanced"),
    })
    .default({
      output_suite: ["resume"],
      allow_company_web_research: false,
      allow_file_search: false,
      max_questions: 3,
      quality_mode: "balanced",
    }),
  /** Submission timestamp — used for staleness checks and audit. */
  submitted_at: z.string().datetime(),
});
export type StartGenerationCommand = z.infer<typeof StartGenerationCommandSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 13. SOTA goal-kind extension (additive)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * New goal kinds introduced by 003. Existing `GoalKindSchema` enum is
 * the source of truth for the workbench scheduler — additions here
 * surface the new kinds with strong typing without touching the
 * scheduler enum (the scheduler is updated in lockstep in goal.ts).
 *
 * Listed for documentation; importers should still import from `goal.ts`.
 */
export const SotaGoalKindSchema = z.enum([
  "hydrate_candidate_memory",
  "build_candidate_model",
  "build_job_model",
  "research_company_context",
  "infer_role_scorecard",
  "map_ats_keywords",
  "extract_hidden_constraints",
  "plan_proof_questions",
  "integrate_user_answer",
  "build_strategy_board",
  "generate_draft_variants",
  "score_draft_variants",
  "merge_best_draft_features",
  "red_team_winning_draft",
  "repair_winning_draft",
  "freeze_final_draft",
  "verify_render_integrity",
  "record_learning_signal",
]);
export type SotaGoalKind = z.infer<typeof SotaGoalKindSchema>;

export type AnyGoalKind = z.infer<typeof GoalKindSchema> | SotaGoalKind;

// ─────────────────────────────────────────────────────────────────────────────
// 14. GenerationSotaState — the v3 nodes container
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GenerationSotaState — the new top-level slot the orchestrator hangs
 * the v3 nodes off without rewriting `BlackboardSchema`. Lives at
 * `blackboard.sota` (additive, optional, parsed lazily).
 */
export const GenerationSotaStateSchema = z.object({
  schema_version: SotaSchemaVersionSchema,
  application_context: ApplicationContextSchema.nullable(),
  candidate_model: CandidateModelSchema.nullable(),
  job_model: JobModelSchema.nullable(),
  company_model: CompanyModelSchema.nullable(),
  claim_ledger: ClaimLedgerSchema,
  question_plan: QuestionPlanSchema,
  strategy_board: StrategyBoardSchema.nullable(),
  draft_variants: z.array(DraftVariantSchema).default([]),
  quality_board: QualityBoardSchema,
  rendered_package: RenderedApplicationPackageSchema.nullable(),
  learning_signals: z.array(LearningSignalSchema).default([]),
});
export type GenerationSotaState = z.infer<typeof GenerationSotaStateSchema>;

export const emptyGenerationSotaState = (generation_id: string): GenerationSotaState => ({
  schema_version: "sota-v3",
  application_context: null,
  candidate_model: null,
  job_model: null,
  company_model: null,
  claim_ledger: emptyClaimLedger(generation_id),
  question_plan: {
    schema_version: "sota-v3",
    generation_id,
    budget_remaining: 3,
    questions: [],
  },
  strategy_board: null,
  draft_variants: [],
  quality_board: emptyQualityBoard(generation_id),
  rendered_package: null,
  learning_signals: [],
});
