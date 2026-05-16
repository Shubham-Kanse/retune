import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import {
  CAREER_PROFILE_VERSION,
  careerProfileToNormalized,
  isCareerProfileV1,
} from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import { createClient } from "@/lib/supabase/server";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import type { ProfileNormalized } from "../contracts";
import { buildProfileMarkdown } from "../services/markdown";
import { parseJsonSafe, stringifyJson } from "../utils/json";

/**
 * Wipe every onboarding-derived row for a user so a fresh onboarding session
 * can run from scratch. Deliberately scoped to onboarding outputs:
 *   - profiles            (career profile + understanding live here)
 *   - resume_ingestions   (cached resume extraction; without this, re-uploading
 *                          the same file would short-circuit to the old cached
 *                          extraction instead of re-extracting)
 *   - users.onboarding_completed → false
 *
 * Kept on purpose:
 *   - onboarding_events   (telemetry / audit trail across attempts)
 *   - generations, applications, billing — NOT onboarding outputs.
 *
 * This is "reset onboarding", not "delete account".
 */
export async function wipeUserOnboardingData(userId: string): Promise<void> {
  await dbModule.db.transaction(async (tx) => {
    await tx.delete(dbModule.profiles).where(eq(dbModule.profiles.userId, userId));
    await tx.delete(dbModule.resumeIngestions).where(eq(dbModule.resumeIngestions.userId, userId));
    await tx
      .update(dbModule.users)
      .set({ onboardingCompleted: false, onboardingCompletedAt: null })
      .where(eq(dbModule.users.id, userId));
  });
}

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
    careerUnderstanding: (row as { careerUnderstanding?: unknown }).careerUnderstanding ?? null,
    careerUnderstandingVersion:
      (row as { careerUnderstandingVersion?: unknown }).careerUnderstandingVersion ?? null,
    careerUnderstandingFingerprint:
      (row as { careerUnderstandingFingerprint?: unknown }).careerUnderstandingFingerprint ?? null,
    careerUnderstandingRevision:
      (row as { careerUnderstandingRevision?: unknown }).careerUnderstandingRevision ?? 0,
    careerUnderstandingStaleSince:
      (row as { careerUnderstandingStaleSince?: unknown }).careerUnderstandingStaleSince ?? null,
    careerUnderstandingUpdatedAt:
      (row as { careerUnderstandingUpdatedAt?: unknown }).careerUnderstandingUpdatedAt ?? null,
  };
}

export async function persistProfile(
  opts: PersistProfileOptions,
): Promise<{ completenessScore: number }> {
  const inputProfile = opts.profile;
  const careerProfile = isCareerProfileV1(inputProfile) ? inputProfile : null;
  const normalized: ProfileNormalized = careerProfile
    ? careerProfileToNormalized(careerProfile, opts.sessionEmail, opts.sessionFullName ?? "")
    : (inputProfile as ProfileNormalized);
  const readiness =
    opts.readiness ?? (careerProfile?.onboarding.readiness as ProfileReadiness | null) ?? null;
  const profileMarkdown = opts.profileMarkdownOverride || buildProfileMarkdown(normalized);
  const completenessScore =
    readiness?.score ?? dbModule.computeCompletenessScore({ ...normalized, profileMarkdown });
  const extra = normalized as ProfileNormalized & { deEmphasisAreas?: string[] };

  const supabase = await createClient();

  // 004 §6.3 — detect stale understanding when facts change. We do this
  // BEFORE the upsert so the comparison is against the existing row, not
  // the row we are about to write.
  let staleSinceOverride: string | undefined;
  if (careerProfile) {
    const existing = await supabase
      .from("profiles")
      .select(
        "career_understanding_fingerprint, career_understanding, career_understanding_stale_since",
      )
      .eq("user_id", opts.userId)
      .maybeSingle();
    const existingRow = existing.data as {
      career_understanding_fingerprint: string | null;
      career_understanding: unknown;
      career_understanding_stale_since: string | null;
    } | null;
    if (existingRow) {
      const hasNonEmptyUnderstanding =
        existingRow.career_understanding != null &&
        typeof existingRow.career_understanding === "object" &&
        Object.keys(existingRow.career_understanding as Record<string, unknown>).length > 0;
      if (hasNonEmptyUnderstanding && existingRow.career_understanding_fingerprint) {
        const newFp = careerProfileFingerprint(careerProfile);
        if (existingRow.career_understanding_fingerprint !== newFp) {
          staleSinceOverride =
            existingRow.career_understanding_stale_since ?? new Date().toISOString();
        }
      }
    }
  }

  // Only write columns that exist in the profiles table schema.
  // Extra columns (linkedin_url, github_url, city, country, technical_skills,
  // professional_skills, onboarding_profile, etc.) are omitted because they
  // don't exist in the Drizzle schema and cause the upsert to fail silently.
  const row: Record<string, unknown> = {
    user_id: opts.userId,
    full_name: normalized.fullName || opts.sessionFullName || "",
    email: normalized.email || opts.sessionEmail,
    phone: normalized.phone ?? null,
    linkedin: normalized.linkedin ?? null,
    location: normalized.location ?? "",
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
    voice_notes: normalized.voiceNotes ?? null,
    de_emphasis_areas:
      extra.deEmphasisAreas ?? careerProfile?.resumeWritingPreferences.deEmphasisAreas.value ?? [],
    career_profile: careerProfile ?? {},
    career_profile_version: CAREER_PROFILE_VERSION,
    profile_readiness: readiness ?? {},
    profile_markdown: profileMarkdown,
    completeness_score: completenessScore,
    ...(opts.markOnboardingCompleted ? { onboarding_completed_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  };
  if (staleSinceOverride) {
    row.career_understanding_stale_since = staleSinceOverride;
  }

  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" });
  if (error) {
    throw new Error(`[profile] Failed to persist profile: ${error.message}`);
  }

  if (opts.markOnboardingCompleted) {
    await supabase
      .from("users")
      .update({
        onboarding_completed: true,
        ...(opts.markOnboardingCompleted && "onboarding_completed_at" in row
          ? { onboarding_completed_at: row.onboarding_completed_at as string }
          : {}),
        full_name: (row.full_name as string) || opts.sessionFullName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", opts.userId);
  }

  return { completenessScore };
}
