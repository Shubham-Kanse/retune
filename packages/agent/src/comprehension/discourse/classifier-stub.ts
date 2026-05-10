/**
 * StubDiscourseClassifier — deterministic stub for dev/test runs.
 *
 * Used when `RETUNE_ML_USE_STUBS=true` and no ML server is available.
 * Classifies every sentence as `actual_test` with equal importance (0.5)
 * so downstream specialists (BoilerplateStripper, CulturalCalibrator,
 * GapMapper) receive a well-formed discourse_map and can run normally.
 *
 * Emits the same child goals as the real DiscourseClassifier so the
 * comprehension chain cascades correctly in stub mode.
 *
 * §1.1 fix: prevents the entire discourse pipeline from being silently
 * skipped when RETUNE_ML_USE_STUBS=true.
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["classify_discourse"];

/**
 * Mirrors the real DiscourseClassifier's brain-region tagging so the
 * cell-type coverage invariant holds whether or not the ML server is up.
 *
 * @brain Wernicke's area: receptive language + categorical labelling
 * @thinking language_comprehension
 * @cellType pyramidal
 * @neurotransmitter glutamate
 */
export class StubDiscourseClassifier implements Specialist {
  readonly id = "discourse_classifier";
  readonly display_name = "Discourse Classifier (stub)";
  readonly brain_region = "wernickes";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 1;

  async run(_ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const jd_text = read_jd_text(goal);

    if (!jd_text) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "missing_input",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ refused: true }),
          justification: "classify_discourse stub: no jd_text payload",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    // Split on sentence boundaries; treat every sentence as actual_test
    // with equal importance so downstream specialists have a usable map.
    const sentences = jd_text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const discourse_map = sentences.map((text, i) => ({
      sentence_index: i,
      text,
      function: "actual_test" as const,
      importance: 0.5,
    }));

    const now = new Date().toISOString();
    const base_priority = Math.max(0, goal.priority - 1);
    const child_goals: Goal[] = [
      {
        id: randomUUID(),
        kind: "strip_discourse_boilerplate",
        priority: base_priority,
        emitted_by: this.id,
        payload: {},
        status: "pending",
        satisfied_by: [],
        parent_goal_id: goal.id,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        kind: "calibrate_cultural_vector",
        priority: base_priority,
        emitted_by: this.id,
        payload: { jd_text },
        status: "pending",
        satisfied_by: [],
        parent_goal_id: goal.id,
        created_at: now,
        updated_at: now,
      },
      {
        id: randomUUID(),
        kind: "scan_credibility",
        priority: Math.max(0, base_priority - 2),
        emitted_by: this.id,
        payload: { jd_text },
        status: "pending",
        satisfied_by: [],
        parent_goal_id: goal.id,
        created_at: now,
        updated_at: now,
      },
    ];

    return {
      writes: [{ path: "hypotheses.discourse_map", value: discourse_map }],
      satisfied_goal_ids: [goal.id],
      new_goals: child_goals,
      audit: {
        specialist: this.id,
        micro_stage: "stub_classify",
        inputs_hash: AuditTrail.hash({ jd_text_length: jd_text.length }),
        output_hash: AuditTrail.hash({ n_sentences: discourse_map.length, stub: true }),
        justification: `stub: classified ${discourse_map.length} sentences as actual_test (RETUNE_ML_USE_STUBS=true)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.discourse_map"],
      },
    };
  }
}

function read_jd_text(goal: Goal): string | null {
  const v = goal.payload?.jd_text;
  if (typeof v === "string" && v.trim().length >= 50) return v;
  return null;
}
