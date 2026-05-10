import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["infer_emotional_state"];

export interface EmotionalState {
  valence: number;
  arousal: number;
  dominance: number;
  primary_emotion: string;
  confidence: number;
  source_signals: string[];
  inferred_at: string;
}

const EMOTION_MAP: Array<{
  name: string;
  v: [number, number];
  a: [number, number];
  d: [number, number];
}> = [
  { name: "excited", v: [0.5, 1], a: [0.5, 1], d: [0.5, 1] },
  { name: "anxious", v: [-1, 0], a: [0.3, 1], d: [-1, 0] },
  { name: "confident", v: [0.3, 1], a: [0, 0.6], d: [0.4, 1] },
  { name: "frustrated", v: [-1, -0.2], a: [0.2, 0.8], d: [-0.5, 0.5] },
  { name: "neutral", v: [-0.3, 0.3], a: [-0.3, 0.3], d: [-0.3, 0.3] },
  { name: "hopeful", v: [0.2, 0.8], a: [0, 0.5], d: [0, 0.6] },
  { name: "overwhelmed", v: [-0.5, 0], a: [0.4, 1], d: [-1, -0.3] },
  { name: "determined", v: [0.1, 0.7], a: [0.3, 0.7], d: [0.3, 1] },
];

/**
 * @brain insula + amygdala + vmPFC: interoception + affect + valuation
 * @thinking emotional_processing
 * @cellType spindle
 * @neurotransmitter serotonin
 */
export class EmotionalStateModeler implements Specialist {
  readonly id = "emotional_state_modeler";
  readonly display_name = "Emotional State Modeler";
  readonly brain_region = "insula + amygdala + vmPFC";
  readonly handles_goal_kinds: readonly GoalKind[] = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 5;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const { hypotheses, draft, conflicts } = ctx.blackboard;
    const signals: string[] = [];

    let valence = 0;
    let arousal = 0;
    let dominance = 0;

    // Signal 1: Desperation index (from credibility scanner — Confidence type)
    const desperation = hypotheses.desperation_index;
    if (desperation != null) {
      const dp = desperation.point;
      valence -= dp * 0.4;
      arousal += dp * 0.3;
      dominance -= dp * 0.5;
      signals.push(`desperation_index=${dp.toFixed(2)}`);
    }

    // Signal 2: Unresolved conflicts (stress proxy)
    const unresolved = (conflicts ?? []).filter((c) => !c.resolved_by).length;
    if (unresolved > 0) {
      arousal += Math.min(0.3, unresolved * 0.1);
      valence -= Math.min(0.2, unresolved * 0.05);
      signals.push(`unresolved_conflicts=${unresolved}`);
    }

    // Signal 3: Pending revisions (frustration proxy)
    const revisions = draft.pending_revisions?.length ?? 0;
    if (revisions > 0) {
      valence -= Math.min(0.2, revisions * 0.05);
      arousal += Math.min(0.15, revisions * 0.03);
      signals.push(`pending_revisions=${revisions}`);
    }

    // Signal 4: Voice fingerprint energy (arousal proxy)
    const vf = hypotheses.voice_fingerprint;
    if (vf && Array.isArray(vf)) {
      const energy = vf.reduce((s: number, v: number) => s + Math.abs(v), 0) / vf.length;
      arousal += (energy - 0.5) * 0.2;
      signals.push(`voice_energy=${energy.toFixed(3)}`);
    }

    // Clamp to [-1, 1]
    valence = Math.max(-1, Math.min(1, valence));
    arousal = Math.max(-1, Math.min(1, arousal));
    dominance = Math.max(-1, Math.min(1, dominance));

    // Map to primary emotion
    const primary_emotion = this.classify_emotion(valence, arousal, dominance);
    const confidence = signals.length > 0 ? Math.min(0.9, 0.3 + signals.length * 0.15) : 0.2;

    const state: EmotionalState = {
      valence,
      arousal,
      dominance,
      primary_emotion,
      confidence,
      source_signals: signals,
      inferred_at: new Date().toISOString(),
    };

    return {
      writes: [{ path: "hypotheses.emotional_state", value: state }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "vad_inference",
        inputs_hash: AuditTrail.hash({ signals }),
        output_hash: AuditTrail.hash({ primary_emotion, valence, arousal, dominance }),
        justification: `Inferred ${primary_emotion} (V=${valence.toFixed(2)} A=${arousal.toFixed(2)} D=${dominance.toFixed(2)}, conf=${confidence.toFixed(2)}) from ${signals.length} signal(s)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.emotional_state"],
      },
    };
  }

  private classify_emotion(v: number, a: number, d: number): string {
    let best = "neutral";
    let best_dist = Number.POSITIVE_INFINITY;
    for (const e of EMOTION_MAP) {
      const dv = this.range_dist(v, e.v);
      const da = this.range_dist(a, e.a);
      const dd = this.range_dist(d, e.d);
      const dist = dv * dv + da * da + dd * dd;
      if (dist < best_dist) {
        best_dist = dist;
        best = e.name;
      }
    }
    return best;
  }

  private range_dist(val: number, [lo, hi]: [number, number]): number {
    if (val >= lo && val <= hi) return 0;
    return val < lo ? lo - val : val - hi;
  }
}
