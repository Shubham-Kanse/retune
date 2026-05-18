// POST: Handle summary confirmation actions (looks_correct, something_wrong, select_role_family, select_seniority)

import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import { loadSession, updateSession } from "@/lib/onboarding-v2/session";
import { generateSummaryPresentation } from "@/lib/onboarding-v2/stages/stage-4-summary";
import { processCorrectionRound } from "@/lib/onboarding-v2/stages/stage-5-correction";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await loadSession(userId);
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  switch (action) {
    case "get_summary": {
      // Generate and return the summary presentation
      const presentation = await generateSummaryPresentation(session);
      return NextResponse.json({ presentation });
    }

    case "looks_correct": {
      await updateSession(userId, {
        confirmation: {
          ...session.confirmation,
          summary_confirmed: true,
          confirmed_role_family:
            session.confirmation.confirmed_role_family || session.inference.role_family,
          confirmed_industry: session.inference.industry,
          confirmed_seniority:
            session.confirmation.confirmed_seniority || session.inference.seniority,
        },
        onboarding_status: "summary_confirmed",
      });
      return NextResponse.json({ success: true, nextStage: 6 });
    }

    case "something_wrong": {
      await updateSession(userId, {
        confirmation: { ...session.confirmation, correction_submitted: true },
        onboarding_status: "correction_in_progress",
      });
      return NextResponse.json({
        success: true,
        nextStage: 5,
        message:
          "No problem — what doesn't look right? You can describe it in plain language, for example: 'my job title is wrong', 'you missed a role I had at a company', or 'my skills list is incomplete'.",
      });
    }

    case "select_role_family": {
      await updateSession(userId, {
        confirmation: { ...session.confirmation, confirmed_role_family: body.value },
      });
      // If seniority also ambiguous, wait for that
      if (session.inference.seniority_ambiguous) {
        return NextResponse.json({ success: true, awaitingSeniority: true });
      }
      // Otherwise confirm all
      await updateSession(userId, {
        confirmation: {
          ...session.confirmation,
          confirmed_role_family: body.value,
          summary_confirmed: true,
          confirmed_industry: session.inference.industry,
          confirmed_seniority: session.inference.seniority,
        },
        onboarding_status: "summary_confirmed",
      });
      return NextResponse.json({ success: true, nextStage: 6 });
    }

    case "select_seniority": {
      await updateSession(userId, {
        confirmation: {
          ...session.confirmation,
          confirmed_seniority: body.value,
          summary_confirmed: true,
          confirmed_role_family:
            session.confirmation.confirmed_role_family || session.inference.role_family,
          confirmed_industry: session.inference.industry,
        },
        onboarding_status: "summary_confirmed",
      });
      return NextResponse.json({ success: true, nextStage: 6 });
    }

    case "free_text": {
      // User typed before clicking buttons — treat as correction
      await updateSession(userId, {
        confirmation: { ...session.confirmation, correction_submitted: true },
        onboarding_status: "correction_in_progress",
      });
      const result = await processCorrectionRound(session, userId, body.message || "");
      return NextResponse.json({ success: true, nextStage: 5, correction: result });
    }

    default:
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }
}
