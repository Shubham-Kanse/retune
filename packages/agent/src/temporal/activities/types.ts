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
 *
 * v003 Phase 2 — payload parity: GenerationSeed now carries the full
 * input payload so the Temporal path is semantically equivalent to the
 * in-memory path. The legacy fields (jd_title, company) are kept for
 * backwards-compat with workflows started before this change.
 */

export interface GenerationSeed {
  generation_id: string;
  user_id: string;
  jd_id: string;
  jd_title?: string;
  company?: string;
  market?: "US" | "UK";
  /** Full JD body. Required when `jd_url` is not set. */
  jd_text?: string;
  /** Source URL (the worker fetches via Jina if `jd_text` is absent). */
  jd_url?: string;
  /** Free-form profile / resume body — drives extract_voice_fingerprint. */
  profile_text?: string;
  /** 004 §11 — full CareerProfileV1 JSON. */
  career_profile?: unknown;
  /** 004 §11 — derived CareerUnderstandingV1 JSON. */
  career_understanding?: unknown;
  /** Idempotency key from the upstream request. */
  idempotency_key?: string;
  /** Stable request hash — useful for cross-checking durable rows. */
  jd_hash?: string;
  /** Optional preflight id linking back to generation_preflights row. */
  preflight_id?: string;
  /** SOTA quality mode (`fast` | `balanced` | `frontier`). */
  quality_mode?: "fast" | "balanced" | "frontier";
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
