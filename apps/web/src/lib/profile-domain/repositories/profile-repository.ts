import { createClient } from "@/lib/supabase/server";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import type { ProfileNormalized } from "../contracts";
import { parseJsonSafe, stringifyJson } from "../utils/json";
import { buildProfileMarkdown } from "../services/markdown";
import {
  CAREER_PROFILE_VERSION,
  careerProfileToNormalized,
  isCareerProfileV1,
} from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";

export interface PersistProfileOptions {
  userId: string;
  sessionEmail: string;
  sessionFullName?: string | null;
  profile: ProfileNormalized | CareerProfileV1;
  markOnboardingCompleted: boolean;
  profileMarkdownOverride?: string;
  readiness?: ProfileReadiness;
}

export async function getProfileByUserId(userId: string): Promise<Record<string, unknown> | null> {
  const rows = await dbModule.db
    .select()
    .from(dbModule.profiles)
    .where(eq(dbModule.profiles.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    linkedin: row.linkedin,
    location: row.location,
    visaStatus: row.visaStatus,
    currentTitle: row.currentTitle,
    relocationPreferences: parseJsonSafe<string[]>(row.relocationPreferences, []),
    targetRoles: parseJsonSafe<string[]>(row.targetRoles, []),
    experienceLevel: row.experienceLevel,
    experience: parseJsonSafe<unknown[]>(row.experience, []),
    education: parseJsonSafe<unknown[]>(row.education, []),
    certifications: parseJsonSafe<string[]>(row.certifications, []),
    projects: parseJsonSafe<unknown[]>(row.projects, []),
    skillsTier1: parseJsonSafe<unknown[]>(row.skillsTier1, []),
    skillsTier2: parseJsonSafe<unknown[]>(row.skillsTier2, []),
    skillsTier3: parseJsonSafe<unknown[]>(row.skillsTier3, []),
    voiceNotes: row.voiceNotes,
    careerProfile: (row as { careerProfile?: unknown }).careerProfile ?? null,
    careerProfileVersion: (row as { careerProfileVersion?: unknown }).careerProfileVersion ?? null,
    profileReadiness: (row as { profileReadiness?: unknown }).profileReadiness ?? null,
  };
}

export async function persistProfile(opts: PersistProfileOptions): Promise<{ completenessScore: number }> {
  const inputProfile = opts.profile;
  const careerProfile = isCareerProfileV1(inputProfile) ? inputProfile : null;
  const normalized: ProfileNormalized = careerProfile
    ? careerProfileToNormalized(careerProfile, opts.sessionEmail, opts.sessionFullName ?? "")
    : inputProfile as ProfileNormalized;
  const readiness = opts.readiness ?? (careerProfile?.onboarding.readiness as ProfileReadiness | null) ?? null;
  const profileMarkdown = opts.profileMarkdownOverride || buildProfileMarkdown(normalized);
  const completenessScore = readiness?.score ?? dbModule.computeCompletenessScore({ ...normalized, profileMarkdown });
  const extra = normalized as ProfileNormalized & {
    professionalIdentities?: string[];
    careerDirection?: string;
    preferredMarkets?: string[];
    workPreference?: string;
    emphasisAreas?: string[];
    deEmphasisAreas?: string[];
    onboardingProfile?: unknown;
  };

  const supabase = await createClient();

  // Use Supabase JS client so TEXT[] columns (target_roles, skills, etc.)
  // are serialized correctly by PostgREST instead of being JSON-stringified
  // by postgres-js (which the Drizzle schema incorrectly types as text).
  const row = {
    user_id: opts.userId,
    full_name: normalized.fullName || opts.sessionFullName || "",
    email: normalized.email || opts.sessionEmail,
    phone: normalized.phone ?? null,
    linkedin: normalized.linkedin ?? null,
    linkedin_url: normalized.linkedin ?? null,
    github_url: careerProfile?.identity.github.value || null,
    portfolio_url: careerProfile?.identity.portfolio.value || careerProfile?.identity.website.value || null,
    location: normalized.location ?? "",
    city: splitLocation(normalized.location).city,
    country: splitLocation(normalized.location).country,
    visa_status: normalized.visaStatus ?? null,
    relocation_preferences: stringifyJson(normalized.relocationPreferences),
    target_roles: stringifyJson(normalized.targetRoles),
    experience_level: normalized.experienceLevel ?? null,
    current_title: normalized.currentTitle ?? null,
    experience: stringifyJson(normalized.experience),
    education: stringifyJson(normalized.education),
    certifications: stringifyJson(normalized.certifications),
    projects: stringifyJson(normalized.projects),
    skills_tier1: stringifyJson(normalized.skillsTier1),
    skills_tier2: stringifyJson(normalized.skillsTier2),
    skills_tier3: stringifyJson(normalized.skillsTier3),
    technical_skills: normalized.skillsTier1.map((skill) => skill.name).filter(Boolean),
    professional_skills: [...normalized.skillsTier2, ...normalized.skillsTier3].map((skill) => skill.name).filter(Boolean),
    voice_notes: normalized.voiceNotes ?? null,
    professional_summary: normalized.summary ?? normalized.voiceNotes ?? null,
    professional_identities: extra.professionalIdentities ?? [],
    career_direction: extra.careerDirection ?? null,
    preferred_markets: extra.preferredMarkets ?? [],
    work_preference: extra.workPreference ?? null,
    emphasis_areas: extra.emphasisAreas ?? [],
    de_emphasis_areas: extra.deEmphasisAreas ?? careerProfile?.resumeWritingPreferences.deEmphasisAreas.value ?? [],
    onboarding_profile: extra.onboardingProfile ?? careerProfile ?? {},
    career_profile: careerProfile ?? {},
    career_profile_version: CAREER_PROFILE_VERSION,
    profile_readiness: readiness ?? {},
    profile_markdown: profileMarkdown,
    completeness_score: completenessScore,
    ...(opts.markOnboardingCompleted ? { onboarding_completed_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    throw new Error(`[profile] Failed to persist profile: ${error.message}`);
  }

  if (opts.markOnboardingCompleted) {
    await supabase
      .from("users")
      .update({
        onboarding_completed: true,
        ...(opts.markOnboardingCompleted && "onboarding_completed_at" in row ? { onboarding_completed_at: row.onboarding_completed_at } : {}),
        full_name: row.full_name || opts.sessionFullName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.userId);
  }

  return { completenessScore };
}

function splitLocation(location: string): { city: string | null; country: string | null } {
  const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null };
  if (parts.length === 1) return { city: parts[0] ?? null, country: null };
  return { city: parts.slice(0, -1).join(", "), country: parts.at(-1) ?? null };
}
