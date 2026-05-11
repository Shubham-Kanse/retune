import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { persistProfileAssembly } from "@/lib/profile-assembly";
import { NextResponse } from "next/server";

/**
 * POST /api/onboarding/save
 * Saves deterministically-collected profile fields with a shared profile assembly module.
 */
export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });

  const { profile } = body;
  if (!profile || typeof profile !== "object") {
    throw new ValidationError("Missing profile object");
  }

  const assembled = await persistProfileAssembly({
    userId: session.userId,
    sessionEmail: session.email,
    profile: profile as Record<string, unknown>,
    now: new Date(),
    markOnboardingCompleted: true,
  });

  return NextResponse.json({ success: true, completenessScore: assembled.completenessScore });
});
