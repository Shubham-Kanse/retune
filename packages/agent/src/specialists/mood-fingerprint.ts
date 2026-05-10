/**
 * MoodFingerprint — computes a rolling mood baseline for a user.
 *
 * Aggregates recent EmotionalState readings into a stable fingerprint
 * that represents the user's typical VAD profile. Used to detect
 * deviations (e.g., unusually low valence → more empathetic tone) and
 * to calibrate the emotional modulation applied by downstream writers.
 *
 * Can run on-demand (during a generation) or via cron (nightly batch
 * over all users with recent activity).
 *
 * Goal kind: `compute_mood_fingerprint`
 *
 * Reads:
 *   - hypotheses.emotional_state (current generation's inferred state)
 *   - (in cron mode: queries historical emotional_states from DB)
 *
 * Writes:
 *   - hypotheses.mood_fingerprint (MoodFingerprint)
 *
 * @brain limbic aggregate: hippocampus + amygdala + cingulate cortex
 * @thinking long_term_memory
 * @cellType place
 * @neurotransmitter serotonin
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["compute_mood_fingerprint"];

export interface MoodFingerprint {
  valence_avg: number;
  arousal_avg: number;
  dominance_avg: number;
  stability: number;
  sample_count: number;
  computed_at: string;
}

export class MoodFingerprintSpecialist implements Specialist {
  readonly id = "mood_fingerprint";
  readonly display_name = "Mood Fingerprint";
  readonly brain_region = "limbic aggregate";
  readonly handles_goal_kinds: readonly GoalKind[] = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 3;

  private readonly history: Array<{ valence: number; arousal: number; dominance: number }>;

  constructor(history?: Array<{ valence: number; arousal: number; dominance: number }>) {
    this.history = history ?? [];
  }

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const emotional_state = (ctx.blackboard.hypotheses as Record<string, unknown>)
      .emotional_state as
      | { valence: number; arousal: number; dominance: number }
      | null
      | undefined;

    const samples = [...this.history];
    if (emotional_state) {
      samples.push({
        valence: emotional_state.valence,
        arousal: emotional_state.arousal,
        dominance: emotional_state.dominance,
      });
    }

    let fingerprint: MoodFingerprint;
    if (samples.length === 0) {
      fingerprint = {
        valence_avg: 0,
        arousal_avg: 0,
        dominance_avg: 0,
        stability: 1,
        sample_count: 0,
        computed_at: new Date().toISOString(),
      };
    } else {
      const n = samples.length;
      const v_avg = samples.reduce((s, x) => s + x.valence, 0) / n;
      const a_avg = samples.reduce((s, x) => s + x.arousal, 0) / n;
      const d_avg = samples.reduce((s, x) => s + x.dominance, 0) / n;

      // Stability: inverse of variance (clamped to [0, 1])
      const v_var = samples.reduce((s, x) => s + (x.valence - v_avg) ** 2, 0) / n;
      const a_var = samples.reduce((s, x) => s + (x.arousal - a_avg) ** 2, 0) / n;
      const d_var = samples.reduce((s, x) => s + (x.dominance - d_avg) ** 2, 0) / n;
      const total_var = (v_var + a_var + d_var) / 3;
      const stability = Math.max(0, Math.min(1, 1 - total_var));

      fingerprint = {
        valence_avg: v_avg,
        arousal_avg: a_avg,
        dominance_avg: d_avg,
        stability,
        sample_count: n,
        computed_at: new Date().toISOString(),
      };
    }

    return {
      writes: [{ path: "hypotheses.mood_fingerprint", value: fingerprint }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "compute_fingerprint",
        inputs_hash: AuditTrail.hash({ n_samples: samples.length }),
        output_hash: AuditTrail.hash({
          v: fingerprint.valence_avg,
          a: fingerprint.arousal_avg,
          d: fingerprint.dominance_avg,
          s: fingerprint.stability,
        }),
        justification: `Mood fingerprint from ${samples.length} sample(s): V=${fingerprint.valence_avg.toFixed(2)} A=${fingerprint.arousal_avg.toFixed(2)} D=${fingerprint.dominance_avg.toFixed(2)} stability=${fingerprint.stability.toFixed(2)}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.mood_fingerprint"],
      },
    };
  }
}
