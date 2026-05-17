import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import { careerUnderstandingSchema } from "@/lib/career-understanding/schema";
import {
  CAREER_PROFILE_VERSION,
  careerProfileSchema,
  careerProfileToNormalized,
  isCareerProfileV1,
  profileReadinessSchema,
} from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import type { ProfileNormalized } from "../contracts";
import { buildProfileMarkdown } from "../services/markdown";
import { parseJsonSafe, stringifyJson } from "../utils/json";

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
    careerProfile: (() => {
      const raw = (row as Record<string, unknown>).careerProfile ?? null;
      const parsed = careerProfileSchema.safeParse(raw);
      if (!parsed.success && raw != null) {
        console.warn("[profile-repository] careerProfile schema mismatch", parsed.error.issues[0]?.message);
      }
      return parsed.success ? parsed.data : null;
    })(),
    careerProfileVersion: (row as Record<string, unknown>).careerProfileVersion ?? null,
    profileReadiness: (() => {
      const raw = (row as Record<string, unknown>).profileReadiness ?? null;
      const parsed = profileReadinessSchema.safeParse(raw);
      if (!parsed.success && raw != null) {
        console.warn("[profile-repository] profileReadiness schema mismatch", parsed.error.issues[0]?.message);
      }
      return parsed.success ? parsed.data : null;
    })(),
    careerUnderstanding: (() => {
      const raw = (row as Record<string, unknown>).careerUnderstanding ?? null;
      const parsed = careerUnderstandingSchema.safeParse(raw);
      if (!parsed.success && raw != null) {
        console.warn("[profile-repository] careerUnderstanding schema mismatch", parsed.error.issues[0]?.message);
      }
      return parsed.success ? parsed.data : null;
    })(),
    careerUnderstandingVersion: (row as Record<string, unknown>).careerUnderstandingVersion ?? null,
    careerUnderstandingFingerprint:
      (row as Record<string, unknown>).careerUnderstandingFingerprint ?? null,
    careerUnderstandingRevision:
      (row as Record<string, unknown>).careerUnderstandingRevision ?? 0,
    careerUnderstandingStaleSince:
      (row as Record<string, unknown>).careerUnderstandingStaleSince ?? null,
    careerUnderstandingUpdatedAt:
      (row as Record<string, unknown>).careerUnderstandingUpdatedAt ?? null,
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

  await dbModule.db.transaction(async (tx) => {
    // Pre-read for fingerprint comparison inside the transaction.
    let staleSince: Date | null = null;
    if (careerProfile) {
      const existing = await tx
        .select({
          careerUnderstandingFingerprint: dbModule.profiles.careerUnderstandingFingerprint,
          careerUnderstanding: dbModule.profiles.careerUnderstanding,
          careerUnderstandingStaleSince: dbModule.profiles.careerUnderstandingStaleSince,
        })
        .from(dbModule.profiles)
        .where(eq(dbModule.profiles.userId, opts.userId))
        .limit(1);
      const row = existing[0];
      if (row) {
        const cu = row.careerUnderstanding as Record<string, unknown> | null;
        const hasUnderstanding = cu != null && Object.keys(cu).length > 0;
        if (hasUnderstanding && row.careerUnderstandingFingerprint) {
          const newFp = careerProfileFingerprint(careerProfile);
          if (row.careerUnderstandingFingerprint !== newFp) {
            staleSince = row.careerUnderstandingStaleSince ?? new Date();
          }
        }
      }
    }

    const now = new Date();
    const values = {
      userId: opts.userId,
      fullName: normalized.fullName || opts.sessionFullName || "",
      email: normalized.email || opts.sessionEmail,
      phone: normalized.phone ?? null,
      linkedin: normalized.linkedin ?? null,
      location: normalized.location ?? "",
      visaStatus: normalized.visaStatus ?? null,
      relocationPreferences: stringifyJson(normalized.relocationPreferences),
      targetRoles: stringifyJson(normalized.targetRoles),
      experienceLevel: normalized.experienceLevel ?? null,
      currentTitle: normalized.currentTitle ?? null,
      experience: stringifyJson(normalized.experience),
      education: stringifyJson(normalized.education),
      certifications: stringifyJson(normalized.certifications),
      projects: stringifyJson(normalized.projects),
      skillsTier1: stringifyJson(normalized.skillsTier1),
      skillsTier2: stringifyJson(normalized.skillsTier2),
      skillsTier3: stringifyJson(normalized.skillsTier3),
      voiceNotes: normalized.voiceNotes ?? null,
      deEmphasisAreas: JSON.stringify(
        extra.deEmphasisAreas ??
          careerProfile?.resumeWritingPreferences.deEmphasisAreas.value ??
          [],
      ),
      careerProfile: (careerProfile ?? {}) as typeof dbModule.profiles.$inferInsert["careerProfile"],
      careerProfileVersion: CAREER_PROFILE_VERSION,
      profileReadiness: (readiness ?? {}) as typeof dbModule.profiles.$inferInsert["profileReadiness"],
      profileMarkdown,
      completenessScore,
      ...(opts.markOnboardingCompleted ? { onboardingCompletedAt: now } : {}),
      ...(staleSince ? { careerUnderstandingStaleSince: staleSince } : {}),
      updatedAt: now,
    };

    await tx
      .insert(dbModule.profiles)
      .values(values)
      .onConflictDoUpdate({
        target: dbModule.profiles.userId,
        set: values,
      });

    if (opts.markOnboardingCompleted) {
      await tx
        .update(dbModule.users)
        .set({
          onboardingCompleted: true,
          onboardingCompletedAt: now,
          fullName: normalized.fullName || opts.sessionFullName || undefined,
          updatedAt: now,
        })
        .where(eq(dbModule.users.id, opts.userId));
    }
  });

  return { completenessScore };
}

/**
 * Partial update for ad-hoc profile column changes.
 * All callers must go through here — never db.update(profiles) directly.
 */
export async function updateProfile(
  userId: string,
  patch: Partial<typeof dbModule.profiles.$inferInsert>,
): Promise<void> {
  await dbModule.db
    .update(dbModule.profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(dbModule.profiles.userId, userId));
}
