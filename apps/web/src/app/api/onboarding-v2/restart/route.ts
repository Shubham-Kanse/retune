// POST: Wipe session and start over

import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import { createSession, deleteSession } from "@/lib/onboarding-v2/session";
import { NextResponse } from "next/server";

export async function POST() {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await deleteSession(userId);
  const session = await createSession(userId);
  return NextResponse.json({ success: true, sessionId: session.session_id });
}
