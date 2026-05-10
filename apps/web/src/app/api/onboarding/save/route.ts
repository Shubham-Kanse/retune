import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { computeCompletenessScore, db, profiles, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * POST /api/onboarding/save
 *
 * Saves deterministically-collected profile fields. No AI call.
 * Called after the frontend's step-by-step field collection.
 * Accepts a partial profile object and upserts into the profiles table.
 */
export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const { profile } = body;
  if (!profile || typeof profile !== "object") {
    throw new ValidationError("Missing profile object");
  }

  const now = new Date();

  // Build profile markdown for display
  const profileMarkdown = [
    profile.fullName ? `# ${profile.fullName}` : "",
    profile.currentTitle || "",
    profile.location ? `**Location:** ${profile.location}` : "",
    Array.isArray(profile.targetRoles) && profile.targetRoles.length
      ? `**Target Roles:** ${profile.targetRoles.join(", ")}`
      : "",
    Array.isArray(profile.experience) && profile.experience.length
      ? `## Experience\n${profile.experience
          .map(
            (e: { title?: string; company?: string; startDate?: string; endDate?: string; description?: string }) =>
              `### ${e.title ?? "Role"} — ${e.company ?? "Company"}\n${[e.startDate, e.endDate].filter(Boolean).join(" – ")}\n${e.description ?? ""}`,
          )
          .join("\n\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const completenessScore = computeCompletenessScore(profile);

  const profileValues = {
    fullName: profile.fullName ?? "",
    email: profile.email ?? session.email,
    phone: profile.phone ?? null,
    linkedin: profile.linkedin ?? null,
    location: profile.location ?? "",
    visaStatus: profile.visaStatus ?? null,
    currentTitle: profile.currentTitle ?? null,
    relocationPreferences: JSON.stringify(
      Array.isArray(profile.relocationPreferences)
        ? profile.relocationPreferences
        : profile.relocationPreferences ? [profile.relocationPreferences] : [],
    ),
    targetRoles: JSON.stringify(
      Array.isArray(profile.targetRoles)
        ? profile.targetRoles
        : profile.targetRoles ? [profile.targetRoles] : [],
    ),
    experienceLevel: profile.experienceLevel ?? "mid",
    experience: JSON.stringify(profile.experience ?? []),
    education: JSON.stringify(profile.education ?? []),
    certifications: JSON.stringify(profile.certifications ?? []),
    projects: JSON.stringify(profile.projects ?? []),
    skillsTier1: JSON.stringify(profile.skillsTier1 ?? []),
    skillsTier2: JSON.stringify(profile.skillsTier2 ?? []),
    skillsTier3: JSON.stringify(profile.skillsTier3 ?? []),
    voiceNotes: profile.voiceNotes ?? null,
    profileMarkdown,
    completenessScore,
    updatedAt: now,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(profiles)
      .values({
        userId: session.userId,
        ...profileValues,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: profileValues,
      });

    await tx
      .update(users)
      .set({
        onboardingCompleted: true,
        fullName: profile.fullName || undefined,
        updatedAt: now,
      })
      .where(eq(users.id, session.userId));
  });

  return NextResponse.json({ success: true, completenessScore });
});
