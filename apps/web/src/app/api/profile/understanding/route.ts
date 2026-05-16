import { withAuth } from "@/lib/api-handler";
import {
  type CareerUnderstandingV1,
  isCareerUnderstandingV1,
  isUnderstandingStale,
} from "@/lib/career-understanding";
import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import { buildPlaceholderUnderstanding } from "@/lib/career-understanding/service";
import { CAREER_PROFILE_VERSION, isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import { db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, session) => {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  const row = rows[0] as Record<string, unknown> | undefined;

  if (!row) {
    return NextResponse.json({
      careerProfile: null,
      profileReadiness: null,
      understanding: null,
      profileFingerprint: null,
      stale: false,
      canGenerateUnderstanding: false,
      missing: ["profile"],
    });
  }

  const careerProfileRaw = (row.careerProfile ?? null) as unknown;
  const careerProfile: CareerProfileV1 | null = isCareerProfileV1(careerProfileRaw)
    ? careerProfileRaw
    : null;
  const readiness: ProfileReadiness | null =
    (row.profileReadiness as ProfileReadiness | null | undefined) ?? null;

  const understandingRaw = (row.careerUnderstanding ?? null) as unknown;
  const understanding: CareerUnderstandingV1 | null = isCareerUnderstandingV1(understandingRaw)
    ? (understandingRaw as CareerUnderstandingV1)
    : null;

  const profileFingerprint = careerProfile ? careerProfileFingerprint(careerProfile) : null;
  const stale = careerProfile ? isUnderstandingStale(understanding, careerProfile) : false;

  // canGenerateUnderstanding requires at least minimum profile content.
  const canGenerateUnderstanding = canGenerate(careerProfile);
  const missing: string[] = [];
  if (!careerProfile) missing.push("career_profile");
  if (canGenerateUnderstanding === false && careerProfile) missing.push("profile_facts");

  return NextResponse.json({
    careerProfile,
    careerProfileVersion: row.careerProfileVersion ?? CAREER_PROFILE_VERSION,
    profileReadiness: readiness,
    understanding:
      understanding ??
      (careerProfile
        ? buildPlaceholderUnderstanding({
            userId: session.userId,
            profile: careerProfile,
          })
        : null),
    understandingPersisted: understanding !== null,
    profileFingerprint,
    stale,
    canGenerateUnderstanding,
    missing,
    revision:
      typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0,
    staleSince: row.careerUnderstandingStaleSince ?? null,
    updatedAt: row.careerUnderstandingUpdatedAt ?? null,
  });
});

function canGenerate(profile: CareerProfileV1 | null): boolean {
  if (!profile) return false;
  const hasIdentity = !!profile.identity.fullName.value;
  const hasExperienceOrProjects =
    (profile.experience.value?.length ?? 0) > 0 || (profile.projects.value?.length ?? 0) > 0;
  const hasSkills =
    (profile.skills.technical.value?.length ?? 0) +
      (profile.skills.tools.value?.length ?? 0) +
      (profile.skills.business.value?.length ?? 0) +
      (profile.skills.softSkills.value?.length ?? 0) >
    0;
  return hasIdentity && hasExperienceOrProjects && hasSkills;
}
