// POST: Handle user messages (corrections in Stage 5, answers in Stage 7, voice in Stage 8)

import { getOnboardingV2UserId } from "@/lib/onboarding-v2/auth";
import {
  createSession,
  deleteSession,
  loadSession,
  updateSession,
} from "@/lib/onboarding-v2/session";
import {
  acceptEscape,
  confirmCorrectionComplete,
  processCorrectionRound,
} from "@/lib/onboarding-v2/stages/stage-5-correction";
import { sanitizeUserInput } from "@/lib/onboarding-v2/validation";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const userId = await getOnboardingV2UserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const session = await loadSession(userId);
  if (!session) return NextResponse.json({ error: "no_session" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  // --- Stage 5: Control actions must win before the correction catch-all. ---
  // While the session is correction_in_progress, clicking "Looks correct now"
  // or accepting the escape path posts no free-text message. If we route those
  // through processCorrectionRound first, the user is stranded with a 400.
  if (action === "confirm_correction") {
    await confirmCorrectionComplete(userId, session);
    return NextResponse.json({ success: true, nextStage: 6 });
  }

  if (action === "accept_escape") {
    await acceptEscape(userId, session);
    return NextResponse.json({ success: true, nextStage: 6 });
  }

  // --- Stage 5: Correction messages ---
  if (session.onboarding_status === "correction_in_progress" || action === "correction") {
    const message = sanitizeUserInput(body.message || "");
    if (!message) return NextResponse.json({ error: "empty_message" }, { status: 400 });

    const result = await processCorrectionRound(session, userId, message);

    if (result.action === "restart") {
      await deleteSession(userId);
      const newSession = await createSession(userId);
      return NextResponse.json({ action: "restart", sessionId: newSession.session_id });
    }

    if (result.shouldEscalate) {
      return NextResponse.json({
        escalated: true,
        escapeMessage: result.escapeMessage,
        actions: [
          { label: "Move on", action: "accept_escape" },
          { label: "Let me try again", action: "continue_correction" },
        ],
      });
    }

    if (result.correctionUnderstood) {
      return NextResponse.json({
        corrected: true,
        message: result.userConfirmationMessage,
        fieldsChanged: result.fieldsChanged,
        actions: [
          { label: "Looks correct now", action: "confirm_correction" },
          { label: "Something else is wrong", action: "continue_correction" },
        ],
      });
    }

    // Not understood — return clarifying question
    return NextResponse.json({
      corrected: false,
      message: result.clarifyingQuestion,
    });
  }

  // --- Stage 7: Answer handling ---
  if (
    (session.onboarding_status === "path_branched" ||
      session.onboarding_status === "resume_questions_complete") &&
    action === "answer"
  ) {
    const { processAnswer } = await import("@/lib/onboarding-v2/stages/stage-7-questions");
    const field = body.field;
    const value = body.value;
    if (!field) return NextResponse.json({ error: "missing_field" }, { status: 400 });

    const result = await processAnswer(session, userId, field, value);
    return NextResponse.json(result);
  }

  // --- Stage 7: Skip question ---
  if (action === "skip") {
    const { skipQuestion } = await import("@/lib/onboarding-v2/stages/stage-7-questions");
    const field = body.field;
    if (!field) return NextResponse.json({ error: "missing_field" }, { status: 400 });

    const result = await skipQuestion(session, userId, field);
    return NextResponse.json(result);
  }

  // --- Stage 7: Get current question ---
  // --- Stage 7: Get current question (runs Stage 6 if needed) ---
  if (action === "get_question") {
    // Auto-run Stage 6 if not yet done
    if (session.onboarding_status === "summary_confirmed") {
      const { runCompletenessAssessment, applyCompleteness } = await import(
        "@/lib/onboarding-v2/stages/stage-6-completeness"
      );
      const completeness = await runCompletenessAssessment(session);
      await applyCompleteness(userId, session, completeness);
      // Reload session with updated completeness data
      const updated = await loadSession(userId);
      if (updated) {
        const { getNextQuestion } = await import("@/lib/onboarding-v2/stages/stage-7-questions");
        const question = getNextQuestion(updated);
        return NextResponse.json({ question, stageComplete: !question });
      }
    }
    const { getNextQuestion } = await import("@/lib/onboarding-v2/stages/stage-7-questions");
    const question = getNextQuestion(session);
    return NextResponse.json({ question, stageComplete: !question });
  }

  // --- Stage 8: Voice answer handling ---
  if (session.onboarding_status === "resume_questions_complete" && action === "voice_answer") {
    const { processVoiceAnswer } = await import("@/lib/onboarding-v2/stages/stage-8-voice");
    const field = body.field;
    const value = body.value;
    if (!field) return NextResponse.json({ error: "missing_field" }, { status: 400 });

    const result = await processVoiceAnswer(session, userId, field, value);
    return NextResponse.json(result);
  }

  // --- Stage 8: Get current voice question ---
  if (action === "get_voice_question") {
    const { getNextVoiceQuestion } = await import("@/lib/onboarding-v2/stages/stage-8-voice");
    const question = getNextVoiceQuestion(session);
    return NextResponse.json({ question, stageComplete: !question });
  }

  // --- Stage 9: Resolve critical audit gaps in-place, then caller re-runs audit. ---
  if (action === "resolve_audit_gap") {
    const field = String(body.field || "");
    const value = sanitizeUserInput(String(body.value || ""));
    if (!field || !value)
      return NextResponse.json({ error: "missing_field_or_value" }, { status: 400 });

    const extraction = session.dual_extraction.pure_extraction;
    const nextExtraction = extraction ? { ...extraction } : null;
    const nextQuestionMap = { ...session.question_map };
    const nextConfirmation = { ...session.confirmation };

    switch (field) {
      case "confirmed_role_family":
        nextConfirmation.confirmed_role_family = value;
        break;
      case "confirmed_seniority":
        nextConfirmation.confirmed_seniority = value;
        break;
      case "target_role":
        nextQuestionMap.target_role = { value, confidence: "high", source: "free_text" };
        break;
      case "resume_frame":
        nextQuestionMap.resume_frame = { value, confidence: "high", source: "free_text" };
        break;
      case "experience_entry":
        if (nextExtraction) {
          nextExtraction.experience = [
            {
              title: "User-provided role",
              company: "User-provided company",
              location: null,
              start_date: null,
              end_date: null,
              is_current: false,
              bullets: [value],
            },
            ...(nextExtraction.experience || []),
          ];
        }
        break;
      case "skills":
        if (nextExtraction) {
          const skills = value
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 25);
          nextExtraction.skills = {
            raw_list: skills.length ? skills : [value],
            grouped: nextExtraction.skills?.grouped ?? {},
          };
        }
        break;
      case "linkedin_url":
      case "github_url":
      case "portfolio_url":
      case "phone":
      case "location":
      case "email":
        if (nextExtraction) {
          if (!nextExtraction.identity) {
            nextExtraction.identity = { full_name: null, email: null, phone: null, location: null, linkedin_url: null, github_url: null, portfolio_url: null };
          }
          (nextExtraction.identity as unknown as Record<string, string | null>)[field] = value === "skipped" ? null : value;
        }
        break;
      case "project_urls":
        if (nextExtraction) {
          const urls = value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
          for (const url of urls) {
            nextExtraction.projects = [...(nextExtraction.projects || []), { name: "User-provided project", url, description: null, technologies: [] }];
          }
        }
        break;
      case "languages":
        if (nextExtraction) {
          const langs = value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
          nextExtraction.languages = [...(nextExtraction.languages || []), ...langs];
        }
        break;
      default:
        // Accept any field — record as user-supplied override
        break;
    }

    await updateSession(userId, {
      confirmation: {
        ...nextConfirmation,
        user_supplied_overrides: [...new Set([...nextConfirmation.user_supplied_overrides, field])],
      },
      question_map: nextQuestionMap,
      ...(nextExtraction
        ? {
            dual_extraction: {
              ...session.dual_extraction,
              pure_extraction: nextExtraction,
            },
          }
        : {}),
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
