/**
 * BoilerplateStripper — pure-cognition specialist (no ML calls).
 *
 * After `DiscourseClassifier` writes `hypotheses.discourse_map` and
 * pushes a `strip_discourse_boilerplate` child goal, this specialist
 * suppresses the `boilerplate` and `legal` functions by setting their
 * `importance = 0`. We zero out instead of removing because the
 * credibility scanner (commit #8) wants to mine the legal block for
 * implicit disqualifier hints, while the rest of the pipeline gates
 * on `importance > 0`.
 *
 * Goal kind handled: `strip_discourse_boilerplate` (separate from
 * `classify_discourse` so the goal-kind → specialist mapping is 1:1
 * and the attention scheduler stays simple).
 *
 * @brain ACC: irrelevant-information suppression
 * @thinking attention
 * @cellType interneuron
 * @neurotransmitter GABA
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["strip_discourse_boilerplate"];

const SUPPRESSED_FUNCTIONS = new Set(["boilerplate", "legal"]);

/** Sentinel importance value the stripper writes to suppressed sentences. */
export const STRIPPED_IMPORTANCE = 0.0;

export class BoilerplateStripper implements Specialist {
  readonly id = "boilerplate_stripper";
  readonly display_name = "Boilerplate Stripper";
  readonly brain_region = "acc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 1;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const map = ctx.blackboard.hypotheses.discourse_map;

    if (!map) {
      // Discourse classifier hasn't run (or refused). Satisfy the goal
      // with a no-op + diagnostic so we don't loop.
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "skipped_no_discourse_map",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ skipped: true }),
          justification: "no discourse_map on blackboard — classifier didn't produce one",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    // Already stripped? Detect by presence of the sentinel importance.
    const already_stripped = map.some(
      (s) => SUPPRESSED_FUNCTIONS.has(s.function) && s.importance === STRIPPED_IMPORTANCE,
    );
    if (already_stripped) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "noop_already_stripped",
          inputs_hash: AuditTrail.hash({ n_sentences: map.length }),
          output_hash: AuditTrail.hash({ stripped: true }),
          justification: "discourse_map already stripped — nothing to do",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    // Suppress: set importance to STRIPPED_IMPORTANCE for boilerplate + legal.
    let n_suppressed = 0;
    const stripped = map.map((s) => {
      if (SUPPRESSED_FUNCTIONS.has(s.function)) {
        n_suppressed++;
        return { ...s, importance: STRIPPED_IMPORTANCE };
      }
      return s;
    });

    return {
      writes: [{ path: "hypotheses.discourse_map", value: stripped }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "suppress_boilerplate_and_legal",
        inputs_hash: AuditTrail.hash({ n_sentences: map.length }),
        output_hash: AuditTrail.hash({ n_suppressed, n_kept: map.length - n_suppressed }),
        justification: `suppressed ${n_suppressed}/${map.length} sentences (boilerplate + legal)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.discourse_map"],
      },
    };
  }
}
