export interface AgentEvent {
  type:
    | "step_start"
    | "step_complete"
    | "step_warning"
    | "step_error"
    | "agent_log"
    | "tool_call"
    | "tool_result"
    | "ats_score"
    | "gap_detected"
    | "user_action_required"
    | "file_ready"
    | "content_chunk"
    | "error"
    | "complete";
  data: Record<string, unknown>;
  timestamp: number;
}

export type EventCallback = (event: AgentEvent) => void;

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  cacheHitRate: number;
}

export interface AgentResult {
  text: string;
  iterations: number;
  tokenUsage?: TokenUsageSummary;
}

export interface AgentParams {
  userMessage: string;
  workspace: string;
  onEvent: EventCallback;
  signal?: AbortSignal;
  /** User ID for concurrency control and monitoring */
  userId: string;
  /** Typed profile for subagent prompt assembly */
  profile?: import("@retune/db").CandidateProfile;
  /** Market for locale-specific rules */
  market?: "us" | "uk";
  /** Pipeline options */
  options?: {
    proceedDespiteWeakFit?: boolean; // Allow generation even if role fit is WEAK_FIT
    proceedDespiteDoNotApply?: boolean; // Allow generation even if role fit is DO_NOT_APPLY
  };
}
