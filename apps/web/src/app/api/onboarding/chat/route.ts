/**
 * POST /api/onboarding/chat
 *
 * Planner-driven onboarding. Backend decides phase + pills. LLM writes message copy.
 */
import { withAuth } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import OpenAI from "openai";

import { COACH_INSTRUCTIONS } from "@/lib/onboarding/coach-prompt";
import { computeReadiness } from "@/lib/onboarding/completeness";
import { applyInputGuardrails, stripOutputLeaks, isDuplicateMessage } from "@/lib/onboarding/guardrails";
import { planNextQuestion } from "@/lib/onboarding/planner";
import { buildProfileContext } from "@/lib/onboarding/profile-context";
import { getOrCreateSession, saveSession } from "@/lib/onboarding/session-store";
import { ONBOARDING_TOOLS } from "@/lib/onboarding/tools";
import type { OnboardingQuestion, Pill, StoredMessage, SessionState } from "@/lib/onboarding/types";

// Fallback templates when LLM fails
const FALLBACK_TEMPLATES: Record<string, string> = {
  resume_upload: "Upload your resume and I'll extract your profile from it.",
  resume_summary: "I've reviewed your resume and created a draft profile. Let's confirm what I found.",
  identity_confirm: "I found your basic details. Do these look correct?",
  experience_confirm: "I found your work experience. Please review it.",
  education_confirm: "I found your education details. Should I keep these?",
  skills_confirm: "I found these skills from your resume. Look right?",
  professional_identity: "Based on your resume, which professional identity feels closest?",
  career_direction: "Are you continuing in the same direction or shifting?",
  role_interests: "Which roles should Retuned keep in mind for future resumes?",
  market_preferences: "Which job markets are you interested in?",
  work_preferences: "What work setup do you prefer?",
  emphasis_preferences: "What should future resumes highlight most?",
};

// ─── Request types ────────────────────────────────────────────────────────────

type ChatRequest =
  | { kind: "greeting" }
  | { kind: "pill_click"; questionKey: string; pill: { value: string; action: string } }
  | { kind: "text_input"; text: string }
  | { kind: "resume_data"; profile: Record<string, unknown> }
  | { kind: "start_over" }
  | { kind: "skip_onboarding" };

function parseBody(raw: unknown): ChatRequest {
  if (!raw || typeof raw !== "object") throw new ValidationError("Invalid body");
  const r = raw as Record<string, unknown>;
  switch (r.kind) {
    case "greeting": return { kind: "greeting" };
    case "pill_click": return { kind: "pill_click", questionKey: r.questionKey as string, pill: r.pill as { value: string; action: string } };
    case "text_input": {
      const text = typeof r.text === "string" ? r.text.trim() : "";
      if (!text) throw new ValidationError("Text required");
      return { kind: "text_input", text };
    }
    case "resume_data": return { kind: "resume_data", profile: (r.profile as Record<string, unknown>) ?? {} };
    case "start_over": return { kind: "start_over" };
    case "skip_onboarding": return { kind: "skip_onboarding" };
    default: throw new ValidationError("Unknown kind");
  }
}

// ─── SSE ──────────────────────────────────────────────────────────────────────

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
const SSE_HEADERS = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

// ─── Handler ──────────────────────────────────────────────────────────────────

export const POST = withAuth(async (request, session) => {
  const { success } = rateLimit(request as unknown as NextRequest, 10);
  if (!success) return new Response(sseEvent("error", { message: "Too many messages." }), { status: 429, headers: SSE_HEADERS });

  const raw = await request.json().catch(() => { throw new ValidationError("Invalid JSON"); });
  const body = parseBody(raw);

  const stored = await getOrCreateSession(session.userId);

  // ── Start over ──
  if (body.kind === "start_over") {
    if (stored.meta.resetCount >= 2) {
      return new Response(sseEvent("error", { message: "Already restarted twice." }), { headers: SSE_HEADERS });
    }
    stored.meta = { ...stored.meta, currentPhase: "orb_intro", answeredQuestionKeys: [], skippedQuestionKeys: [], resumeUploaded: false, resumeParsed: false, resumeSummarized: false, identityConfirmed: false, experienceConfirmed: false, educationConfirmed: false, skillsConfirmed: false, enhancementTurns: 0, resetCount: stored.meta.resetCount + 1 };
    stored.messages = [];
    stored.responseChainId = null;
    stored.turnCount = 0;
    await saveSession(session.userId, stored);
    return new Response(sseEvent("turn_complete", { phase: "orb_intro", question: null, readiness: computeReadiness(stored.profile) }), { headers: SSE_HEADERS });
  }

  // ── Skip onboarding ──
  if (body.kind === "skip_onboarding") {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    await supabase.from("users").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("id", session.userId);
    return new Response(sseEvent("turn_complete", { phase: "dashboard_handoff", question: null, readiness: computeReadiness(stored.profile) }), { headers: SSE_HEADERS });
  }

  // ── Process user input ──
  if (body.kind === "pill_click") {
    applyPillAction(stored, body.questionKey, body.pill);
    stored.meta.answeredQuestionKeys.push(body.questionKey);
  } else if (body.kind === "text_input") {
    const guarded = applyInputGuardrails(body.text);
    if (guarded.blocked) return new Response(sseEvent("error", { message: "Invalid input." }), { headers: SSE_HEADERS });
    stored.messages.push({ role: "user", content: guarded.text, ts: new Date().toISOString() });
    // If pending text input, route to the correct field
    if (stored.meta.pendingTextInput) {
      applyTextToField(stored, guarded.text);
      stored.meta.pendingTextInput = undefined;
    }
  } else if (body.kind === "resume_data") {
    applyResumeData(stored, body.profile);
    stored.meta.resumeUploaded = true;
    stored.meta.resumeParsed = true;
  } else if (body.kind === "greeting") {
    stored.meta.currentPhase = "resume_upload";
  }

  // ── Plan next question ──
  const question = planNextQuestion(stored.profile, stored.meta);
  const readiness = computeReadiness(stored.profile);

  if (!question) {
    stored.meta.currentPhase = "profile_ready";
    await saveSession(session.userId, stored);
    return new Response(sseEvent("turn_complete", {
      phase: "profile_ready",
      question: null,
      readiness,
      message: "Your Retuned profile is ready! Head to your dashboard to start generating tailored resumes.",
      pills: [{ label: "Go to Dashboard", value: "dashboard", action: "navigate" }],
    }), { headers: SSE_HEADERS });
  }

  stored.meta.currentPhase = question.phase;

  // ── Generate message via LLM ──
  let message = FALLBACK_TEMPLATES[question.questionKey] ?? question.prompt;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const context = buildProfileContext(stored.profile, question.phase);
    const llmInput = `[QUESTION]\nPhase: ${question.phase}\nQuestion key: ${question.questionKey}\nPrompt: ${question.prompt}\n${question.whyAsked ? `Why asked: ${question.whyAsked}` : ""}\n\n[PROFILE CONTEXT]\n${context}\n\n[OUTPUT RULES]\n1-2 sentences. Warm, clear, premium. Reference specific data. No generic filler.`;

    const response = await (openai.responses as any).create({
      model: process.env.ONBOARDING_MODEL ?? "gpt-4o-mini",
      instructions: COACH_INSTRUCTIONS,
      input: [{ role: "user", content: llmInput }],
      tools: ONBOARDING_TOOLS,
    });

    // No chaining needed — planner owns state, not the LLM

    // Extract message from tool call or output_text
    const toolCall = response.output?.find((o: any) => o.type === "function_call" && o.name === "write_message");
    if (toolCall) {
      try { message = JSON.parse(toolCall.arguments).message || message; } catch {}
    } else if (response.output_text?.trim()) {
      message = response.output_text;
    }
  } catch (err) {
    // LLM failed — use fallback template
    console.error("[onboarding/chat] LLM error:", err);
  }

  message = stripOutputLeaks(message);

  // ── Dedup + blank check ──
  const lastAssistant = stored.messages.filter(m => m.role === "assistant").pop();
  if (!message.trim() || isDuplicateMessage(message, lastAssistant?.content)) {
    message = FALLBACK_TEMPLATES[question.questionKey] ?? question.prompt;
  }

  // ── Save ──
  stored.messages.push({ role: "assistant", content: message, ts: new Date().toISOString(), questionKey: question.questionKey, cards: question.cards, pills: question.pills });
  stored.turnCount += 1;
  await saveSession(session.userId, stored);

  // ── Respond ──
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Stream the message token by token for the typing effect
      controller.enqueue(encoder.encode(sseEvent("token", message)));
      controller.enqueue(encoder.encode(sseEvent("turn_complete", {
        phase: question.phase,
        question: { questionKey: question.questionKey, answerType: question.answerType, field: question.field, whyAsked: question.whyAsked },
        pills: question.pills,
        cards: question.cards,
        readiness,
      })));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});

// ─── State mutation helpers ───────────────────────────────────────────────────

function applyPillAction(stored: SessionState, questionKey: string, pill: { value: string; action: string }) {
  const { profile, meta } = stored;

  if (pill.action === "confirm_field") {
    switch (questionKey) {
      case "resume_summary": meta.resumeSummarized = true; break;
      case "identity_confirm": meta.identityConfirmed = true; profile.identity.fullName.confirmed = true; profile.identity.email.confirmed = true; profile.identity.location.confirmed = true; break;
      case "experience_confirm": meta.experienceConfirmed = true; profile.experience.confirmed = true; break;
      case "education_confirm": meta.educationConfirmed = true; profile.education.confirmed = true; break;
      case "skills_confirm": meta.skillsConfirmed = true; profile.skills.technical.confirmed = true; profile.skills.tools.confirmed = true; profile.skills.business.confirmed = true; break;
    }
  } else if (pill.action === "set_field") {
    switch (questionKey) {
      case "professional_identity": profile.professionalProfile.professionalIdentities = { value: [pill.value], source: "user", confidence: 1, confirmed: true, lastUpdatedAt: new Date().toISOString() }; break;
      case "career_direction": profile.careerIntent.careerDirection = { value: pill.value as any, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: new Date().toISOString() }; break;
      case "role_interests": profile.careerIntent.interestedRoles = { value: [...profile.careerIntent.interestedRoles.value, pill.value], source: "user", confidence: 1, confirmed: true, lastUpdatedAt: new Date().toISOString() }; break;
      case "market_preferences": profile.careerIntent.preferredMarkets = { value: [...profile.careerIntent.preferredMarkets.value, pill.value], source: "user", confidence: 1, confirmed: true, lastUpdatedAt: new Date().toISOString() }; break;
      case "work_preferences": profile.careerIntent.workPreference = { value: pill.value as any, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: new Date().toISOString() }; break;
      case "emphasis_preferences": profile.resumeWritingPreferences.emphasisAreas = { value: [...profile.resumeWritingPreferences.emphasisAreas.value, pill.value], source: "user", confidence: 1, confirmed: true, lastUpdatedAt: new Date().toISOString() }; break;
    }
  } else if (pill.action === "ask_text") {
    meta.pendingTextInput = { field: questionKey, questionKey, expectedFormat: "general_text" };
  } else if (pill.action === "skip") {
    meta.skippedQuestionKeys.push({ questionKey, field: questionKey, skippedAt: new Date().toISOString() });
    // Mark as confirmed with empty to prevent re-asking
    switch (questionKey) {
      case "career_direction": profile.careerIntent.careerDirection.confirmed = true; break;
      case "role_interests": profile.careerIntent.interestedRoles.confirmed = true; break;
      case "market_preferences": profile.careerIntent.preferredMarkets.confirmed = true; break;
      case "work_preferences": profile.careerIntent.workPreference.confirmed = true; break;
      case "emphasis_preferences": profile.resumeWritingPreferences.emphasisAreas.confirmed = true; break;
    }
  }
}

function applyTextToField(stored: SessionState, text: string) {
  // Simple text routing — the LLM can also extract structured data in a follow-up
  const pending = stored.meta.pendingTextInput;
  if (!pending) return;
  const { profile } = stored;
  const now = new Date().toISOString();

  switch (pending.questionKey) {
    case "identity_confirm": /* user wants to edit identity — store as-is for now */ break;
    case "experience_confirm": /* user wants to edit experience */ break;
    default: break;
  }
}

function applyResumeData(stored: SessionState, data: Record<string, unknown>) {
  const { profile } = stored;
  const now = new Date().toISOString();
  const field = <T>(v: T, conf = 0.8) => ({ value: v, source: "resume" as const, confidence: conf, confirmed: false, lastUpdatedAt: now });

  if (data.fullName) profile.identity.fullName = field(String(data.fullName));
  if (data.email) profile.identity.email = field(String(data.email));
  if (data.phone) profile.identity.phone = field(String(data.phone));
  if (data.location) profile.identity.location = field(String(data.location));
  if (data.linkedin) profile.identity.linkedin = field(String(data.linkedin));

  if (Array.isArray(data.experience)) {
    profile.experience = field(data.experience.map((e: any, i: number) => ({
      id: `exp-${i}`, title: e.title ?? "", company: e.company ?? "", location: e.location,
      startDate: e.startDate, endDate: e.endDate ?? "Present", isCurrent: e.isCurrent,
      responsibilities: Array.isArray(e.responsibilities) ? e.responsibilities : (e.description ? [e.description] : []),
      achievements: Array.isArray(e.achievements) ? e.achievements : [],
      tools: Array.isArray(e.tools) ? e.tools : [],
      skills: Array.isArray(e.skills) ? e.skills : [],
      domain: e.domain, confidence: 0.8,
    })));
  }

  if (Array.isArray(data.education)) {
    profile.education = field(data.education.map((e: any, i: number) => ({
      id: `edu-${i}`, degree: e.degree ?? "", institution: e.institution ?? "",
      fieldOfStudy: e.fieldOfStudy, graduationYear: e.graduationYear ?? e.endDate,
      location: e.location, grade: e.grade,
    })));
  }

  if (Array.isArray(data.technicalSkills)) profile.skills.technical = field(data.technicalSkills as string[]);
  else if (Array.isArray(data.skills)) profile.skills.technical = field(data.skills as string[]);
  if (Array.isArray(data.tools)) profile.skills.tools = field(data.tools as string[]);
  if (Array.isArray(data.professionalSkills)) profile.skills.business = field(data.professionalSkills as string[]);

  if (data.currentTitle) profile.professionalProfile.currentTitles = field([String(data.currentTitle)]);
}


