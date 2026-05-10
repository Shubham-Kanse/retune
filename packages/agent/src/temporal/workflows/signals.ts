/**
 * Signal and query definitions shared by workflow + client.
 *
 * `userAnswered` is fired by the API when a user submits an answer to
 * an active question. The workflow suspends on `condition(() => answer)`
 * until it fires, then processes the answer and resumes the orchestrator.
 *
 * `getStatus` is a query (read-only) for observability — the API can
 * poll it to render "running / awaiting_user / done" without scanning
 * the workflow history.
 */

import { defineQuery, defineSignal } from "@temporalio/workflow";

export interface UserAnsweredPayload {
  question_id: string;
  answer_text: string;
}

export const userAnsweredSignal = defineSignal<[UserAnsweredPayload]>("userAnswered");

export type WorkflowStatus =
  | "starting"
  | "running"
  | "awaiting_user_answer"
  | "completed"
  | "failed";

export interface StatusSnapshot {
  status: WorkflowStatus;
  ticks_executed: number;
  total_cost_usd: number;
  last_termination: string | null;
}

export const getStatusQuery = defineQuery<StatusSnapshot>("getStatus");
