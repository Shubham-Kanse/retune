import { z } from "zod";

/**
 * Confidence — calibrated, distribution-aware.
 *
 * Every cognitive specialist returns a Confidence rather than a bare number.
 * `point` is the maximum-likelihood estimate; `[lower, upper]` is the
 * conformal-prediction interval at the stated `coverage` level.
 *
 * Coverage defaults to 0.95 per PRD §10.3 acceptance criteria.
 *
 * @brain DLPFC metacognition + cerebellar precision modeling
 */
export const ConfidenceSchema = z
  .object({
    point: z.number().min(0).max(1),
    lower: z.number().min(0).max(1),
    upper: z.number().min(0).max(1),
    coverage: z.number().min(0).max(1).default(0.95),
  })
  .refine((c) => c.lower <= c.point && c.point <= c.upper, {
    message: "lower ≤ point ≤ upper must hold",
  });
export type Confidence = z.infer<typeof ConfidenceSchema>;

export function pointConfidence(point: number, coverage = 0.95): Confidence {
  const clamped = Math.max(0, Math.min(1, point));
  return { point: clamped, lower: clamped, upper: clamped, coverage };
}

export function intervalConfidence(
  point: number,
  lower: number,
  upper: number,
  coverage = 0.95,
): Confidence {
  return { point, lower, upper, coverage };
}

/**
 * Beta-distribution prior used for credibility scoring (PRD §6.1).
 * α/β are pseudo-counts of corroborating / disconfirming evidence.
 *
 * @brain ventromedial PFC: value-based prior
 */
export const BetaPriorSchema = z.object({
  alpha: z.number().positive(),
  beta: z.number().positive(),
});
export type BetaPrior = z.infer<typeof BetaPriorSchema>;

export function betaMean(p: BetaPrior): number {
  return p.alpha / (p.alpha + p.beta);
}
