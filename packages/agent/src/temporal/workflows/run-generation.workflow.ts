/**
 * runGenerationWorkflow — the durable outer loop.
 *
 * Lifecycle:
 *   1. Seed + run the first orchestrator pass via `runGeneration` activity.
 *   2. If the activity returns `has_pending_user_input: true`, suspend
 *      via `condition(() => answer !== null)`. This is Temporal's native
 *      durable sleep — the workflow history is persisted, the worker
 *      can restart, and the signal still fires.
 *   3. Process the answer via `recordAnswer`, then `resumeGeneration`.
 *   4. Loop until no pending user input.
 *
 * Determinism: this workflow code runs inside an isolated v8 sandbox
 * and must be deterministic. It may NOT call Date.now(), Math.random(),
 * fs, net, or any async API outside the Temporal SDK. All side effects
 * are delegated to activities.
 *
 * @brain hippocampus + DLPFC: durable episodic memory + plan maintenance
 */

import { condition, proxyActivities, setHandler } from "@temporalio/workflow";
import type { ActivityFns, GenerationOutcome, GenerationSeed } from "../activities/types";
import {
  type StatusSnapshot,
  type UserAnsweredPayload,
  type WorkflowStatus,
  getStatusQuery,
  userAnsweredSignal,
} from "./signals";

const activities = proxyActivities<ActivityFns>({
  // 5 min covers the slowest synthetic generation; real generations are
  // well under 90s. Retried up to 3 times on worker/DB failures.
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "500ms",
    maximumInterval: "10s",
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
});

export interface RunGenerationWorkflowResult {
  termination: string;
  ticks_executed_total: number;
  total_cost_usd: number;
  loops: number;
}

export async function runGenerationWorkflow(
  input: GenerationSeed,
): Promise<RunGenerationWorkflowResult> {
  let status: WorkflowStatus = "starting";
  let last_outcome: GenerationOutcome = {
    termination: "not_started",
    ticks_executed: 0,
    total_cost_usd: 0,
    total_latency_ms: 0,
    has_pending_user_input: false,
  };
  let ticks_total = 0;
  let cost_total = 0;
  let loops = 0;

  // Per-workflow buffer of unhandled user answers (FIFO). A signal fires
  // into this buffer; the main loop drains it when ready.
  const pending_answers: UserAnsweredPayload[] = [];

  setHandler(userAnsweredSignal, (payload) => {
    pending_answers.push(payload);
  });

  setHandler(
    getStatusQuery,
    (): StatusSnapshot => ({
      status,
      ticks_executed: ticks_total,
      total_cost_usd: cost_total,
      last_termination: last_outcome.termination,
    }),
  );

  // ─── Phase 1: initial run ───
  status = "running";
  loops++;
  last_outcome = await activities.runGeneration(input);
  ticks_total += last_outcome.ticks_executed;
  cost_total += last_outcome.total_cost_usd;

  // ─── Phase 2+: answer-loop ───
  while (last_outcome.has_pending_user_input) {
    status = "awaiting_user_answer";

    // Durable wait. If the worker crashes here, the workflow history
    // replays exactly up to this point on the next worker — the signal
    // handler re-registers and any buffered answers are preserved.
    await condition(() => pending_answers.length > 0);

    const answer = pending_answers.shift();
    if (!answer) continue; // defensive; condition(...) guarantees this

    status = "running";
    loops++;

    await activities.recordAnswer({
      generation_id: input.generation_id,
      question_id: answer.question_id,
      answer_text: answer.answer_text,
    });

    last_outcome = await activities.resumeGeneration({
      generation_id: input.generation_id,
    });
    ticks_total += last_outcome.ticks_executed;
    cost_total += last_outcome.total_cost_usd;
  }

  status = "completed";

  return {
    termination: last_outcome.termination,
    ticks_executed_total: ticks_total,
    total_cost_usd: cost_total,
    loops,
  };
}
