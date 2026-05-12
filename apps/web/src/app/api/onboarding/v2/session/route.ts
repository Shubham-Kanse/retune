/**
 * GET /api/onboarding/v2/session
 *
 * Returns the stored onboarding session for the current user so the
 * client can hydrate on mount without kicking off a fresh greeting stream.
 *
 * `isReturning` is true when the server has produced at least one
 * assistant turn (greeting included). The client uses it to decide whether
 * to reuse the transcript or send {kind:"greeting"}.
 */

import { withAuth } from "@/lib/api-handler";
import { getOrCreateSession } from "@/lib/onboarding/session-store";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, session) => {
  const stored = await getOrCreateSession(session.userId);
  const hasAssistantTurn = stored.messages.some((m) => m.role === "assistant");
  return NextResponse.json({
    stage: stored.state.stage,
    messages: hasAssistantTurn ? stored.messages : [],
    profileDelta: stored.state.profileDelta,
    hardMinimumMet: stored.state.hardMinimumMet,
    extractionStatus: stored.state.extractionStatus,
    confirmedSections: stored.state.confirmedSections,
    queueIndex: stored.state.queueIndex,
    isReturning: hasAssistantTurn,
  });
});
