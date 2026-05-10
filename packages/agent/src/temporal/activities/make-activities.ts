/**
 * Activity factory.
 *
 * Closes over worker-scoped state (DB handle, persistence adapter) and
 * returns the implementations that the workflow proxies into.
 *
 * Idempotency contract: every activity here MUST be idempotent on its
 * input, because Temporal retries activities on worker failures. The
 * orchestrator's per-tick Postgres transaction guarantees this on the
 * write path; `recordAnswer` achieves it via `answered_at IS NULL`
 * guards.
 */

import { active_questions, goals as goals_table } from "@retune/db/pg";
import { and, eq, isNull } from "drizzle-orm";
import { seed_initial_goals } from "../../workbench/seed-goals";
import { type SubstrateDeps, build_fresh_substrate, build_resumed_substrate } from "./substrate";
import type {
  ActivityFns,
  GenerationOutcome,
  GenerationSeed,
  RecordAnswerInput,
  RecordAnswerResult,
  ResumeInput,
} from "./types";

export function make_activities(deps: SubstrateDeps): ActivityFns {
  return {
    async runGeneration(input: GenerationSeed): Promise<GenerationOutcome> {
      const { orchestrator, goal_stack } = build_fresh_substrate({
        deps,
        generation_id: input.generation_id,
        user_id: input.user_id,
        jd_id: input.jd_id,
      });

      // §2.2: use shared helper so Temporal path seeds identical goals to API runtime.
      seed_initial_goals(goal_stack, {
        jd_title: input.jd_title,
        company: input.company,
      });

      const result = await orchestrator.run({
        generation_context: {
          user_id: input.user_id,
          jd_id: input.jd_id,
          ontology_version: "0.0.1",
        },
      });

      return to_outcome(result, await has_open_user_questions(deps, input.generation_id));
    },

    async resumeGeneration(input: ResumeInput): Promise<GenerationOutcome> {
      const substrate = await build_resumed_substrate({
        deps,
        generation_id: input.generation_id,
      });
      if (!substrate) {
        throw new Error(`generation ${input.generation_id} not found`);
      }
      const result = await substrate.orchestrator.run();
      return to_outcome(result, await has_open_user_questions(deps, input.generation_id));
    },

    async recordAnswer(input: RecordAnswerInput): Promise<RecordAnswerResult> {
      // Atomic DB work only — no orchestrator calls here. The workflow
      // calls resumeGeneration() next to actually do the cognitive work.
      return record_answer_tx(deps, input);
    },
  };
}

async function record_answer_tx(
  deps: SubstrateDeps,
  input: RecordAnswerInput,
): Promise<RecordAnswerResult> {
  // Single tx: mark answered, find parent goal, re-open it with injected answer.
  return deps.db.transaction(async (tx) => {
    const aq_rows = await tx
      .select()
      .from(active_questions)
      .where(
        and(
          eq(active_questions.id, input.question_id),
          eq(active_questions.generation_id, input.generation_id),
          isNull(active_questions.answered_at),
        ),
      )
      .limit(1);
    const aq = aq_rows[0];
    if (!aq) {
      // Either unknown question or already answered. Treat as a no-op
      // to preserve Temporal's at-least-once activity delivery semantics.
      return { parent_goal_id: "", reopened: false };
    }

    await tx
      .update(active_questions)
      .set({
        answered_at: new Date(),
        answer_text: input.answer_text,
      })
      .where(eq(active_questions.id, input.question_id));

    // Find the parent goal this active_question blocks. Its goal_id is
    // the request_user_input subgoal; the *parent* is whatever it
    // referenced. We reopen the PARENT so the orchestrator re-runs
    // TitleSchemaRetriever / CompanySchemaRetriever against the
    // corrected input. If no parent, reopen the subgoal itself (for
    // the rare free-standing ask_user case).
    const subgoal_rows = await tx
      .select()
      .from(goals_table)
      .where(eq(goals_table.id, aq.goal_id))
      .limit(1);
    const subgoal = subgoal_rows[0];
    const parent_id = subgoal?.parent_goal_id ?? aq.goal_id;

    const parent_rows = await tx
      .select()
      .from(goals_table)
      .where(eq(goals_table.id, parent_id))
      .limit(1);
    const parent = parent_rows[0];
    if (!parent) {
      return { parent_goal_id: parent_id, reopened: false };
    }

    // Inject the answer into the parent payload. Heuristic per target_field:
    //   hypotheses.role_schema     → payload.jd_title = answer
    //   hypotheses.company_schema  → payload.company  = answer
    const existing_payload = (parent.payload as Record<string, unknown> | null) ?? {};
    const updated_payload: Record<string, unknown> = { ...existing_payload };
    if (aq.target_field === "hypotheses.role_schema") {
      updated_payload.jd_title = input.answer_text;
    } else if (aq.target_field === "hypotheses.company_schema") {
      updated_payload.company = input.answer_text;
    } else {
      // Generic: stash under user_answer so downstream specialists can
      // inspect it when the mapping is unknown.
      updated_payload.user_answer = input.answer_text;
    }

    await tx
      .update(goals_table)
      .set({
        status: "pending",
        payload: updated_payload,
        updated_at: new Date(),
      })
      .where(eq(goals_table.id, parent.id));

    // Mark the subgoal satisfied if it's different from the parent.
    if (subgoal && subgoal.id !== parent.id) {
      await tx
        .update(goals_table)
        .set({
          status: "satisfied",
          satisfied_by: [...((subgoal.satisfied_by as string[] | null) ?? []), "user_answer"],
          updated_at: new Date(),
        })
        .where(eq(goals_table.id, subgoal.id));
    }

    // Touch generations.updated_at so any watchers see the bump.
    // Intentionally no ticks_executed increment — no cognitive work happened.
    return { parent_goal_id: parent.id, reopened: true };
  });
}

/**
 * Any active_questions row without answered_at and whose linked goal is
 * still blocked → the workflow should pause.
 */
async function has_open_user_questions(
  deps: SubstrateDeps,
  generation_id: string,
): Promise<boolean> {
  const rows = await deps.db
    .select({ id: active_questions.id })
    .from(active_questions)
    .where(
      and(eq(active_questions.generation_id, generation_id), isNull(active_questions.answered_at)),
    )
    .limit(1);
  return rows.length > 0;
}

function to_outcome(
  result: {
    termination: string;
    ticks_executed: number;
    total_cost_usd: number;
    total_latency_ms: number;
  },
  has_pending_user_input: boolean,
): GenerationOutcome {
  return {
    termination: result.termination,
    ticks_executed: result.ticks_executed,
    total_cost_usd: result.total_cost_usd,
    total_latency_ms: result.total_latency_ms,
    has_pending_user_input,
  };
}
