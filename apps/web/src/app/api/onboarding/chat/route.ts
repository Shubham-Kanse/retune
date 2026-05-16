/**
 * POST /api/onboarding/chat
 *
 * Planner-driven onboarding. Backend decides phase, structured pills/cards,
 * readiness, and dashboard handoff. The LLM only writes short copy.
 */
import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import OpenAI from "openai";

import { applyRouterDecision } from "@/lib/onboarding/apply-patch";
import { COACH_INSTRUCTIONS } from "@/lib/onboarding/coach-prompt";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import { fallbackFor } from "@/lib/onboarding/fallback-templates";
import { applyInputGuardrails, stripOutputLeaks, isDuplicateMessage } from "@/lib/onboarding/guardrails";
import { routeFreeText } from "@/lib/onboarding/text-router";
import { normalizeSkill, normalizeStringArray } from "@/lib/onboarding/normalization";
import { planNextQuestion } from "@/lib/onboarding/planner";
import { buildProfileContext } from "@/lib/onboarding/profile-context";
import { calculateProfileReadiness } from "@/lib/onboarding/readiness";
import { createEmptyProfile, getOrCreateSession, saveSession } from "@/lib/onboarding/session-store";
import { SSE_HEADERS, sseEvent } from "@/lib/onboarding/sse";
import { ONBOARDING_TOOLS } from "@/lib/onboarding/tools";
import { resolveTrustedPillAction, resolveTrustedMultiSelectAction, resolveTrustedSkillsUpdateAction } from "@/lib/onboarding/action-validation";
import { attachFieldEdit, updateProfileOnboardingReadiness } from "@/lib/onboarding/career-profile.schema";
import { persistProfile, wipeUserOnboardingData } from "@/lib/profile-domain/repositories/profile-repository";
import { triggerInitialUnderstandingGeneration } from "@/lib/career-understanding/auto-generate";
import type { OnboardingQuestion, Pill, ProfileReadiness, SessionState, StoredMessage, UserCareerProfile } from "@/lib/onboarding/types";

const START_OVER_LIMIT = 25;

type ChatRequest =
  | { kind: "greeting" }
  | { kind: "message"; text: string }
  | { kind: "text_input"; text: string }
  | { kind: "pill"; pill: Pill; questionKey?: string }
  | { kind: "pill_click"; questionKey: string; action: Pill["action"]; field?: string; value: string; pill?: Pill }
  | { kind: "multi_select"; questionKey: string; field: string; values: string[] }
  | { kind: "skills_update"; questionKey?: string; skills: { technical: string[]; tools: string[]; business: string[] } }
  | { kind: "resume_uploaded" }
  | { kind: "resume_failed" }
  | { kind: "start_over" }
  | { kind: "go_back" }
  | { kind: "finish_later" }
  | { kind: "finish_now" };

function parseBody(raw: unknown): ChatRequest {
  if (!raw || typeof raw !== "object") throw new ValidationError("Invalid body");
  const r = raw as Record<string, unknown>;

  if (r.kind === "greeting") return { kind: "greeting" };
  if (r.kind === "resume_failed") return { kind: "resume_failed" };
  if (r.kind === "resume_uploaded") return { kind: "resume_uploaded" };
  if (r.kind === "start_over") return { kind: "start_over" };
  if (r.kind === "go_back") return { kind: "go_back" };
  if (r.kind === "finish_later") return { kind: "finish_later" };
  if (r.kind === "finish_now") return { kind: "finish_now" };

  if (r.kind === "message" || r.kind === "text_input") {
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text) throw new ValidationError("Text required");
    return { kind: r.kind, text };
  }

  if (r.kind === "pill" || r.kind === "pill_click") {
    if (r.kind === "pill" && (!r.pill || typeof r.pill !== "object")) throw new ValidationError("Pill is required");
    if (r.kind === "pill_click" && typeof r.value !== "string" && !(r.pill && typeof r.pill === "object")) throw new ValidationError("Pill value is required");
    const action = typeof r.action === "string" ? r.action as Pill["action"] : (r.pill as Pill | undefined)?.action;
    if (!action) throw new ValidationError("Pill action is required");
    return {
      kind: r.kind,
      questionKey: typeof r.questionKey === "string" ? r.questionKey : "",
      pill: r.pill as Pill | undefined,
      action,
      field: typeof r.field === "string" ? r.field : (r.pill as Pill | undefined)?.field,
      value: typeof r.value === "string" ? r.value : (r.pill as Pill | undefined)?.value ?? "",
    } as ChatRequest;
  }

  if (r.kind === "multi_select") {
    const values = Array.isArray(r.values) ? r.values.map(String).map((v) => v.trim()).filter(Boolean) : [];
    const field = typeof r.field === "string" ? r.field : "";
    const questionKey = typeof r.questionKey === "string" ? r.questionKey : field;
    if (!field) throw new ValidationError("Field is required");
    return { kind: "multi_select", questionKey, field, values };
  }

  if (r.kind === "skills_update") {
    const skills = r.skills && typeof r.skills === "object" ? r.skills as Record<string, unknown> : {};
    return {
      kind: "skills_update",
      questionKey: typeof r.questionKey === "string" ? r.questionKey : undefined,
      skills: {
        technical: Array.isArray(skills.technical) ? skills.technical.map(String) : [],
        tools: Array.isArray(skills.tools) ? skills.tools.map(String) : [],
        business: Array.isArray(skills.business) ? skills.business.map(String) : [],
      },
    };
  }

  throw new ValidationError("Unknown kind");
}

export const POST = withAuth(async (request, session) => {
  const traceId = crypto.randomUUID();
  const startedAt = Date.now();
  const { success } = rateLimit(request as unknown as NextRequest, 60, 60000);
  if (!success) {
    return new Response(sseEvent("error", { message: "Too many messages." }), { status: 429, headers: SSE_HEADERS });
  }

  const raw = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON");
  });
  const body = parseBody(raw);
  const stored = await getOrCreateSession(session.userId);

  // Populated by the text_input branch when a router decision is applied.
  // Lets the copywriter prefix the next assistant message with what changed.
  let textApplySummary: string | undefined;

  if (body.kind === "start_over") {
    if (stored.meta.resetCount >= START_OVER_LIMIT) {
      return new Response(sseEvent("error", { message: `Already restarted ${START_OVER_LIMIT} times.` }), { headers: SSE_HEADERS });
    }
    // SOTA reset: wipe onboarding-derived DB rows (profile, resume cache,
    // onboarding_completed flag) BEFORE resetting the in-memory session.
    // Without this, completed users would have stale profile data left in
    // the DB after starting over but before re-completing.
    await wipeUserOnboardingData(session.userId);
    const resetCount = stored.meta.resetCount + 1;
    stored.profile = createEmptyProfile(session.userId);
    stored.meta = {
      currentPhase: "resume_upload",
      answeredQuestionKeys: [],
      skippedQuestionKeys: [],
      resumeUploaded: false,
      resumeParsed: false,
      resumeSummarized: false,
      identityConfirmed: false,
      experienceConfirmed: false,
      educationConfirmed: false,
      skillsConfirmed: false,
      projectsCertificationsReviewed: false,
      extrasConfirmed: false,
      experienceMetricsPrompted: false,
      educationNotApplicable: false,
      optionalTonePrompted: false,
      pendingTextInput: undefined,
      enhancementTurns: 0,
      stepHistory: [],
      resetCount,
      status: "draft",
      resumeFileHash: null,
      extractionStatus: null,
      completedAt: null,
    };
    stored.messages = [];
    stored.responseChainId = null;
    stored.turnCount = 0;
    stored.version = stored.version ?? 0;
    stored.status = "draft";
    stored.resumeFileHash = null;
    stored.extractionStatus = null;
    stored.completedAt = null;
    const question = planNextQuestion(stored.profile, stored.meta);
    const message = fallbackFor("resume_upload");
    if (question) {
      stored.messages.push({
        role: "assistant",
        content: message,
        ts: new Date().toISOString(),
        questionKey: question.questionKey,
        cards: question.cards,
        pills: question.pills,
      });
      stored.turnCount = 1;
    }
    await saveSession(session.userId, stored);
      return streamTurn({
        message,
        question,
        readiness: calculateProfileReadiness(stored.profile),
        stage: question?.phase ?? "resume_upload",
        traceId,
      });
  }

  if (body.kind === "finish_now") {
    const readiness = calculateProfileReadiness(stored.profile);
    if (!readiness.canEnterDashboard) {
      // Don't finish if not ready — fall through to normal flow.
      return streamTurn({
        message: readiness.blockers[0] ?? "A little more profile detail is needed before the dashboard.",
        question: null,
        readiness,
        stage: "profile_gap_fill",
        traceId,
      });
    }
    const completedAt = new Date().toISOString();
    stored.status = "completed";
    stored.completedAt = completedAt;
    stored.meta.status = "completed";
    stored.meta.completedAt = completedAt;
    stored.profile.onboarding.completedAt = completedAt;
    await persistProfile({
      userId: session.userId,
      sessionEmail: session.email,
      sessionFullName: session.fullName,
      profile: stored.profile,
      markOnboardingCompleted: true,
      readiness,
    });
    // Auto-generate the initial career understanding in the background so
    // the user lands on the dashboard / profile page with it already ready
    // (or nearly ready). Fire-and-forget — failures don't block handoff.
    triggerInitialUnderstandingGeneration({
      userId: session.userId,
      profile: stored.profile,
      readiness,
    });
    stored.meta.currentPhase = "dashboard_handoff";
    await saveSession(session.userId, stored);
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "profile_ready", payload: { score: readiness.score, via: "finish_now" } });
    return streamTurn({ message: fallbackFor("profile_ready"), question: null, readiness, stage: "dashboard_handoff", traceId });
  }

  if (body.kind === "finish_later") {
    stored.status = "draft";
    stored.meta.status = "draft";
    await saveSession(session.userId, stored);
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "finish_later", payload: { score: calculateProfileReadiness(stored.profile).score } });
    return streamTurn({
      message: "Saved your onboarding draft. You can come back and finish the profile before generating tailored resumes.",
      question: null,
      readiness: calculateProfileReadiness(stored.profile),
      stage: "profile_gap_fill",
      traceId,
    });
  }

  if (body.kind === "go_back") {
    const history = stored.meta.stepHistory ?? [];
    if (history.length > 1) {
      // Pop current step, go to previous
      history.pop();
      const prevKey = history[history.length - 1]!;
      // Unconfirm the previous step so the planner re-asks it
      unconfirmStep(stored, prevKey);
      stored.meta.stepHistory = history;
      const question = planNextQuestion(stored.profile, stored.meta);
      await saveSession(session.userId, stored);
      const message = question ? fallbackFor(question.questionKey) : "Let's continue.";
      return streamTurn({
        message,
        question,
        readiness: calculateProfileReadiness(stored.profile),
        stage: question?.phase ?? stored.meta.currentPhase,
        traceId,
      });
    }
    // Nothing to go back to
    const question = planNextQuestion(stored.profile, stored.meta);
    return streamTurn({
      message: "You're at the beginning — nothing to go back to.",
      question,
      readiness: calculateProfileReadiness(stored.profile),
      stage: question?.phase ?? stored.meta.currentPhase,
      traceId,
    });
  }

  if (body.kind === "pill" || body.kind === "pill_click") {
    const currentQuestion = planNextQuestion(stored.profile, stored.meta);
    const validation = resolveTrustedPillAction({
      kind: body.kind,
      questionKey: body.questionKey || stored.meta.lastQuestionKey || (body.kind === "pill_click" ? body.field || body.value : body.pill.field || body.pill.value) || "",
      pill: body.pill,
      action: body.kind === "pill_click" ? body.action : body.pill?.action,
      field: body.kind === "pill_click" ? body.field : body.pill?.field,
      value: body.kind === "pill_click" ? body.value : body.pill?.value,
      currentQuestion,
    });
    if (!validation.valid) {
      return new Response(sseEvent("error", { message: "Invalid action." }), { status: 400, headers: SSE_HEADERS });
    }
    const { questionKey, pill } = validation.action as { questionKey: string; pill: Pill };
    applyPillAction(stored, questionKey, pill);
    stored.messages.push({ role: "user", content: pill.label, ts: new Date().toISOString() });
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "pill_clicked", payload: { questionKey, pill } });
  } else if (body.kind === "message" || body.kind === "text_input") {
    const guarded = applyInputGuardrails(body.text);
    if (guarded.blocked) return new Response(sseEvent("error", { message: "Invalid input." }), { headers: SSE_HEADERS });

    // Capture the question the user is replying to BEFORE any mutation.
    // The planner is pure, so this is a deterministic snapshot.
    const currentQuestion = planNextQuestion(stored.profile, stored.meta);

    stored.messages.push({ role: "user", content: guarded.text, ts: new Date().toISOString() });

    // ── Deterministic pre-router for common short confirmation/skip phrases ──
    // The AI router gets confused by short generic answers like "Continue",
    // "Correct", "Skip", "Yes", "Looks good". When the current question has
    // a confirm pill and the user types one of these, route it to that pill
    // directly — no AI roundtrip, no ambiguity, no data corruption.
    let preRouted = false;
    if (currentQuestion) {
      const normalized = guarded.text.trim().toLowerCase();
      const CONFIRM_PHRASES = new Set([
        "continue", "ok", "okay", "yes", "yep", "yeah", "y", "sure",
        "correct", "right", "looks good", "looks correct", "looks mostly correct",
        "fine", "good", "great", "next", "go", "proceed", "confirm", "confirmed",
        "all good", "all correct", "thats right", "that's right", "its right", "it's right",
      ]);
      const SKIP_PHRASES = new Set([
        "skip", "pass", "no", "n", "nope", "skip it", "no thanks", "later",
        "skip metrics", "skip this", "i don't know", "idk", "dont know", "don't know",
      ]);
      const isConfirm = CONFIRM_PHRASES.has(normalized);
      const isSkip = SKIP_PHRASES.has(normalized);
      if (isConfirm || isSkip) {
        const targetAction: Pill["action"] = isConfirm ? "confirm_field" : "skip";
        const matchedPill =
          currentQuestion.pills.find((p) => p.action === targetAction && p.recommended) ??
          currentQuestion.pills.find((p) => p.action === targetAction);
        if (matchedPill) {
          applyPillAction(stored, currentQuestion.questionKey, matchedPill);
          if (isSkip) {
            stored.meta.skippedQuestionKeys.push({
              questionKey: currentQuestion.questionKey,
              field: currentQuestion.field,
              skippedAt: new Date().toISOString(),
              skipScope: "this_session",
            });
          }
          preRouted = true;
          textApplySummary = isSkip ? "Skipped." : "Confirmed.";
        }
      }
    }

    const decision = preRouted
      ? null
      : await routeFreeText({
      text: guarded.text,
      question: currentQuestion,
      profile: stored.profile,
      messages: stored.messages,
      answeredKeys: stored.meta.answeredQuestionKeys,
      skippedKeys: stored.meta.skippedQuestionKeys.map((s) => s.questionKey),
    });

    if (decision) {
      await logOnboardingEvent({
        userId: session.userId,
        sessionId: stored.id,
        eventType: "text_routed",
        payload: { intent: decision.intent, questionKey: currentQuestion?.questionKey },
      });

      // Short-circuit on non-writing intents — user gets immediate, focused feedback
      // instead of the silent no-op the old applyTextToField produced.
      if (decision.intent === "ambiguous" || decision.intent === "off_topic") {
        const message =
          decision.intent === "ambiguous"
            ? decision.clarification
            : `Happy to come back to that - first, let me get the current question right.`;
        stored.messages.push({
          role: "assistant",
          content: message,
          ts: new Date().toISOString(),
          questionKey: currentQuestion?.questionKey,
          cards: currentQuestion?.cards,
          pills: currentQuestion?.pills,
        });
        stored.turnCount += 1;
        await saveSession(session.userId, stored);
        return streamTurn({
          message,
          question: currentQuestion,
          readiness: calculateProfileReadiness(stored.profile),
          stage: currentQuestion?.phase ?? stored.meta.currentPhase,
          traceId,
        });
      }

      if (decision.intent === "skip") {
        if (currentQuestion?.skipAllowed) {
          stored.meta.skippedQuestionKeys.push({
            questionKey: currentQuestion.questionKey,
            field: currentQuestion.field,
            skippedAt: new Date().toISOString(),
            skipScope: "this_session",
          });
        }
      } else {
        // answer_current or edit_field — validate + apply
        const result = applyRouterDecision(stored, decision);
        if (result.ok) {
          textApplySummary = result.summary;
          if (currentQuestion && decision.intent === "answer_current") {
            if (!stored.meta.answeredQuestionKeys.includes(currentQuestion.questionKey)) {
              stored.meta.answeredQuestionKeys.push(currentQuestion.questionKey);
            }
            // Mirror the confirm-pill effect for confirm-style questions
            switch (currentQuestion.questionKey) {
              case "identity_confirm": stored.meta.identityConfirmed = true; break;
              case "experience_confirm": stored.meta.experienceConfirmed = true; break;
              case "education_confirm": stored.meta.educationConfirmed = true; break;
              case "skills_confirm": stored.meta.skillsConfirmed = true; break;
              case "experience_metrics": stored.meta.experienceMetricsPrompted = true; break;
              case "extras_confirm": stored.meta.extrasConfirmed = true; break;
            }
          }
        } else if (currentQuestion?.questionKey === "experience_metrics") {
          // For experience_metrics, treat free text as achievements for the top
          // roles — but only if the text looks like a real achievement (not a
          // single short generic word like "yes" or "ok"). Generic confirmations
          // are already handled by the deterministic pre-router above.
          const topRoles = stored.profile.experience.value.slice(0, 2);
          const looksLikeAchievement = guarded.text.trim().length >= 12 && /\s/.test(guarded.text.trim());
          if (topRoles.length > 0 && looksLikeAchievement) {
            const bullets = guarded.text.split(/[;\n]/).map((s: string) => s.trim()).filter((s) => s.length >= 6);
            if (bullets.length > 0) {
              topRoles[0]!.achievements = [...(topRoles[0]!.achievements ?? []), ...bullets];
              stored.profile.experience = attachFieldEdit(stored.profile.experience, stored.profile.experience.value, { source: "user", actor: "router", reason: "experience_metrics", confidence: 1, confirmed: true });
              textApplySummary = `Added ${bullets.length} achievement${bullets.length === 1 ? "" : "s"} to ${topRoles[0]!.title} at ${topRoles[0]!.company}.`;
              stored.meta.experienceMetricsPrompted = true;
            }
          } else {
            // Text doesn't look like a real achievement and didn't match a
            // confirm/skip phrase. Re-ask with a hint.
            const message = `I wasn't sure how to apply that. You can describe an impact (e.g. "reduced X by 30%") or click "Skip metrics" to move on.`;
            stored.messages.push({
              role: "assistant",
              content: message,
              ts: new Date().toISOString(),
              questionKey: currentQuestion.questionKey,
              cards: currentQuestion.cards,
              pills: currentQuestion.pills,
            });
            stored.turnCount += 1;
            await saveSession(session.userId, stored);
            return streamTurn({
              message,
              question: currentQuestion,
              readiness: calculateProfileReadiness(stored.profile),
              stage: currentQuestion.phase,
              traceId,
            });
          }
        } else {
        // Schema validation failed — short-circuit with a focused reply
        const message = `I couldn't apply that to ${decision.field} (${result.reason}). Could you rephrase?`;
        stored.messages.push({
          role: "assistant",
          content: message,
          ts: new Date().toISOString(),
          questionKey: currentQuestion?.questionKey,
          cards: currentQuestion?.cards,
          pills: currentQuestion?.pills,
        });
        stored.turnCount += 1;
        await saveSession(session.userId, stored);
        return streamTurn({
          message,
          question: currentQuestion,
          readiness: calculateProfileReadiness(stored.profile),
          stage: currentQuestion?.phase ?? stored.meta.currentPhase,
          traceId,
        });
      }
    }
    }
  } else if (body.kind === "multi_select") {
    const currentQuestion = planNextQuestion(stored.profile, stored.meta);
    const validation = resolveTrustedMultiSelectAction({
      questionKey: body.questionKey,
      field: body.field,
      values: body.values,
      currentQuestion,
    });
    if (!validation.valid) {
      return new Response(sseEvent("error", { message: "Invalid action." }), { status: 400, headers: SSE_HEADERS });
    }
    const { field, values } = validation.action as { field: string; values: string[] };
    applyMultiSelect(stored, field, values);
    stored.messages.push({ role: "user", content: values.length ? values.join(", ") : "Continue", ts: new Date().toISOString() });
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "field_confirmed", payload: { questionKey: body.questionKey, field, count: values.length } });
  } else if (body.kind === "skills_update") {
    const currentQuestion = planNextQuestion(stored.profile, stored.meta);
    const validation = resolveTrustedSkillsUpdateAction({ questionKey: body.questionKey, skills: body.skills, currentQuestion });
    if (!validation.valid) {
      return new Response(sseEvent("error", { message: "Invalid action." }), { status: 400, headers: SSE_HEADERS });
    }
    applySkillsUpdate(stored, body.skills);
    stored.messages.push({ role: "user", content: "Updated skills", ts: new Date().toISOString() });
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "field_updated", payload: { field: "skills", counts: body.skills } });
  } else if (body.kind === "resume_uploaded") {
    // Upload route already wrote the extracted profile into the session.
    // Just advance the phase so the planner shows the summary question.
    stored.meta.resumeUploaded = true;
    stored.meta.resumeParsed = true;
    stored.meta.extractionStatus = "done";
    stored.meta.currentPhase = "resume_summary";
    stored.profile.onboarding.resumeUploaded = true;
    stored.profile.onboarding.resumeParsed = true;
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "resume_parsed", payload: { via: "resume_uploaded_signal" } });
  } else if (body.kind === "resume_failed") {
    stored.meta.resumeUploaded = true;
    stored.meta.resumeParsed = false;
    stored.meta.extractionStatus = "failed";
    stored.meta.currentPhase = "resume_upload";
    stored.profile.onboarding.resumeUploaded = true;
    stored.profile.onboarding.resumeParsed = false;
  } else if (body.kind === "greeting") {
    stored.meta.currentPhase = "resume_upload";
  }

  normalizeStoredProfile(stored.profile);

  const readiness = calculateProfileReadiness(stored.profile);
  updateProfileOnboardingReadiness(stored.profile, readiness);
  const baseQuestion = planNextQuestion(stored.profile, stored.meta);
  // If profile is ready AND the next step is optional, append a "Finish onboarding"
  // pill so the user can exit without filling every optional step.
  const question = baseQuestion && readiness.canEnterDashboard && baseQuestion.skipAllowed
    ? {
        ...baseQuestion,
        pills: [
          ...baseQuestion.pills,
          { label: "Finish onboarding", value: "finish_now", action: "navigate" as const, field: "_finish_now", recommended: true },
        ],
      }
    : baseQuestion;

  if (!question && readiness.canEnterDashboard) {
    const completedAt = new Date().toISOString();
    stored.status = "completed";
    stored.completedAt = completedAt;
    stored.meta.status = "completed";
    stored.meta.completedAt = completedAt;
    stored.profile.onboarding.completedAt = completedAt;
    await persistProfile({
      userId: session.userId,
      sessionEmail: session.email,
      sessionFullName: session.fullName,
      profile: stored.profile,
      markOnboardingCompleted: true,
      readiness,
    });
    // Auto-generate the initial career understanding in the background.
    triggerInitialUnderstandingGeneration({
      userId: session.userId,
      profile: stored.profile,
      readiness,
    });

    stored.meta.currentPhase = "dashboard_handoff";
    await saveSession(session.userId, stored);
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "profile_ready", payload: { score: readiness.score } });
    return streamTurn({ message: fallbackFor("profile_ready"), question: null, readiness, stage: "dashboard_handoff", traceId });
  }

  if (!question) {
    stored.meta.currentPhase = "profile_gap_fill";
    await saveSession(session.userId, stored);
    return streamTurn({
      message: readiness.blockers[0] ?? "A little more profile detail is needed before the dashboard.",
      question: null,
      readiness,
      stage: "profile_gap_fill",
      traceId,
    });
  }

  stored.meta.currentPhase = question.phase;
  stored.meta.lastQuestionKey = question.questionKey;
  if (!stored.meta.stepHistory) stored.meta.stepHistory = [];
  if (stored.meta.stepHistory[stored.meta.stepHistory.length - 1] !== question.questionKey) {
    stored.meta.stepHistory.push(question.questionKey);
  }
  await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "question_planned", payload: { phase: question.phase, questionKey: question.questionKey } });

  const message = await generateAssistantMessage(question, stored.profile, textApplySummary, stored.messages);

  if (shouldPushAssistant(stored.messages, message)) {
    stored.messages.push({
      role: "assistant",
      content: message,
      ts: new Date().toISOString(),
      questionKey: question.questionKey,
      cards: question.cards,
      pills: question.pills,
    });
  }

  stored.turnCount += 1;
  await saveSession(session.userId, stored);

  await logOnboardingEvent({
    userId: session.userId,
    sessionId: stored.id,
    eventType: "readiness_computed",
    traceId,
    phase: question.phase,
    durationMs: Date.now() - startedAt,
    payload: { score: readiness.score, blockers: readiness.blockers.length },
  });

  return streamTurn({ message, question, readiness, stage: question.phase, traceId });
});

async function generateAssistantMessage(
  question: OnboardingQuestion,
  profile: UserCareerProfile,
  applySummary?: string,
  history: StoredMessage[] = [],
): Promise<string> {
  const prefix = applySummary ? `${applySummary} ` : "";
  const fixed = fixedCardPrompt(question);
  if (fixed) return `${prefix}${fixed}`.trim();

  let message = fallbackFor(question.questionKey);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const context = buildProfileContext(profile, question.phase);
    const recent = history.slice(-6).map((m) => `${m.role === "user" ? "USER" : "AI"}: ${m.content.replace(/\s+/g, " ").trim().slice(0, 200)}`);
    const historyBlock = recent.length ? `[RECENT TURNS]\n${recent.join("\n")}` : "";
    const response = await (openai.responses as any).create({
      model: process.env.ONBOARDING_MODEL ?? "gpt-4o-mini",
      instructions: COACH_INSTRUCTIONS,
      input: [{
        role: "user",
        content: [
          "[QUESTION]",
          `Phase: ${question.phase}`,
          `Question key: ${question.questionKey}`,
          `Task: ${question.prompt}`,
          question.whyAsked ? `Why asked: ${question.whyAsked}` : "Why asked: This helps build the user's Retuned profile.",
          "",
          context,
          "",
          historyBlock,
          "",
          applySummary ? `[JUST APPLIED] ${applySummary}` : "",
          "",
          "[OUTPUT RULES]",
          "Write exactly 1 short message. Max 2 sentences. Do not create pills or decide the next question.",
          "Do not repeat phrases you've already used in [RECENT TURNS].",
          applySummary
            ? "If a [JUST APPLIED] note is present, briefly acknowledge it before asking the next question."
            : "",
          "If cards are provided, do not summarize the card contents. Ask the user to review the cards instead.",
        ].filter(Boolean).join("\n"),
      }],
      max_output_tokens: 140,
      tools: ONBOARDING_TOOLS,
    });

    const toolCall = response.output?.find((o: any) => o.type === "function_call" && o.name === "write_message");
    if (toolCall) {
      try {
        message = JSON.parse(toolCall.arguments).message || message;
      } catch {}
    } else if (response.output_text?.trim()) {
      message = response.output_text;
    }
  } catch (err) {
    console.error("[onboarding/chat] LLM error:", err);
    // Fall back: prefix the apply summary onto the static fallback so the user still sees acknowledgement
    return `${prefix}${fallbackFor(question.questionKey)}`.trim();
  }

  const safe = stripOutputLeaks(message).trim();
  if (!safe) return `${prefix}${fallbackFor(question.questionKey)}`.trim();

  // If the LLM didn't naturally include the acknowledgement, prefix it. This makes
  // the echo deterministic so users always see their input took effect.
  if (applySummary && !safe.toLowerCase().includes(applySummary.toLowerCase().slice(0, 12))) {
    return `${applySummary} ${safe}`.trim();
  }
  return safe;
}

function onboardingProfileExtras(profile: UserCareerProfile) {
  return {
    professionalIdentities: profile.professionalProfile.professionalIdentities.value,
    careerDirection: profile.careerIntent.careerDirection.value || null,
    preferredMarkets: profile.careerIntent.preferredMarkets.value,
    workPreference: profile.careerIntent.workPreference.value || null,
    emphasisAreas: profile.resumeWritingPreferences.emphasisAreas.value,
    onboardingProfile: profile,
  };
}

function fixedCardPrompt(question: OnboardingQuestion): string | null {
  switch (question.questionKey) {
    case "resume_summary":
      return "I created a draft profile from your resume. Please review the cards below.";
    case "identity_confirm":
      return "Please confirm your basic details.";
    case "experience_confirm":
      return "Please confirm your experience entries.";
    case "education_confirm":
      return "Please confirm your education details.";
    case "skills_confirm":
      return "Please confirm the skills I found.";
    case "projects_certifications_review":
      return "Please review the projects and certifications I found.";
    case "professional_identity":
      return "I inferred a few possible professional identities from your resume. Pick the one that feels closest.";
    case "career_direction":
      return "Your education and experience point in a few possible directions. Which direction should Retuned optimize future resumes for?";
    case "role_interests":
      return "Choose all roles you want Retuned to keep in mind, then continue.";
    case "market_preferences":
      return "Choose every job market you are targeting, then continue.";
    case "work_preferences":
      return "What work setup should Retuned prioritize?";
    case "seniority_comfort":
      return "Choose every seniority level you are comfortable targeting, then continue.";
    case "industries_of_interest":
      return "Choose the industries Retuned should keep in mind, then continue.";
    case "emphasis_preferences":
      return "Choose the areas future resumes should emphasize most, then continue.";
    case "de_emphasis_preferences":
      return "Choose what future resumes should avoid over-highlighting, then continue.";
    case "role_dealbreakers":
      return "Any roles, companies, or conditions you'd never accept? Select any that apply, or continue.";
    case "tone_preferences":
      return "What tone should future resumes use? Select all that apply, then continue.";
    case "style_constraints":
      return "Anything to avoid in resume writing style? Select any that apply, or continue.";
    case "extras_confirm":
      return "I found some additional details. Please review them.";
    case "experience_metrics":
      return null; // Let the LLM generate a personalized prompt for this one
    case "fill_skills":
      return "I could not confidently extract enough skills. Add at least 5 core skills, separated by commas.";
    default:
      return null;
  }
}

function streamTurn(params: {
  message: string;
  question: OnboardingQuestion | null;
  readiness: ProfileReadiness;
  stage: string;
  traceId: string;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: unknown) => controller.enqueue(encoder.encode(sseEvent(type, data)));

      for (const token of params.message.split(/(\s+)/)) {
        if (token) send("token", token);
      }

      send("ui_payload", {
        question: params.question,
        cards: params.question?.cards ?? [],
        readiness: params.readiness,
        stage: params.stage,
        traceId: params.traceId,
      });

      send("turn_complete", {
        phase: params.stage,
        stage: params.stage,
        hardMinimumMet: params.readiness.canEnterDashboard,
        chips: params.question?.pills.map((p) => p.label) ?? [],
        pills: params.question?.pills ?? [],
        cards: params.question?.cards ?? [],
        question: params.question,
        readiness: params.readiness,
        message: params.message,
        traceId: params.traceId,
      });

      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

function normalizeMessageText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function shouldPushAssistant(messages: StoredMessage[], content: string) {
  if (!content.trim()) return false;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return true;
  return !isDuplicateMessage(content, lastAssistant.content) &&
    normalizeMessageText(lastAssistant.content) !== normalizeMessageText(content);
}

function applyPillAction(stored: SessionState, questionKey: string, pill: Pill) {
  const { profile, meta } = stored;
  const field = pill.field ?? questionKey;
  const now = new Date().toISOString();

  if (pill.action === "confirm_field") {
    if (field === "resume_summary" || questionKey === "resume_summary") meta.resumeSummarized = true;
    if (field === "identity" || questionKey === "identity_confirm") {
      meta.identityConfirmed = true;
      profile.identity.fullName.confirmed = true;
      profile.identity.email.confirmed = true;
      profile.identity.location.confirmed = true;
    }
    if (field === "experience" || questionKey === "experience_confirm") {
      meta.experienceConfirmed = true;
      profile.experience.confirmed = true;
    }
    if (field === "education" || questionKey === "education_confirm") {
      meta.educationConfirmed = true;
      profile.education.confirmed = true;
    }
    if (field === "skills" || questionKey === "skills_confirm") {
      meta.skillsConfirmed = true;
      profile.skills.technical.confirmed = true;
      profile.skills.tools.confirmed = true;
      profile.skills.business.confirmed = true;
    }
    if (field === "projects_certifications" || questionKey === "projects_certifications_review") {
      meta.projectsCertificationsReviewed = true;
      profile.projects.confirmed = true;
      profile.certifications.confirmed = true;
    }
    if (field === "extras" || questionKey === "extras_confirm") {
      meta.extrasConfirmed = true;
      profile.languages.confirmed = true;
      profile.awards.confirmed = true;
      profile.publications.confirmed = true;
      profile.volunteering.confirmed = true;
    }
    if (field === "experience" && questionKey === "experience_metrics") {
      meta.experienceMetricsPrompted = true;
    }
    if (field === "education" && questionKey === "fill_education") {
      meta.educationConfirmed = true;
      meta.educationNotApplicable = true;
      profile.onboarding.educationNotApplicable = true;
      profile.education.confirmed = true;
    }
    if (field === "careerIntent.interestedRoles" || questionKey === "role_interests") {
      profile.careerIntent.interestedRoles.confirmed = true;
    }
    if (field === "careerIntent.preferredMarkets" || questionKey === "market_preferences") {
      profile.careerIntent.preferredMarkets.confirmed = true;
    }
    if (field === "careerIntent.seniorityComfort" || questionKey === "seniority_comfort") {
      profile.careerIntent.seniorityComfort.confirmed = true;
    }
    if (field === "careerIntent.industriesOfInterest" || questionKey === "industries_of_interest") {
      profile.careerIntent.industriesOfInterest.confirmed = true;
    }
    if (field === "resumeWritingPreferences.emphasisAreas" || questionKey === "emphasis_preferences") {
      profile.resumeWritingPreferences.emphasisAreas.confirmed = true;
    }
    if (field === "resumeWritingPreferences.deEmphasisAreas" || questionKey === "de_emphasis_preferences") {
      profile.resumeWritingPreferences.deEmphasisAreas.confirmed = true;
    }
    if (field === "careerIntent.roleDealbreakers" || questionKey === "role_dealbreakers") {
      profile.careerIntent.roleDealbreakers.confirmed = true;
    }
    if (field === "resumeWritingPreferences.toneSignals" || questionKey === "tone_preferences") {
      profile.resumeWritingPreferences.toneSignals.confirmed = true;
    }
    if (field === "resumeWritingPreferences.styleConstraints" || questionKey === "style_constraints") {
      profile.resumeWritingPreferences.styleConstraints.confirmed = true;
    }
    if (!meta.answeredQuestionKeys.includes(questionKey)) meta.answeredQuestionKeys.push(questionKey);
    return;
  }

  if (pill.action === "set_field") {
    switch (field) {
      case "professionalProfile.professionalIdentities":
      case "professional_identity":
        profile.professionalProfile.professionalIdentities = attachFieldEdit(profile.professionalProfile.professionalIdentities, [pill.value], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: true });
        break;
      case "careerIntent.careerDirection":
      case "career_direction":
        profile.careerIntent.careerDirection = attachFieldEdit(profile.careerIntent.careerDirection, pill.value as any, { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: true });
        break;
      case "careerIntent.interestedRoles":
      case "role_interests":
        profile.careerIntent.interestedRoles = attachFieldEdit(profile.careerIntent.interestedRoles, [...new Set([...profile.careerIntent.interestedRoles.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "careerIntent.preferredMarkets":
      case "market_preferences":
        profile.careerIntent.preferredMarkets = attachFieldEdit(profile.careerIntent.preferredMarkets, [...new Set([...profile.careerIntent.preferredMarkets.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "careerIntent.workPreference":
      case "work_preferences":
        profile.careerIntent.workPreference = attachFieldEdit(profile.careerIntent.workPreference, pill.value as any, { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: true });
        break;
      case "careerIntent.seniorityComfort":
      case "seniority_comfort":
        profile.careerIntent.seniorityComfort = attachFieldEdit(profile.careerIntent.seniorityComfort, [...new Set([...profile.careerIntent.seniorityComfort.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "careerIntent.industriesOfInterest":
      case "industries_of_interest":
        profile.careerIntent.industriesOfInterest = attachFieldEdit(profile.careerIntent.industriesOfInterest, [...new Set([...profile.careerIntent.industriesOfInterest.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "resumeWritingPreferences.emphasisAreas":
      case "emphasis_preferences":
        profile.resumeWritingPreferences.emphasisAreas = attachFieldEdit(profile.resumeWritingPreferences.emphasisAreas, [...new Set([...profile.resumeWritingPreferences.emphasisAreas.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "resumeWritingPreferences.deEmphasisAreas":
      case "de_emphasis_preferences":
        profile.resumeWritingPreferences.deEmphasisAreas = attachFieldEdit(profile.resumeWritingPreferences.deEmphasisAreas, [...new Set([...profile.resumeWritingPreferences.deEmphasisAreas.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "careerIntent.roleDealbreakers":
      case "role_dealbreakers":
        profile.careerIntent.roleDealbreakers = attachFieldEdit(profile.careerIntent.roleDealbreakers, [...new Set([...profile.careerIntent.roleDealbreakers.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "resumeWritingPreferences.toneSignals":
      case "tone_preferences":
        profile.resumeWritingPreferences.toneSignals = attachFieldEdit(profile.resumeWritingPreferences.toneSignals, [...new Set([...profile.resumeWritingPreferences.toneSignals.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
      case "resumeWritingPreferences.styleConstraints":
      case "style_constraints":
        profile.resumeWritingPreferences.styleConstraints = attachFieldEdit(profile.resumeWritingPreferences.styleConstraints, [...new Set([...profile.resumeWritingPreferences.styleConstraints.value, pill.value])], { source: "user", actor: "user", reason: questionKey, confidence: 1, confirmed: false });
        break;
    }
    if (!meta.answeredQuestionKeys.includes(questionKey)) meta.answeredQuestionKeys.push(questionKey);
    return;
  }

  if (pill.action === "ask_text" && field) {
    meta.pendingTextInput = { field, questionKey, expectedFormat: "general_text" };
    return;
  }

  if (pill.action === "skip" && field) {
    meta.skippedQuestionKeys.push({ questionKey, field, skippedAt: now, skipScope: "this_session" });
  }
}

function applyMultiSelect(stored: SessionState, field: string, values: string[]) {
  const selected = [...new Set(values.map((value) => value.trim()).filter(Boolean))];

  switch (field) {
    case "careerIntent.interestedRoles":
    case "role_interests":
      stored.profile.careerIntent.interestedRoles = attachFieldEdit(stored.profile.careerIntent.interestedRoles, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "careerIntent.preferredMarkets":
    case "market_preferences":
      stored.profile.careerIntent.preferredMarkets = attachFieldEdit(stored.profile.careerIntent.preferredMarkets, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "careerIntent.seniorityComfort":
    case "seniority_comfort":
      stored.profile.careerIntent.seniorityComfort = attachFieldEdit(stored.profile.careerIntent.seniorityComfort, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "careerIntent.industriesOfInterest":
    case "industries_of_interest":
      stored.profile.careerIntent.industriesOfInterest = attachFieldEdit(stored.profile.careerIntent.industriesOfInterest, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "resumeWritingPreferences.emphasisAreas":
    case "emphasis_preferences":
      stored.profile.resumeWritingPreferences.emphasisAreas = attachFieldEdit(stored.profile.resumeWritingPreferences.emphasisAreas, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "resumeWritingPreferences.deEmphasisAreas":
    case "de_emphasis_preferences":
      stored.profile.resumeWritingPreferences.deEmphasisAreas = attachFieldEdit(stored.profile.resumeWritingPreferences.deEmphasisAreas, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "careerIntent.roleDealbreakers":
    case "role_dealbreakers":
      stored.profile.careerIntent.roleDealbreakers = attachFieldEdit(stored.profile.careerIntent.roleDealbreakers, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "resumeWritingPreferences.toneSignals":
    case "tone_preferences":
      stored.profile.resumeWritingPreferences.toneSignals = attachFieldEdit(stored.profile.resumeWritingPreferences.toneSignals, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
    case "resumeWritingPreferences.styleConstraints":
    case "style_constraints":
      stored.profile.resumeWritingPreferences.styleConstraints = attachFieldEdit(stored.profile.resumeWritingPreferences.styleConstraints, selected, { source: "user", actor: "user", reason: "multi_select", confidence: 1, confirmed: true });
      break;
  }
}

function applySkillsUpdate(stored: SessionState, skills: { technical: string[]; tools: string[]; business: string[] }) {
  stored.profile.skills.technical = attachFieldEdit(stored.profile.skills.technical, skills.technical, { source: "user", actor: "user", reason: "skills_update", confidence: 1, confirmed: true });
  stored.profile.skills.tools = attachFieldEdit(stored.profile.skills.tools, skills.tools, { source: "user", actor: "user", reason: "skills_update", confidence: 1, confirmed: true });
  stored.profile.skills.business = attachFieldEdit(stored.profile.skills.business, skills.business, { source: "user", actor: "user", reason: "skills_update", confidence: 1, confirmed: true });
  stored.meta.skillsConfirmed = true;
}

function extractSkillNames(values: unknown[]): string[] {
  return values
    .map((value) => {
      if (value && typeof value === "object" && "name" in value) {
        return String((value as { name?: unknown }).name ?? "");
      }
      return String(value ?? "");
    })
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeStoredProfile(profile: UserCareerProfile) {
  profile.skills.technical.value = normalizeStringArray(profile.skills.technical.value).map(normalizeSkill);
  profile.skills.tools.value = normalizeStringArray(profile.skills.tools.value).map(normalizeSkill);
  profile.skills.business.value = normalizeStringArray(profile.skills.business.value).map(normalizeSkill);
}

function toNormalizerInput(profile: UserCareerProfile): Record<string, unknown> {
  return {
    fullName: profile.identity.fullName.value,
    email: profile.identity.email.value,
    phone: profile.identity.phone.value,
    linkedin: profile.identity.linkedin.value,
    location: profile.identity.location.value,
    currentTitle: profile.professionalProfile.currentTitles.value[0] ?? profile.experience.value[0]?.title ?? null,
    targetRoles: profile.careerIntent.interestedRoles.value,
    experience: profile.experience.value,
    education: profile.education.value,
    certifications: profile.certifications.value.map((c) => c.name),
    projects: profile.projects.value,
    skillsTier1: profile.skills.technical.value.map((name) => ({ name })),
    skillsTier2: profile.skills.tools.value.map((name) => ({ name })),
    skillsTier3: [...profile.skills.business.value, ...profile.skills.softSkills.value].map((name) => ({ name })),
    summary: profile.resumeWritingPreferences.emphasisAreas.value.join(", "),
  };
}

function unconfirmStep(stored: SessionState, questionKey: string) {
  const { profile, meta } = stored;
  // Remove from answered keys so planner re-asks
  meta.answeredQuestionKeys = meta.answeredQuestionKeys.filter((k) => k !== questionKey);
  switch (questionKey) {
    case "identity_confirm": meta.identityConfirmed = false; break;
    case "experience_confirm": meta.experienceConfirmed = false; profile.experience.confirmed = false; break;
    case "experience_metrics": meta.experienceMetricsPrompted = false; break;
    case "education_confirm": meta.educationConfirmed = false; profile.education.confirmed = false; break;
    case "skills_confirm": meta.skillsConfirmed = false; profile.skills.technical.confirmed = false; profile.skills.tools.confirmed = false; profile.skills.business.confirmed = false; break;
    case "projects_certifications_review": meta.projectsCertificationsReviewed = false; break;
    case "extras_confirm": meta.extrasConfirmed = false; break;
    case "professional_identity": profile.professionalProfile.professionalIdentities.confirmed = false; break;
    case "career_direction": profile.careerIntent.careerDirection.confirmed = false; break;
    case "role_interests": profile.careerIntent.interestedRoles.confirmed = false; break;
    case "role_dealbreakers": profile.careerIntent.roleDealbreakers.confirmed = false; break;
    case "market_preferences": profile.careerIntent.preferredMarkets.confirmed = false; break;
    case "work_preferences": profile.careerIntent.workPreference.confirmed = false; break;
    case "seniority_comfort": profile.careerIntent.seniorityComfort.confirmed = false; break;
    case "industries_of_interest": profile.careerIntent.industriesOfInterest.confirmed = false; break;
    case "emphasis_preferences": profile.resumeWritingPreferences.emphasisAreas.confirmed = false; break;
    case "de_emphasis_preferences": profile.resumeWritingPreferences.deEmphasisAreas.confirmed = false; break;
    case "tone_preferences": profile.resumeWritingPreferences.toneSignals.confirmed = false; break;
    case "style_constraints": profile.resumeWritingPreferences.styleConstraints.confirmed = false; break;
  }
}
