/**
 * DiscourseClassifier specialist (S2, PRD §6.1).
 *
 * Classifies each sentence of a JD into one of six discourse functions
 * — `filter`, `actual_test`, `aspiration`, `culture`, `legal`,
 * `boilerplate` — by calling the ML server's `ClassifyDiscourse` RPC.
 *
 * Writes the resulting per-sentence map to `hypotheses.discourse_map`
 * on the blackboard. Downstream specialists (BoilerplateStripper,
 * CulturalCalibrator, GapMapper) all read from this map rather than
 * re-running the model.
 *
 * Goal kind handled: `classify_discourse`.
 *
 * Goal payload (required):
 *   - `jd_text`: string, ≥ 50 chars (matches the server's contract)
 *
 * @brain Wernicke's (lexical/discourse) + DLPFC (function attribution)
 * @thinking language_comprehension
 * @cellType stellate
 * @neurotransmitter glutamate
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import type { MLClient } from "../../ml-client";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["classify_discourse"];

export class DiscourseClassifier implements Specialist {
  readonly id = "discourse_classifier";
  readonly display_name = "Discourse Classifier";
  readonly brain_region = "wernickes";
  readonly handles_goal_kinds = HANDLES;
  // DeBERTa-v3-small INT8 NLI: ~80ms/paragraph CPU on the real path,
  // <1ms on the stub. Budget tracks the real model.
  readonly estimated_cost_usd = 0.0002;
  readonly estimated_latency_ms = 120;

  constructor(private readonly ml_client: MLClient) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const jd_text = read_jd_text(goal);

    if (!jd_text) {
      // No body to classify. Satisfy the goal with a no-op write so the
      // orchestrator doesn't loop, and surface the reason in the audit.
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "missing_input",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ refused: true, reason: "no_jd_text" }),
          justification:
            "classify_discourse goal had no jd_text payload (or fewer than 50 chars) — nothing to classify",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const inputs_hash = AuditTrail.hash({
      jd_text_length: jd_text.length,
    });

    const res = await this.ml_client.classify_discourse({ jd_text }, ctx.signal);

    // Write only the (sentence_index, text, function, importance) tuple
    // to the blackboard. The full per-class logits stay in the audit's
    // output_hash; consumers that need them can re-fetch via the audit.
    const discourse_map = res.sentences.map((s) => ({
      sentence_index: s.sentence_index,
      text: s.text,
      function: s.function,
      importance: s.importance,
    }));

    // v2.0 §7.1 chain: emit `strip_discourse_boilerplate`,
    // `calibrate_cultural_vector`, and `scan_credibility` so the comprehension
    // and reflection layers cascade automatically.
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
        micro_stage: "ml_classify",
        inputs_hash,
        output_hash: AuditTrail.hash({
          model_version: res.model_version,
          n_sentences: discourse_map.length,
          function_distribution: tally_functions(discourse_map),
        }),
        justification: `classified ${discourse_map.length} sentences via ${res.model_version}; pushed strip_discourse_boilerplate child goal`,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["hypotheses.discourse_map"],
      },
    };
  }
}

// ──────────── helpers ────────────

function read_jd_text(goal: Goal): string | null {
  const v = goal.payload?.jd_text;
  if (typeof v === "string" && v.trim().length >= 50) return v;
  return null;
}

function tally_functions(map: ReadonlyArray<{ function: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of map) {
    out[s.function] = (out[s.function] ?? 0) + 1;
  }
  return out;
}
