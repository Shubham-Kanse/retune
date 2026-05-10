/**
 * ActiveQuestionHandler (specialist S-AQ, PRD §9.1 active-question UX).
 *
 * Handles goals of kind `request_user_input`. Its job is to transition
 * an in-memory subgoal ("ask the user a question") into a persisted,
 * user-facing question row that the UI can surface. Behavior:
 *
 *   1. Read the question + target_field from the goal payload.
 *   2. Persist to `active_questions` via PostgresPersistence (or any
 *      sink that matches the same shape).
 *   3. Mark the goal `blocked_on_user`. The orchestrator treats
 *      blocked_on_user goals as non-pending, so they drop out of the
 *      scheduler queue. When the user answers, a separate specialist
 *      (arriving commit #4) re-opens the parent goal.
 *
 * The sink interface is intentionally narrow. Commit #3 passes in a
 * `PostgresPersistence.record_active_question` bound function; commit #5
 * adds a null sink for headless test harnesses.
 *
 * @brain ACC + TPJ: self-monitoring + theory-of-mind for the user
 * @thinking social_cognition
 * @cellType spindle
 * @neurotransmitter oxytocin
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../workbench/types";

const HANDLES: readonly GoalKind[] = ["request_user_input"];

export interface ActiveQuestionSink {
  record(input: {
    user_id: string;
    generation_id: string;
    goal_id: string;
    question: string;
    target_field: string;
  }): Promise<void>;
}

export class ActiveQuestionHandler implements Specialist {
  readonly id = "active_question_handler";
  readonly display_name = "Active Question Handler";
  readonly brain_region = "acc_tpj";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 5;

  constructor(
    private readonly sink: ActiveQuestionSink,
    /**
     * The user_id used for `active_questions.user_id`. In the current
     * single-tenant runtime it's supplied at construction; commit #4
     * threads it through the blackboard (it's already on `Blackboard.user_id`).
     */
    private readonly user_id_override?: string,
  ) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const question = typeof goal.payload?.question === "string" ? goal.payload.question : null;
    const target_field =
      typeof goal.payload?.target_field === "string" ? goal.payload.target_field : null;

    if (!question || !target_field) {
      return {
        writes: [],
        audit: {
          specialist: this.id,
          micro_stage: "missing_payload",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ refused: true }),
          justification: "goal payload missing question/target_field — cannot record",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const user_id = this.user_id_override ?? ctx.blackboard.user_id;

    await this.sink.record({
      user_id,
      generation_id: ctx.blackboard.generation_id,
      goal_id: goal.id,
      question,
      target_field,
    });

    return {
      writes: [],
      satisfied_goal_ids: [], // goal is blocked, not satisfied
      new_goals: [],
      // Signal to the orchestrator via a blackboard write that this goal
      // is blocked_on_user. The orchestrator's state-machine semantics
      // land in commit #4; for now we just record the handoff in the
      // audit trail so the trace UI can surface it.
      audit: {
        specialist: this.id,
        micro_stage: "recorded",
        inputs_hash: AuditTrail.hash({ goal_id: goal.id, question, target_field }),
        output_hash: AuditTrail.hash({ recorded: true }),
        justification: `recorded active question for goal ${goal.id} (target=${target_field})`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: [],
      },
    };
  }
}
