import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { normalizeProfile } from "@/lib/profile-domain/services/normalizer";
import { persistProfile } from "@/lib/profile-domain/repositories/profile-repository";
import { NextResponse } from "next/server";

export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const { profile } = body;
  if (!profile || typeof profile !== "object") {
    throw new ValidationError("Missing profile object");
  }

  const normalized = normalizeProfile(profile as Record<string, unknown>, session.email, session.fullName ?? "");
  const persisted = await persistProfile({
    userId: session.userId,
    sessionEmail: session.email,
    sessionFullName: session.fullName,
    profile: normalized,
    markOnboardingCompleted: true,
  });

  return NextResponse.json({ success: true, completenessScore: persisted.completenessScore });
});
