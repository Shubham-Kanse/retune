import { createClient } from "@/lib/supabase/server";

export async function logOnboardingEvent(params: {
  userId: string;
  sessionId?: string;
  eventType: string;
  traceId?: string;
  phase?: string;
  durationMs?: number;
  aiModel?: string;
  aiLatencyMs?: number;
  aiCostUsd?: number;
  errorCode?: string;
  payload?: unknown;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("onboarding_events").insert({
    user_id: params.userId,
    session_id: params.sessionId ?? null,
    trace_id: params.traceId ?? null,
    event_type: params.eventType,
    phase: params.phase ?? null,
    duration_ms: params.durationMs ?? null,
    ai_model: params.aiModel ?? null,
    ai_latency_ms: params.aiLatencyMs ?? null,
    ai_cost_usd: params.aiCostUsd ?? null,
    error_code: params.errorCode ?? null,
    payload: redactEventPayload(params.payload ?? {}),
  });

  if (error) {
    if (process.env.NODE_ENV !== "production" && (
      error.code === "42P01" ||
      error.message.includes("onboarding_events") ||
      error.message.includes("schema cache")
    )) {
      return;
    }
    console.warn("[onboarding/events] Failed to log event", params.eventType, error.message);
  }
}

function redactEventPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactEventPayload);
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (lower.includes("resume") && (lower.includes("text") || lower.includes("raw"))) {
      out[key] = "[redacted]";
      continue;
    }
    if (lower.includes("profile") && typeof raw === "object") {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof raw === "string" && raw.length > 500) {
      out[key] = `${raw.slice(0, 500)}…`;
      continue;
    }
    out[key] = redactEventPayload(raw);
  }
  return out;
}
