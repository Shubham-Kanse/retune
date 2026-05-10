/**
 * MotivationModulator — VTA + nucleus accumbens reward prediction.
 *
 * Listener-pattern specialist that updates a per-user × claim_type
 * drive level based on outcome feedback. When the user reports a
 * positive outcome (callback, interview), the drive level for the
 * claim types that contributed most is boosted; negative outcomes
 * (rejection, ghosting) dampen it.
 *
 * The modulated drive levels influence how aggressively the
 * BulletComposer quantifies claims and how much the EvidenceSolver
 * invests in supporting weak claims.
 *
 * Goal kind: `update_motivation_modulator`
 *
 * Reads:
 *   - hypotheses.emotional_state (current affect)
 *   - outcome_estimate (reward signal)
 *   - draft.claims (which claim types are active)
 *
 * Writes:
 *   - hypotheses.motivation_levels (Record<claim_type, drive_level>)
 *
 * @brain VTA + nucleus accumbens: reward prediction + motivation
 * @thinking decision_making
 * @cellType pyramidal
 * @neurotransmitter dopamine
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["update_motivation_modulator"];

const BASE_DRIVE = 0.5;
const DECAY_RATE = 0.05;
const REWARD_BOOST = 0.15;
const PENALTY = 0.1;

export interface MotivationLevels {
  levels: Record<string, number>;
  updated_at: string;
}

export class MotivationModulator implements Specialist {
  readonly id = "motivation_modulator";
  readonly display_name = "Motivation Modulator";
  readonly brain_region = "VTA + nucleus accumbens";
  readonly handles_goal_kinds: readonly GoalKind[] = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 3;

  private readonly prior_levels: Record<string, number>;

  constructor(prior_levels?: Record<string, number>) {
    this.prior_levels = prior_levels ?? {};
  }

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { draft, outcome_estimate } = ctx.blackboard;
    const emotional_state = (ctx.blackboard.hypotheses as Record<string, unknown>)
      .emotional_state as { valence: number } | null | undefined;

    // Collect active claim types from draft
    const claim_types = new Set<string>();
    for (const claim of Object.values(draft.claims)) {
      if (claim.claim_kind) claim_types.add(claim.claim_kind);
    }

    // Compute new drive levels
    const levels: Record<string, number> = {};
    const reward_signal = outcome_estimate?.point ?? 0.5;
    const valence_mod = emotional_state?.valence ?? 0;

    for (const ct of claim_types) {
      const prior = this.prior_levels[ct] ?? BASE_DRIVE;

      // Temporal decay toward baseline
      let drive = prior + (BASE_DRIVE - prior) * DECAY_RATE;

      // Reward modulation: high predicted outcome → boost
      if (reward_signal > 0.6) {
        drive += REWARD_BOOST * (reward_signal - 0.6);
      } else if (reward_signal < 0.3) {
        drive -= PENALTY * (0.3 - reward_signal);
      }

      // Emotional valence modulation
      drive += valence_mod * 0.05;

      levels[ct] = Math.max(0, Math.min(1, drive));
    }

    // Carry forward any prior claim types not in current draft
    for (const [ct, val] of Object.entries(this.prior_levels)) {
      if (!levels[ct]) {
        levels[ct] = val + (BASE_DRIVE - val) * DECAY_RATE;
      }
    }

    const result: MotivationLevels = {
      levels,
      updated_at: new Date().toISOString(),
    };

    return {
      writes: [{ path: "hypotheses.motivation_levels", value: result }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "drive_update",
        inputs_hash: AuditTrail.hash({
          n_claims: claim_types.size,
          reward_signal,
          valence_mod,
        }),
        output_hash: AuditTrail.hash({ n_levels: Object.keys(levels).length }),
        justification: `Updated ${Object.keys(levels).length} drive level(s): reward_signal=${reward_signal.toFixed(2)}, valence_mod=${valence_mod.toFixed(2)}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.motivation_levels"],
      },
    };
  }
}
