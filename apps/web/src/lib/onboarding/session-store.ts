import { createClient } from "@/lib/supabase/server";
import type { SessionState, UserCareerProfile, OnboardingMeta, StoredMessage, ProfileField } from "./types";
import { CAREER_PROFILE_VERSION, emptyParseQuality } from "./career-profile.schema";

function emptyField<T>(v: T): ProfileField<T> {
  return { value: v, source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "", evidence: [], editHistory: [] };
}

export function createEmptyProfile(userId: string): UserCareerProfile {
  const now = new Date().toISOString();
  return {
    schemaVersion: CAREER_PROFILE_VERSION,
    id: crypto.randomUUID(),
    userId,
    identity: {
      fullName: emptyField(""),
      email: emptyField(""),
      phone: emptyField(""),
      location: emptyField(""),
      linkedin: emptyField(""),
      github: emptyField(""),
      portfolio: emptyField(""),
      website: emptyField(""),
    },
    professionalProfile: {
      currentTitles: emptyField([]),
      professionalIdentities: emptyField([]),
      yearsOfExperience: emptyField(null),
      summarySignals: emptyField([]),
      domainExperience: emptyField([]),
      careerHighlights: emptyField([]),
    },
    experience: emptyField([]),
    education: emptyField([]),
    skills: { technical: emptyField([]), tools: emptyField([]), business: emptyField([]), methodologies: emptyField([]), softSkills: emptyField([]), domainSkills: emptyField([]) },
    projects: emptyField([]),
    certifications: emptyField([]),
    languages: emptyField([]),
    awards: emptyField([]),
    publications: emptyField([]),
    volunteering: emptyField([]),
    careerIntent: {
      interestedRoles: emptyField([]),
      careerDirection: emptyField(""),
      preferredMarkets: emptyField([]),
      workPreference: emptyField(""),
      seniorityComfort: emptyField([]),
      industriesOfInterest: emptyField([]),
      roleDealbreakers: emptyField([]),
    },
    resumeWritingPreferences: {
      emphasisAreas: emptyField([]),
      deEmphasisAreas: emptyField([]),
      toneSignals: emptyField([]),
      styleConstraints: emptyField([]),
    },
    onboarding: {
      currentPhase: "orb_intro",
      parseQuality: emptyParseQuality(),
      readiness: null,
      resumeUploaded: false,
      resumeParsed: false,
      resumeSummarized: false,
      educationNotApplicable: false,
      completedAt: null,
    },
    createdAt: now,
    updatedAt: now,
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
    projectsCertificationsReviewed: false,
    extrasConfirmed: false,
    experienceMetricsPrompted: false,
    educationNotApplicable: false,
    optionalTonePrompted: false,
    enhancementTurns: 0,
    stepHistory: [],
    resetCount: 0,
    status: "draft",
    resumeFileHash: null,
    extractionStatus: null,
    completedAt: null,
  };
}

function ensureField<T>(field: Partial<ProfileField<T>> | undefined, fallback: T): ProfileField<T> {
  return {
    value: field?.value === undefined ? fallback : field.value,
    source: field?.source ?? "system",
    confidence: typeof field?.confidence === "number" ? field.confidence : 0,
    confirmed: Boolean(field?.confirmed),
    lastUpdatedAt: field?.lastUpdatedAt ?? "",
    evidence: Array.isArray(field?.evidence) ? field.evidence : [],
    editHistory: Array.isArray(field?.editHistory) ? field.editHistory : [],
  };
}

function upgradeProfile(raw: Record<string, unknown>, userId: string): UserCareerProfile {
  const base = createEmptyProfile(userId);
  const current = raw as any;
  const profile = {
    ...base,
    ...current,
    schemaVersion: CAREER_PROFILE_VERSION,
    userId,
    identity: {
      ...base.identity,
      ...(current.identity ?? {}),
      fullName: ensureField(current.identity?.fullName, ""),
      email: ensureField(current.identity?.email, ""),
      phone: ensureField(current.identity?.phone, ""),
      location: ensureField(current.identity?.location, ""),
      linkedin: ensureField(current.identity?.linkedin, ""),
      github: ensureField(current.identity?.github, ""),
      portfolio: ensureField(current.identity?.portfolio, ""),
      website: ensureField(current.identity?.website, ""),
    },
    professionalProfile: {
      ...base.professionalProfile,
      ...(current.professionalProfile ?? {}),
      currentTitles: ensureField(current.professionalProfile?.currentTitles, []),
      professionalIdentities: ensureField(current.professionalProfile?.professionalIdentities, []),
      yearsOfExperience: ensureField(current.professionalProfile?.yearsOfExperience, null),
      summarySignals: ensureField(current.professionalProfile?.summarySignals, []),
      domainExperience: ensureField(current.professionalProfile?.domainExperience, []),
      careerHighlights: ensureField(current.professionalProfile?.careerHighlights, []),
    },
    experience: ensureField(current.experience, []),
    education: ensureField(current.education, []),
    skills: {
      ...base.skills,
      ...(current.skills ?? {}),
      technical: ensureField(current.skills?.technical, []),
      tools: ensureField(current.skills?.tools, []),
      business: ensureField(current.skills?.business, []),
      methodologies: ensureField(current.skills?.methodologies, []),
      softSkills: ensureField(current.skills?.softSkills, []),
      domainSkills: ensureField(current.skills?.domainSkills, []),
    },
    projects: ensureField(current.projects, []),
    certifications: ensureField(current.certifications, []),
    languages: ensureField(current.languages, []),
    awards: ensureField(current.awards, []),
    publications: ensureField(current.publications, []),
    volunteering: ensureField(current.volunteering, []),
    careerIntent: {
      ...base.careerIntent,
      ...(current.careerIntent ?? {}),
      interestedRoles: ensureField(current.careerIntent?.interestedRoles, []),
      careerDirection: ensureField(current.careerIntent?.careerDirection, ""),
      preferredMarkets: ensureField(current.careerIntent?.preferredMarkets, []),
      workPreference: ensureField(current.careerIntent?.workPreference, ""),
      seniorityComfort: ensureField(current.careerIntent?.seniorityComfort, []),
      industriesOfInterest: ensureField(current.careerIntent?.industriesOfInterest, []),
      roleDealbreakers: ensureField(current.careerIntent?.roleDealbreakers, []),
    },
    resumeWritingPreferences: {
      ...base.resumeWritingPreferences,
      ...(current.resumeWritingPreferences ?? {}),
      emphasisAreas: ensureField(current.resumeWritingPreferences?.emphasisAreas, []),
      deEmphasisAreas: ensureField(current.resumeWritingPreferences?.deEmphasisAreas, []),
      toneSignals: ensureField(current.resumeWritingPreferences?.toneSignals, []),
      styleConstraints: ensureField(current.resumeWritingPreferences?.styleConstraints, []),
    },
    onboarding: {
      ...base.onboarding,
      ...(current.onboarding ?? {}),
      parseQuality: {
        ...base.onboarding.parseQuality,
        ...(current.onboarding?.parseQuality ?? {}),
      },
    },
    updatedAt: new Date().toISOString(),
  } satisfies UserCareerProfile;
  return profile;
}

function parseProfile(raw: unknown, userId: string): UserCareerProfile {
  if (!raw || typeof raw !== "object") return createEmptyProfile(userId);
  const obj = raw as Record<string, unknown>;
  // UserCareerProfile has identity.fullName as a ProfileField<string> with a .value property.
  // careerProfileSchema validates CareerProfileV1 (the finalized format), not this in-session format.
  if (obj.identity && typeof obj.identity === "object" && (obj.identity as any).fullName?.value !== undefined) {
    return upgradeProfile(obj, userId);
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
    next.extractionStatus = next.extractionStatus ?? "done";
    if (next.currentPhase === "orb_intro" || next.currentPhase === "resume_upload" || next.currentPhase === "resume_parsing") {
      next.currentPhase = "resume_summary";
    }
  }

  profile.onboarding.currentPhase = next.currentPhase;
  profile.onboarding.resumeUploaded = next.resumeUploaded;
  profile.onboarding.resumeParsed = next.resumeParsed;
  profile.onboarding.resumeSummarized = next.resumeSummarized;
  profile.onboarding.educationNotApplicable = next.educationNotApplicable;
  profile.onboarding.completedAt = next.completedAt ?? null;

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
    const meta = reconcileMetaWithStoredData(parseMeta(rawMeta), profile, messages);
    return {
      id: existing.id,
      userId: existing.user_id,
      responseChainId: existing.response_chain_id ?? null,
      profile,
      meta,
      messages,
      turnCount: existing.turn_count ?? 0,
      version: existing.version ?? 0,
      status: existing.status ?? meta.status ?? "draft",
      resumeFileHash: existing.resume_file_hash ?? meta.resumeFileHash ?? null,
      extractionStatus: existing.extraction_status ?? meta.extractionStatus ?? null,
      completedAt: existing.completed_at ?? meta.completedAt ?? null,
    };
  }

  const emptyProfile = createEmptyProfile(userId);
  const emptyMeta = createEmptyMeta();

  const { data: created, error } = await supabase
    .from("onboarding_sessions")
      .insert({
        user_id: userId,
        profile_delta: emptyProfile,
        onboarding_state: emptyMeta,
        metadata: emptyMeta,
        version: 0,
        status: "draft",
      })
    .select("*")
    .single();

  if (error || !created) {
    const { data: fallbackCreated, error: fallbackError } = await supabase
      .from("onboarding_sessions")
      .insert({ user_id: userId, profile_delta: emptyProfile, onboarding_state: JSON.stringify(emptyMeta) })
      .select("*")
      .single();

    if (fallbackError || !fallbackCreated) throw new Error(`Failed to create session: ${fallbackError?.message ?? error?.message}`);
    return { id: fallbackCreated.id, userId, responseChainId: null, profile: emptyProfile, meta: emptyMeta, messages: [], turnCount: 0, version: 0, status: "draft", resumeFileHash: null, extractionStatus: null, completedAt: null };
  }

  return { id: created.id, userId, responseChainId: null, profile: emptyProfile, meta: emptyMeta, messages: [], turnCount: 0, version: created.version ?? 0, status: "draft", resumeFileHash: null, extractionStatus: null, completedAt: null };
}

export async function saveSession(userId: string, state: SessionState): Promise<void> {
  const supabase = await createClient();
  state.profile.onboarding.currentPhase = state.meta.currentPhase;
  state.profile.onboarding.resumeUploaded = state.meta.resumeUploaded;
  state.profile.onboarding.resumeParsed = state.meta.resumeParsed;
  state.profile.onboarding.resumeSummarized = state.meta.resumeSummarized;
  state.profile.onboarding.educationNotApplicable = state.meta.educationNotApplicable;
  state.profile.onboarding.completedAt = state.meta.completedAt ?? state.completedAt ?? null;
  state.profile.updatedAt = new Date().toISOString();
  const payload = {
    response_chain_id: state.responseChainId,
    profile_delta: state.profile,
    onboarding_state: state.meta,
    metadata: state.meta,
    messages: state.messages,
    turn_count: state.turnCount,
    status: state.status ?? state.meta.status ?? "draft",
    resume_file_hash: state.resumeFileHash ?? state.meta.resumeFileHash ?? null,
    extraction_status: state.extractionStatus ?? state.meta.extractionStatus ?? null,
    completed_at: state.completedAt ?? state.meta.completedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("onboarding_sessions")
    .update({ ...payload, version: state.version + 1 })
    .eq("user_id", userId)
    .eq("version", state.version)
    .select("id, version")
    .maybeSingle();

  if (!error && data) {
    state.version = data.version ?? state.version + 1;
    return;
  }

  if (!error && !data) {
    throw new Error("Onboarding session changed while saving. Please retry the last action.");
  }

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
