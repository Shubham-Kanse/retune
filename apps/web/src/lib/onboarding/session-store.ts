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
  if (typeof raw === "string") {
    if (!raw.trim()) return createEmptyMeta();
    try {
      return parseMeta(JSON.parse(raw));
    } catch {
      return { ...createEmptyMeta(), currentPhase: raw as OnboardingMeta["currentPhase"] };
    }
  }
  if (!raw || typeof raw !== "object") return createEmptyMeta();
  const obj = raw as Record<string, unknown>;
  // Check if it's the new format (has currentPhase)
  if (typeof obj.currentPhase === "string") return obj as unknown as OnboardingMeta;
  // Legacy format (was just a string like "collecting") — return empty meta
  return createEmptyMeta();
}

function hasUsableMeta(raw: unknown): boolean {
  if (typeof raw === "string") return raw.trim().length > 0;
  if (!raw || typeof raw !== "object") return false;
  return typeof (raw as Record<string, unknown>).currentPhase === "string";
}

function hasExtractedProfileData(profile: UserCareerProfile): boolean {
  return Boolean(
    profile.identity.fullName.value ||
      profile.identity.email.value ||
      profile.identity.location.value ||
      profile.experience.value.length > 0 ||
      profile.education.value.length > 0 ||
      profile.skills.technical.value.length > 0 ||
      profile.skills.tools.value.length > 0 ||
      profile.skills.business.value.length > 0,
  );
}

function reconcileMetaWithStoredData(
  meta: OnboardingMeta,
  profile: UserCareerProfile,
  messages: StoredMessage[],
): OnboardingMeta {
  const next = { ...createEmptyMeta(), ...meta };

  if (hasExtractedProfileData(profile)) {
    next.resumeUploaded = true;
    next.resumeParsed = true;
    if (next.currentPhase === "orb_intro" || next.currentPhase === "resume_upload" || next.currentPhase === "resume_parsing") {
      next.currentPhase = "resume_summary";
    }
  }

  const answered = new Set(next.answeredQuestionKeys);
  for (const message of messages) {
    if (message.role === "assistant" && message.questionKey) {
      next.lastQuestionKey = message.questionKey;
    }
    if (message.role !== "user") continue;
    const content = message.content.trim().toLowerCase();
    if (content === "looks mostly correct" || content === "looks good, continue" || content === "confirm_summary") {
      next.resumeSummarized = true;
      answered.add("resume_summary");
    }
    if (content === "looks correct") {
      const last = next.lastQuestionKey;
      if (last === "identity_confirm") next.identityConfirmed = true;
      if (last === "experience_confirm") next.experienceConfirmed = true;
      if (last === "education_confirm") next.educationConfirmed = true;
    }
    if (content === "keep these skills" || content === "keep all") {
      next.skillsConfirmed = true;
    }
  }

  next.answeredQuestionKeys = [...answered];
  return next;
}

export async function getOrCreateSession(userId: string): Promise<SessionState> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const profile = parseProfile(existing.profile_delta, userId);
    const messages = Array.isArray(existing.messages) ? existing.messages : [];
    const rawMeta = hasUsableMeta(existing.metadata) ? existing.metadata : existing.onboarding_state;
    return {
      id: existing.id,
      userId: existing.user_id,
      responseChainId: existing.response_chain_id ?? null,
      profile,
      meta: reconcileMetaWithStoredData(parseMeta(rawMeta), profile, messages),
      messages,
      turnCount: existing.turn_count ?? 0,
    };
  }

  const emptyProfile = createEmptyProfile(userId);
  const emptyMeta = createEmptyMeta();

  const { data: created, error } = await supabase
    .from("onboarding_sessions")
    .insert({ user_id: userId, profile_delta: emptyProfile, onboarding_state: emptyMeta, metadata: emptyMeta })
    .select("*")
    .single();

  if (error || !created) {
    const { data: fallbackCreated, error: fallbackError } = await supabase
      .from("onboarding_sessions")
      .insert({ user_id: userId, profile_delta: emptyProfile, onboarding_state: JSON.stringify(emptyMeta) })
      .select("*")
      .single();

    if (fallbackError || !fallbackCreated) throw new Error(`Failed to create session: ${fallbackError?.message ?? error?.message}`);
    return { id: fallbackCreated.id, userId, responseChainId: null, profile: emptyProfile, meta: emptyMeta, messages: [], turnCount: 0 };
  }

  return { id: created.id, userId, responseChainId: null, profile: emptyProfile, meta: emptyMeta, messages: [], turnCount: 0 };
}

export async function saveSession(userId: string, state: SessionState): Promise<void> {
  const supabase = await createClient();
  const payload = {
    response_chain_id: state.responseChainId,
    profile_delta: state.profile,
    onboarding_state: state.meta,
    metadata: state.meta,
    messages: state.messages,
    turn_count: state.turnCount,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("onboarding_sessions")
    .update(payload)
    .eq("user_id", userId);

  if (!error) return;

  const { metadata: _unusedMetadata, ...fallbackPayload } = payload;
  const { error: fallbackError } = await supabase
    .from("onboarding_sessions")
    .update({
      ...fallbackPayload,
      onboarding_state: JSON.stringify(state.meta),
    })
    .eq("user_id", userId);

  if (fallbackError) {
    throw new Error(`Failed to save onboarding session: ${fallbackError.message}`);
  }
}
