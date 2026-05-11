import type { TraceDoneSummary } from "./trace-bus";

export type GenerationRunStatus = "running" | "completed" | "failed" | "cancelled";

export interface GenerationCompletionEvent {
  status: Exclude<GenerationRunStatus, "running">;
  termination: string | null;
  ticks_executed: number;
  total_cost_usd: number;
  total_latency_ms: number;
  error_message: string | null;
}

function statusFromTermination(termination: string | null): Exclude<GenerationRunStatus, "running"> {
  if (!termination) return "completed";
  if (termination === "aborted" || termination === "cancelled") return "cancelled";
  if (termination === "no_open_work") return "completed";
  return "failed";
}

export function completionFromDone(summary: TraceDoneSummary): GenerationCompletionEvent {
  return {
    status: statusFromTermination(summary.termination),
    termination: summary.termination,
    ticks_executed: summary.ticks_executed,
    total_cost_usd: summary.total_cost_usd,
    total_latency_ms: summary.total_latency_ms,
    error_message: null,
  };
}

export function completionFromError(message: string): GenerationCompletionEvent {
  return {
    status: "failed",
    termination: "error",
    ticks_executed: 0,
    total_cost_usd: 0,
    total_latency_ms: 0,
    error_message: message,
  };
}

export function statusFromPersistenceRow(row: {
  completed_at: Date | string | null;
  termination: string | null;
}): GenerationRunStatus {
  if (!row.completed_at) return "running";
  return statusFromTermination(row.termination);
}

export function resultStatusFromMeta(meta: {
  verdict: string | null;
  termination: string | null;
}): "running" | "complete" | "refused" | "error" | "unknown" {
  if (meta.verdict === "refuse") return "refused";
  if (meta.verdict === "ship" || meta.verdict === "revise") return "complete";
  if (!meta.termination) return "running";
  if (meta.termination === "no_open_work") return "complete";
  if (meta.termination === "aborted" || meta.termination === "cancelled") return "error";
  return "error";
}
