// Onboarding V2 — Session CRUD Operations & Security Guardrails
//
// All session reads/writes for the onboarding pipeline flow through this
// module. updateSession uses optimistic locking via the `version` column to
// avoid lost-update races between concurrent requests for the same user
// (e.g. upload streaming + correction message firing in parallel).

import { createClient } from "@/lib/supabase/server";
import { SessionWriteError } from "./errors";
import { type OnboardingV2Session, type OnboardingV2Status, createEmptySession } from "./types";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown>
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export async function loadSession(userId: string): Promise<OnboardingV2Session | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_v2_sessions")
    .select("session_state, version")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data.session_state as OnboardingV2Session;
}

export async function loadSessionWithVersion(
  userId: string,
): Promise<{ session: OnboardingV2Session; version: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_v2_sessions")
    .select("session_state, version")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return {
    session: data.session_state as OnboardingV2Session,
    version: data.version as number,
  };
}

export async function createSession(userId: string): Promise<OnboardingV2Session> {
  const session = createEmptySession(userId);
  const supabase = await createClient();
  const { error } = await supabase.from("onboarding_v2_sessions").upsert(
    {
      id: session.session_id,
      user_id: userId,
      session_state: session,
      onboarding_status: session.onboarding_status,
      version: 1,
    },
    { onConflict: "user_id" },
  );

  if (error) throw new SessionWriteError(new Error(error.message));
  return session;
}

export async function updateSession(
  userId: string,
  updates: DeepPartial<OnboardingV2Session>,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const supabase = await createClient();
    const existing = await loadSessionWithVersion(userId);
    if (!existing) throw new SessionWriteError(new Error("Session not found"));

    const merged = deepMerge(
      existing.session as unknown as Record<string, unknown>,
      updates as unknown as Record<string, unknown>,
    ) as unknown as OnboardingV2Session;
    const newStatus =
      (updates as { onboarding_status?: OnboardingV2Status }).onboarding_status ??
      existing.session.onboarding_status;

    const { data, error } = await supabase
      .from("onboarding_v2_sessions")
      .update({
        session_state: merged,
        onboarding_status: newStatus,
        version: existing.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("version", existing.version) // optimistic lock
      .select();

    if (!error && data && data.length > 0) return;

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 50 * attempt));
      continue;
    }
    throw new SessionWriteError(new Error(error?.message || "Version conflict after 3 retries"));
  }
}

export async function deleteSession(userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("onboarding_v2_sessions").delete().eq("user_id", userId);
}

export async function markSessionCommitted(userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("onboarding_v2_sessions")
    .update({
      onboarding_status: "committed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

// --- Security guardrails ---

/**
 * Verify the supplied sessionId actually belongs to the authenticated user.
 * Use before any operation that takes a sessionId from the request body to
 * prevent cross-user session access.
 */
export async function validateSessionOwnership(
  sessionId: string,
  authenticatedUserId: string,
): Promise<boolean> {
  if (!sessionId || !authenticatedUserId) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_v2_sessions")
    .select("user_id")
    .eq("id", sessionId)
    .single();
  return data?.user_id === authenticatedUserId;
}

/**
 * Reject duplicate commits — once a profile is committed, the session is
 * frozen. This guards against double-submit replay (network retries, double
 * clicks) writing user_profiles_v2 twice.
 */
export async function validateCommitIdempotency(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_v2_sessions")
    .select("onboarding_status")
    .eq("user_id", userId)
    .single();
  return data?.onboarding_status !== "committed";
}

// --- Helpers ---

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        val as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}
