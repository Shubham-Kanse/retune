import { withAuth } from "@/lib/api-handler";
import { markOnboardingSkipped } from "@/lib/profile-assembly";
import { NextResponse } from "next/server";

export const POST = withAuth(async (_request, session) => {
  await markOnboardingSkipped(session.userId);
  return NextResponse.json({ ok: true });
});
