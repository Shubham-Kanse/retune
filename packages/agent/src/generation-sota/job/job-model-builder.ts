/**
 * JobModelBuilder (003 §6.3 Phase C).
 *
 * Reads jd_text from the goal payload (or from the existing
 * `hypotheses.discourse_map` when the comprehension layer has already
 * run) and writes a typed JobModel to `sota.job_model`.
 *
 * Brain region: Wernicke's area (sentence comprehension) +
 * dorsolateral prefrontal cortex (rule extraction).
 *
 * Cost: $0 (deterministic). A future iteration may add a Responses-API
 * structured-output pass for ambiguous JDs; this baseline is enough to
 * pass the Phase 4 acceptance criteria (hard filters extracted,
 * boilerplate downweighted, hidden constraints surfaced).
 */

import { type Goal, type GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";
import { buildJobModelDeterministic } from "./build-job-model";

const HANDLES: readonly GoalKind[] = ["build_job_model"];

export class JobModelBuilder implements Specialist {
  readonly id = "job_model_builder";
  readonly display_name = "Job Model Builder";
  readonly brain_region = "wernicke_dlpfc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 30;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const payload = (goal.payload ?? {}) as {
      jd_text?: string;
      jd_title?: string;
      market?: "US" | "UK";
    };

    const jd_text = payload.jd_text ?? "";
    if (!jd_text || jd_text.length < 50) {
      // No JD body — write nothing but satisfy the goal so the rest of
      // the chain can still run on the candidate model + JD title alone.
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "no_jd_text",
          inputs_hash: AuditTrail.hash({ has_jd_text: false }),
          output_hash: AuditTrail.hash({ status: "skipped" }),
          justification: "no jd_text on goal payload — skipping job model build",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const result = buildJobModelDeterministic({
      jd_id: ctx.blackboard.jd_id,
      jd_text,
      jd_title_hint: payload.jd_title,
      market: payload.market ?? ctx.blackboard.market,
    });

    return {
      writes: [{ path: "sota.job_model", value: result.job_model }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "build_job_model",
        inputs_hash: AuditTrail.hash({
          jd_text_len: jd_text.length,
          market: payload.market,
        }),
        output_hash: AuditTrail.hash({
          jd_hash: result.job_model.jd_hash,
          n_requirements: result.job_model.requirements.length,
          n_hidden_constraints: result.job_model.hidden_constraints.length,
          n_ats_keywords: result.job_model.ats_keywords.length,
          noise: result.job_model.posting_noise_score,
        }),
        justification: `built job_model — ${result.job_model.requirements.length} reqs, ${result.job_model.hidden_constraints.length} hidden constraints, noise=${result.job_model.posting_noise_score.toFixed(2)} (${result.warnings.length} warnings)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["sota.job_model"],
      },
    };
  }
}
