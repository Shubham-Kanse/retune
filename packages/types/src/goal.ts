import { z } from "zod";

/**
 * Goal — the unit of work the attention scheduler reasons over.
 *
 * Goals are typed, prioritized, and refined through the cognitive cycle.
 * The orchestrator pops the highest-EV goal, picks a specialist, runs it,
 * commits its writes, and pushes any new conflict-driven subgoals.
 *
 * v003 adds optional prerequisites, semantic dedupe keys, retry policy,
 * and EV-of-information signals so the scheduler can avoid running
 * production goals on incomplete blackboard state.
 *
 * @brain DLPFC: working-memory goal stack
 */
export const GoalKindSchema = z.enum([
  // Comprehension
  "analyze_jd",
  "analyze_profile",
  "analyze_company",
  "extract_spans",
  "classify_discourse",
  "strip_discourse_boilerplate",
  "calibrate_cultural_vector",
  "extract_voice_fingerprint",
  "calibrate_honesty",
  "scan_credibility",
  "audit_fairness",
  // Strategy
  "map_gaps",
  "propose_arcs",
  "select_arc",
  "solve_evidence",
  // Production
  "compose_resume",
  "compose_cover_letter",
  "patch_ats",
  "compose_strategy",
  "compose_linkedin_about",
  "compose_outreach",
  "compose_interview_prep",
  "compose_negotiation",
  // Critique (NEW v2.0 — TheoryOfMindSpecialist now handles its own kind)
  "model_recruiter_beliefs",
  // Monitoring-driven
  "resolve_conflict",
  "request_user_input",
  // Decision
  // `predict_outcome` is the legacy v1.0 name for OutcomePredictor's goal;
  // `estimate_outcome` is the canonical v2.0 name used in the §7.1 chain.
  // Both are accepted to allow incremental migration; OutcomePredictor
  // accepts both.
  "predict_outcome",
  "estimate_outcome",
  "decide_refuse_or_ship",
  // Render
  "render_documents",
  "watermark_and_persist",
  // Meta-layer (technical-2.0 §24)
  "infer_emotional_state",
  "compute_mood_fingerprint",
  "update_motivation_modulator",
  "narrate_layer",
  // ───── 003 SOTA upgrade additions ──────────────────────────────────
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
export type GoalKind = z.infer<typeof GoalKindSchema>;

export const GoalStatusSchema = z.enum([
  "pending",
  "in_progress",
  "satisfied",
  "abandoned",
  "blocked_on_user",
  "blocked_on_prerequisites",
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

/**
 * BlackboardPath — typed dot-path into the blackboard graph.
 * Mirrors `BlackboardEvent.path` (e.g. `draft.bullets.<id>`).
 */
export const GoalBlackboardPathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_\-\.\*\[\]]+$/, {
    message: "blackboard path must contain only [A-Za-z0-9_-.*[]]",
  });

export const GoalSchema = z.object({
  id: z.string().uuid(),
  kind: GoalKindSchema,
  /** 0–100; higher runs first. EV-adjusted by the attention scheduler at pick-time. */
  priority: z.number().min(0).max(100),
  /** Specialist or monitor that emitted this goal. Root goals carry "orchestrator". */
  emitted_by: z.string(),
  /** Optional payload — e.g. for `resolve_conflict`, the conflict id. */
  payload: z.record(z.string(), z.unknown()).optional(),
  status: GoalStatusSchema,
  satisfied_by: z.array(z.string()).default([]),
  parent_goal_id: z.string().uuid().nullable(),
  /**
   * Semantic dedupe key (003). When set, the scheduler suppresses
   * re-emission of pending/in_progress goals with the same key. The
   * key is opaque to the scheduler — emit something stable like
   * `compose_resume:variant=ats_forward` or `request_user_input:role_title`.
   */
  semantic_key: z.string().min(1).max(200).optional(),
  /**
   * Blackboard paths that MUST be non-null/non-empty before this goal
   * is eligible to run. The scheduler keeps the goal in
   * `blocked_on_prerequisites` until all prerequisites resolve.
   *
   * `undefined` ≡ no prerequisites (every legacy v2 goal).
   */
  requires: z.array(GoalBlackboardPathSchema).optional(),
  /**
   * Goal kinds (or semantic keys) that this goal blocks until
   * satisfied. Production goals typically declare `blocks: ["render_documents"]`.
   */
  blocks: z.array(z.string()).optional(),
  /** Hard cap on how many times the scheduler may re-pick this goal. */
  max_attempts: z.number().int().positive().max(10).optional(),
  attempt_count: z.number().int().nonnegative().optional(),
  /** Heuristic uncertainty in [0,1] — fed into EV calc. */
  uncertainty: z.number().min(0).max(1).optional(),
  /** Heuristic expected value of information in [0,1]. */
  expected_value: z.number().min(0).max(1).optional(),
  /** Soft deadline; scheduler down-weights stale goals past it. */
  deadline_ms: z.number().int().positive().nullable().optional(),
  /** Optional reason recorded when the goal is abandoned/blocked. */
  status_reason: z.string().max(500).nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Goal = z.infer<typeof GoalSchema>;

/**
 * Default values for optional Goal fields, used by GoalStack.add() and
 * persistence rehydration when reconstructing canonical Goals.
 */
export const DEFAULT_GOAL_MAX_ATTEMPTS = 3;
