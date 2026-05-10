/**
 * HonestyCalibrator specialist.
 *
 * Computes a per-(user, claim_type) trust factor in [0, 1] that the
 * Claim emitter (commit #10's bullet composer) multiplies into its
 * outcome confidence before staking a claim.
 *
 * Method (PRD §6.2.2):
 *
 *   posterior_trust = (α + verified) / (α + β + verified + unverified)
 *
 * with a Beta(α=1, β=1) uniform prior. `verified` and `unverified`
 * counts come from a sink (`HonestyCalibrationStore`) — typically a
 * SQL table populated by the post-application outcome tracker. Without
 * any signal, the calibrator emits 1.0 (neutral) for each claim_type
 * present in the workbench's vocabulary.
 *
 * Goal kind handled: `calibrate_honesty`.
 *
 * Goal payload (optional):
 *   - `claim_types`: string[] (default: ConfidenceClaimKinds — the
 *     enum from `@retune/types/evidence`'s ClaimSchema).
 *
 * Writes `hypotheses.honesty_calibration` as `Record<string, number>`.
 *
 * @brain orbitofrontal cortex (OFC): trustworthiness valuation
 * @thinking causal_reasoning
 * @cellType pyramidal
 * @neurotransmitter dopamine
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["calibrate_honesty"];

/**
 * The set of claim kinds we track honesty calibrations for. Mirrors
 * ClaimSchema.claim_kind in `@retune/types/evidence` — kept here as a
 * literal tuple so the specialist can default-iterate without a runtime
 * dep on the zod schema (and so adding a new claim kind in the future
 * is a one-touch change).
 */
export const HONESTY_CLAIM_KINDS = [
  "metric",
  "scope",
  "leadership",
  "technical_depth",
  "duration",
  "named_entity",
  "achievement",
  "skill_usage",
] as const;

export interface HonestyCalibrationStore {
  /** Returns recorded (verified, unverified) counts per claim_type. */
  load(user_id: string): Promise<Record<string, { verified: number; unverified: number }>>;
  /** Upserts a per-(user, claim_type) trust factor. */
  record(input: {
    user_id: string;
    claim_type: string;
    trust_factor: number;
    sample_size: number;
  }): Promise<void>;
}

export class HonestyCalibrator implements Specialist {
  readonly id = "honesty_calibrator";
  readonly display_name = "Honesty Calibrator";
  readonly brain_region = "orbitofrontal_cortex";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 5;

  constructor(private readonly store: HonestyCalibrationStore | null = null) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const claim_types = read_claim_types(goal) ?? HONESTY_CLAIM_KINDS;

    // Cold-start: no store wired → uniform prior 1.0 for each kind.
    if (!this.store) {
      const uniform: Record<string, number> = {};
      for (const k of claim_types) uniform[k] = 1.0;
      return this.emit(goal, t0, uniform, claim_types, "uniform_prior_no_store");
    }

    const counts = await this.store.load(ctx.blackboard.user_id);
    const calibration: Record<string, number> = {};
    let total_samples = 0;
    for (const kind of claim_types) {
      const c = counts[kind] ?? { verified: 0, unverified: 0 };
      // Beta(1,1) uniform prior + observed counts → posterior mean.
      const posterior = (1 + c.verified) / (2 + c.verified + c.unverified);
      calibration[kind] = posterior;
      total_samples += c.verified + c.unverified;
      // Persist the latest trust factor so future generations skip the
      // recomputation when no new outcomes have been recorded.
      await this.store.record({
        user_id: ctx.blackboard.user_id,
        claim_type: kind,
        trust_factor: posterior,
        sample_size: c.verified + c.unverified,
      });
    }
    return this.emit(
      goal,
      t0,
      calibration,
      claim_types,
      total_samples === 0 ? "uniform_prior_cold_start" : "bayes_posterior",
    );
  }

  private emit(
    goal: Goal,
    t0: number,
    calibration: Record<string, number>,
    claim_types: readonly string[],
    micro_stage: string,
  ): SpecialistResult {
    return {
      writes: [{ path: "hypotheses.honesty_calibration", value: calibration }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage,
        inputs_hash: AuditTrail.hash({ claim_types: [...claim_types] }),
        output_hash: AuditTrail.hash(calibration),
        justification: `calibrated ${claim_types.length} claim_type(s) via ${micro_stage}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.honesty_calibration"],
      },
    };
  }
}

function read_claim_types(goal: Goal): string[] | null {
  const v = goal.payload?.claim_types;
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}
