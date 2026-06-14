/**
 * CandidateMemoryHydrator (003 §6.2 Phase B).
 *
 * The first SOTA specialist. Runs at goal kind `hydrate_candidate_memory`
 * and is responsible for:
 *
 *   1. Reading the user's CareerProfileV1 (preferred) or `profile_text`
 *      (legacy fallback) from the goal payload.
 *   2. Producing a `CandidateModel` projection (deterministic).
 *   3. Producing a `ClaimLedger` initialised from the candidate model
 *      (deterministic).
 *   4. Emitting a `build_candidate_model` goal that downstream
 *      production specialists declare as a prerequisite via
 *      `requires: ["sota.candidate_model"]`.
 *
 * Brain region: hippocampus + medial prefrontal cortex (autobiographical
 * memory retrieval and self-model construction).
 *
 * Cost: $0 (deterministic).
 */

import type { CandidateModel, ClaimLedger, Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";
import { buildCandidateModelDeterministic } from "./build-candidate-model";
import { buildClaimLedgerFromCandidateModel } from "./build-claim-ledger";

const HANDLES: readonly GoalKind[] = ["hydrate_candidate_memory"];

export class CandidateMemoryHydrator implements Specialist {
  readonly id = "candidate_memory_hydrator";
  readonly display_name = "Candidate Memory Hydrator";
  readonly brain_region = "hippocampus_mpfc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 50;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const payload = (goal.payload ?? {}) as {
      career_profile?: unknown;
      profile_text?: string;
      user_id?: string;
    };

    const user_id = payload.user_id ?? ctx.blackboard.user_id;
    const generation_id = ctx.blackboard.generation_id;

    const result = buildCandidateModelDeterministic({
      user_id,
      career_profile: payload.career_profile,
      profile_text: payload.profile_text,
    });

    const candidate_model: CandidateModel = result.candidate_model;
    const claim_ledger: ClaimLedger = buildClaimLedgerFromCandidateModel(
      generation_id,
      candidate_model,
    );

    const writes: Array<{ path: string; value: unknown }> = [
      { path: "sota.candidate_model", value: candidate_model },
      { path: "sota.claim_ledger", value: claim_ledger },
      {
        path: "sota.input_completeness",
        value: {
          has_career_profile: !!payload.career_profile,
          has_profile_text: !!payload.profile_text,
          warnings: result.warnings,
          source_count: result.source_records.length,
          claim_count: claim_ledger.claims.length,
        },
      },
    ];

    const justification = result.warnings.length
      ? `hydrated candidate_model (warnings: ${result.warnings.join(",")}; ${claim_ledger.claims.length} claims)`
      : `hydrated candidate_model with ${claim_ledger.claims.length} claims from ${result.source_records.length} source(s)`;

    return {
      writes,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "candidate_memory_hydration",
        inputs_hash: AuditTrail.hash({
          user_id,
          has_career_profile: !!payload.career_profile,
          profile_text_len: payload.profile_text?.length ?? 0,
        }),
        output_hash: AuditTrail.hash({
          n_claims: claim_ledger.claims.length,
          n_skills: candidate_model.skill_inventory.length,
          n_metrics: candidate_model.metric_inventory.length,
          n_achievements: candidate_model.achievement_inventory.length,
        }),
        justification,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: writes.map((w) => w.path),
      },
    };
  }
}
