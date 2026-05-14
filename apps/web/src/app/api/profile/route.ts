import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { patchProfileSchema } from "@/lib/profile-domain/schemas";
import { normalizeProfile } from "@/lib/profile-domain/services/normalizer";
import { persistProfile } from "@/lib/profile-domain/repositories/profile-repository";
import { parseJsonSafe } from "@/lib/profile-domain/utils/json";

export const GET = withAuth(async (_request, session) => {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  const profile = rows[0];
  if (!profile) return NextResponse.json(null, { status: 404 });

  return NextResponse.json({
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    linkedin: profile.linkedin,
    location: profile.location,
    visaStatus: profile.visaStatus,
    currentTitle: profile.currentTitle,
    experienceLevel: profile.experienceLevel,
    relocationPreferences: parseJsonSafe(profile.relocationPreferences, []),
    targetRoles: parseJsonSafe(profile.targetRoles, []),
    experience: parseJsonSafe(profile.experience, []),
    education: parseJsonSafe(profile.education, []),
    certifications: parseJsonSafe(profile.certifications, []),
    projects: parseJsonSafe(profile.projects, []),
    skillsTier1: parseJsonSafe(profile.skillsTier1, []),
    skillsTier2: parseJsonSafe(profile.skillsTier2, []),
    skillsTier3: parseJsonSafe(profile.skillsTier3, []),
    voiceNotes: profile.voiceNotes,
    careerProfile: (profile as { careerProfile?: unknown }).careerProfile ?? null,
    careerProfileVersion: (profile as { careerProfileVersion?: unknown }).careerProfileVersion ?? null,
    profileReadiness: (profile as { profileReadiness?: unknown }).profileReadiness ?? null,
    profileMarkdown: profile.profileMarkdown,
    completenessScore: profile.completenessScore,
  });
});

export const PATCH = withAuth(async (request, session) => {
  const rawBody = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const parsed = patchProfileSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const normalized = normalizeProfile(parsed.data as Record<string, unknown>, session.email, session.fullName ?? "");
  const persisted = await persistProfile({
    userId: session.userId,
    sessionEmail: session.email,
    sessionFullName: session.fullName,
    profile: normalized,
    markOnboardingCompleted: true,
    profileMarkdownOverride:
      typeof (parsed.data as { profileMarkdown?: unknown }).profileMarkdown === "string"
        ? ((parsed.data as { profileMarkdown?: string }).profileMarkdown as string)
        : undefined,
  });

  revalidatePath("/dashboard");
  revalidatePath("/profile");

  return NextResponse.json({ ok: true, completenessScore: persisted.completenessScore });
});
