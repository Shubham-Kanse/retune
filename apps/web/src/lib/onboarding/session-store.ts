import { createClient } from "@/lib/supabase/server";
import type { SessionState, UserCareerProfile, OnboardingMeta, StoredMessage, ProfileField } from "./types";

function emptyField<T>(v: T): ProfileField<T> {
  return { value: v, source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" };
}

export function createEmptyProfile(userId: string): UserCareerProfile {
  return {
    id: "", userId,
    identity: { fullName: emptyField(""), email: emptyField(""), phone: emptyField(""), location: emptyField(""), linkedin: emptyField(""), github: emptyField(""), portfolio: emptyField("") },
    professionalProfile: { currentTitles: emptyField([]), professionalIdentities: emptyField([]), yearsOfExperience: emptyField(0), domainExperience: emptyField([]) },
    experience: emptyField([]),
    education: emptyField([]),
    skills: { technical: emptyField([]), tools: emptyField([]), business: emptyField([]), methodologies: emptyField([]), softSkills: emptyField([]), domainSkills: emptyField([]) },
    projects: emptyField([]),
    certifications: emptyField([]),
    careerIntent: { interestedRoles: emptyField([]), careerDirection: emptyField(""), preferredMarkets: emptyField([]), workPreference: emptyField(""), seniorityComfort: emptyField([]), industriesOfInterest: emptyField([]) },
    resumeWritingPreferences: { emphasisAreas: emptyField([]), deEmphasisAreas: emptyField([]) },
  };
}

export function createEmptyMeta(): OnboardingMeta {
  return {
    currentPhase: "orb_intro",
    answeredQuestionKeys: [],
    skippedQuestionKeys: [],
    resumeUploaded: false,
    resumeParsed: false,
    resumeSummarized: false,
    identityConfirmed: false,
    experienceConfirmed: false,
    educationConfirmed: false,
    skillsConfirmed: false,
    enhancementTurns: 0,
    resetCount: 0,
  };
}

function parseProfile(raw: unknown, userId: string): UserCareerProfile {
  if (!raw || typeof raw !== "object") return createEmptyProfile(userId);
  const obj = raw as Record<string, unknown>;
  // Check if it's the new format (has identity.fullName as ProfileField)
  if (obj.identity && typeof obj.identity === "object" && (obj.identity as any).fullName?.value !== undefined) {
    return obj as unknown as UserCareerProfile;
  }
  // Legacy format — return empty profile
  return createEmptyProfile(userId);
}

function parseMeta(raw: unknown): OnboardingMeta {
  if (!raw || typeof raw !== "object") return createEmptyMeta();
  const obj = raw as Record<string, unknown>;
  // Check if it's the new format (has currentPhase)
  if (typeof obj.currentPhase === "string") return obj as unknown as OnboardingMeta;
  // Legacy format (was just a string like "collecting") — return empty meta
  return createEmptyMeta();
}

export async function getOrCreateSession(userId: string): Promise<SessionState> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      responseChainId: existing.response_chain_id ?? null,
      profile: parseProfile(existing.profile_delta, userId),
      meta: parseMeta(existing.onboarding_state),
      messages: Array.isArray(existing.messages) ? existing.messages : [],
      turnCount: existing.turn_count ?? 0,
    };
  }

  const emptyProfile = createEmptyProfile(userId);
  const emptyMeta = createEmptyMeta();

  const { data: created, error } = await supabase
    .from("onboarding_sessions")
    .insert({ user_id: userId, profile_delta: emptyProfile, onboarding_state: emptyMeta })
    .select("*")
    .single();

  if (error || !created) throw new Error(`Failed to create session: ${error?.message}`);
  return { id: created.id, userId, responseChainId: null, profile: emptyProfile, meta: emptyMeta, messages: [], turnCount: 0 };
}

export async function saveSession(userId: string, state: SessionState): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("onboarding_sessions")
    .update({
      response_chain_id: state.responseChainId,
      profile_delta: state.profile,
      onboarding_state: state.meta,
      messages: state.messages,
      turn_count: state.turnCount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}
