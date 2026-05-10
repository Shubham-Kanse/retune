/**
 * Activity contract — what the workflow can call.
 *
 * The workflow uses `proxyActivities<ActivityFns>(...)` to get a typed
 * callable; at runtime each call is routed to the worker process where
 * the activity is actually implemented.
 *
 * Activities:
 *   - `runGeneration`       — seed goals + run orchestrator from tick 0
 *   - `resumeGeneration`    — load from DB and continue
 *   - `recordAnswer`        — atomic DB update: mark answered, re-open parent goal
 */

export interface GenerationSeed {
  generation_id: string;
  user_id: string;
  jd_id: string;
  jd_title?: string;
  company?: string;
  market?: "US" | "UK";
}

export interface GenerationOutcome {
  termination: string;
  ticks_executed: number;
  total_cost_usd: number;
  total_latency_ms: number;
  /**
   * True when the run exited because a `request_user_input` goal is
   * pending. The workflow then suspends on `userAnsweredSignal` until
   * the client answers.
   */
  has_pending_user_input: boolean;
}

export interface ResumeInput {
  generation_id: string;
}

export interface RecordAnswerInput {
  generation_id: string;
  question_id: string;
  answer_text: string;
}

export interface RecordAnswerResult {
  parent_goal_id: string;
  reopened: boolean;
}

export interface ActivityFns {
  runGeneration(input: GenerationSeed): Promise<GenerationOutcome>;
  resumeGeneration(input: ResumeInput): Promise<GenerationOutcome>;
  recordAnswer(input: RecordAnswerInput): Promise<RecordAnswerResult>;
}
