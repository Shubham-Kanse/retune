import { z } from "zod";

/**
 * Honesty calibration — per-claim-type trust factor derived from systematic
 * over-claim patterns (PRD §6.2 specialist S7).
 *
 * Trust factor downgrades scope / leadership / metric claims when the
 * candidate's onboarding evidence systematically over-attests.
 *
 * @brain orbitofrontal cortex + ACC: shame avoidance / honest self-presentation
 */
export const ClaimTypeSchema = z.enum([
  "leadership",
  "scope",
  "technical_depth",
  "metric",
  "duration",
  "impact",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const HonestyCalibrationSchema = z.object({
  user_id: z.string().uuid(),
  per_claim_type: z.record(ClaimTypeSchema, z.number().min(0).max(1)),
  sample_size: z.number().int().nonnegative(),
  last_updated_at: z.string().datetime(),
});
export type HonestyCalibration = z.infer<typeof HonestyCalibrationSchema>;
