import { withAuth } from "@/lib/api-handler";
import { getOrCreateSession } from "@/lib/onboarding/session-store";
import { computeReadiness } from "@/lib/onboarding/completeness";
import { planNextQuestion } from "@/lib/onboarding/planner";
import { NextResponse } from "next/server";

export const GET = withAuth(async (_request, session) => {
  const stored = await getOrCreateSession(session.userId);
  const readiness = computeReadiness(stored.profile);
  const nextQuestion = planNextQuestion(stored.profile, stored.meta);

  return NextResponse.json({
    phase: stored.meta.currentPhase,
    messages: stored.messages,
    readiness,
    nextQuestion,
    turnCount: stored.turnCount,
    isReturning: stored.messages.length > 0,
  });
});
