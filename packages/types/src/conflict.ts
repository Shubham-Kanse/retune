import { z } from "zod";

/**
 * Conflict — emitted by monitors when a blackboard write violates a
 * cognitive constraint (coherence, plausibility, scope, repetition,
 * voice drift, threat detection).
 *
 * Conflicts are typed records that drive new subgoals via the
 * meta-cognition layer (PRD §9.2).
 *
 * @brain anterior cingulate cortex: conflict / error detection
 */
export const ConflictMonitorSchema = z.enum([
  "coherence",
  "number_plausibility",
  "scope_vs_title",
  "repetition",
  "voice_drift",
  "novelty_ood",
  "threat_prompt_injection",
  "well_being",
  "cost_runaway",
  "fabrication", // claim with no grounding evidence
  "fairness_concern", // gendered / age-coded / accent-coded language detected
  "critic_divergence", // CriticEnsemble self-image vs professional critics diverge
  "hidden_disqualifier_blocker", // RefuseOrShipGate: JD contains hidden disqualifiers overlapping key reqs
]);
export type ConflictMonitor = z.infer<typeof ConflictMonitorSchema>;

export const ConflictSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

export const ConflictRecordSchema = z.object({
  id: z.string().uuid(),
  monitor: ConflictMonitorSchema,
  severity: ConflictSeveritySchema,
  /** Free-form payload — schema varies per monitor. */
  payload: z.record(z.string(), z.unknown()),
  /** Specialist or other monitor that resolved this, if any. */
  resolved_by: z.string().nullable(),
  resolution_log: z.string().nullable(),
  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
});
export type ConflictRecord = z.infer<typeof ConflictRecordSchema>;
