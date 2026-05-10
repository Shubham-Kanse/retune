import { z } from "zod";
import { ConfidenceSchema } from "./confidence";

/**
 * Narrative arc archetypes per PRD §7.1.2.
 * `domain_pivoter` is included for in-scope new-grad domain-undecided cases
 * only — full career-changer arcs are out of scope at launch (PRD §19.1).
 *
 * @brain default mode network: self-narrative formation
 */
export const NarrativeArcArchetypeSchema = z.enum([
  "deep_specialist",
  "scaled_it",
  "built_from_zero",
  "fixed_the_mess",
  "led_the_team",
  "cross_functional_bridge",
  "domain_pivoter",
  // New-grad-specific:
  "no_history_high_potential",
]);
export type NarrativeArcArchetype = z.infer<typeof NarrativeArcArchetypeSchema>;

export const NarrativeArcCandidateSchema = z.object({
  archetype: NarrativeArcArchetypeSchema,
  thesis: z.string().min(1), // a 1–2 sentence concrete framing for THIS candidate
  lead_evidence_span_ids: z.array(z.string().uuid()).min(1),
  feasibility: ConfidenceSchema,
  predicted_callback: ConfidenceSchema.optional(),
  recruiter_critic_score: z.number().min(0).max(1).optional(),
  hiring_manager_critic_score: z.number().min(0).max(1).optional(),
});
export type NarrativeArcCandidate = z.infer<typeof NarrativeArcCandidateSchema>;
