import { createClient } from "@/lib/supabase/server";

export async function logOnboardingEvent(params: {
  userId: string;
  sessionId?: string;
  eventType: string;
  payload?: unknown;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("onboarding_events").insert({
    user_id: params.userId,
    session_id: params.sessionId ?? null,
    event_type: params.eventType,
    payload: params.payload ?? {},
  });

  if (error) {
    if (
      error.code === "42P01" ||
      error.message.includes("onboarding_events") ||
      error.message.includes("schema cache")
    ) {
      return;
    }
    console.warn("[onboarding/events] Failed to log event", params.eventType, error.message);
  }
}
