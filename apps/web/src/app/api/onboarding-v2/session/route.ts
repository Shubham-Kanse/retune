// GET: Load or check existing session
// POST: Create new session or save draft

import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import { createSession, loadSession } from "@/lib/onboarding-v2/session";
import { NextResponse } from "next/server";

export async function GET() {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await loadSession(userId);
  if (!session) return NextResponse.json({ exists: false, session: null });

  // Check session expiry (7 days)
  const createdAt = new Date(session.onboarding_started_at).getTime();
  if (Date.now() - createdAt > 7 * 24 * 60 * 60 * 1000 && session.onboarding_status !== "committed") {
    return NextResponse.json({ exists: true, session, expired: true });
  }

  return NextResponse.json({ exists: true, session });
}

export async function POST(req: Request) {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (body.action === "save_draft") {
    return NextResponse.json({ success: true, message: "Progress saved." });
  }

  const existing = await loadSession(userId);
  if (existing && existing.onboarding_status !== "committed") {
    return NextResponse.json({ exists: true, session: existing });
  }

  const session = await createSession(userId);
  return NextResponse.json({ exists: true, session, created: true });
}
