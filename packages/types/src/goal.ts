import { z } from "zod";

/**
 * Goal — the unit of work the attention scheduler reasons over.
 *
 * Goals are typed, prioritized, and refined through the cognitive cycle.
 * The orchestrator pops the highest-EV goal, picks a specialist, runs it,
 * commits its writes, and pushes any new conflict-driven subgoals.
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
]);
export type GoalKind = z.infer<typeof GoalKindSchema>;

export const GoalStatusSchema = z.enum([
  "pending",
  "in_progress",
  "satisfied",
  "abandoned",
  "blocked_on_user",
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

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
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Goal = z.infer<typeof GoalSchema>;
