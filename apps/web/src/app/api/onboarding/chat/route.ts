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

import { COACH_INSTRUCTIONS } from "@/lib/onboarding/coach-prompt";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import { fallbackFor } from "@/lib/onboarding/fallback-templates";
import { applyInputGuardrails, stripOutputLeaks, isDuplicateMessage } from "@/lib/onboarding/guardrails";
import { normalizeSkill, normalizeStringArray } from "@/lib/onboarding/normalization";
import { planNextQuestion } from "@/lib/onboarding/planner";
import { buildProfileContext } from "@/lib/onboarding/profile-context";
import { calculateProfileReadiness } from "@/lib/onboarding/readiness";
import { createEmptyProfile, getOrCreateSession, saveSession } from "@/lib/onboarding/session-store";
import { SSE_HEADERS, sseEvent } from "@/lib/onboarding/sse";
import { ONBOARDING_TOOLS } from "@/lib/onboarding/tools";
import { normalizeProfile } from "@/lib/profile-domain/services/normalizer";
import { persistProfile } from "@/lib/profile-domain/repositories/profile-repository";
import type { OnboardingQuestion, Pill, ProfileReadiness, SessionState, StoredMessage, UserCareerProfile } from "@/lib/onboarding/types";

const START_OVER_LIMIT = 25;

type ChatRequest =
  | { kind: "greeting" }
  | { kind: "message"; text: string }
  | { kind: "text_input"; text: string }
  | { kind: "pill"; pill: Pill; questionKey?: string }
  | { kind: "pill_click"; questionKey: string; pill: Pill }
  | { kind: "multi_select"; questionKey: string; field: string; values: string[] }
  | { kind: "skills_update"; skills: { technical: string[]; tools: string[]; business: string[] } }
  | { kind: "resume_data"; profile: Record<string, unknown> }
  | { kind: "resume_failed" }
  | { kind: "start_over" }
  | { kind: "skip_onboarding" };

function parseBody(raw: unknown): ChatRequest {
  if (!raw || typeof raw !== "object") throw new ValidationError("Invalid body");
  const r = raw as Record<string, unknown>;

  if (r.kind === "greeting") return { kind: "greeting" };
  if (r.kind === "resume_failed") return { kind: "resume_failed" };
  if (r.kind === "start_over") return { kind: "start_over" };
  if (r.kind === "skip_onboarding") return { kind: "skip_onboarding" };

  if (r.kind === "message" || r.kind === "text_input") {
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text) throw new ValidationError("Text required");
    return { kind: r.kind, text };
  }

  if (r.kind === "pill" || r.kind === "pill_click") {
    if (!r.pill || typeof r.pill !== "object") throw new ValidationError("Pill is required");
    return {
      kind: r.kind,
      questionKey: typeof r.questionKey === "string" ? r.questionKey : "",
      pill: r.pill as Pill,
    };
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
      skills: {
        technical: Array.isArray(skills.technical) ? skills.technical.map(String) : [],
        tools: Array.isArray(skills.tools) ? skills.tools.map(String) : [],
        business: Array.isArray(skills.business) ? skills.business.map(String) : [],
      },
    };
  }

  if (r.kind === "resume_data") {
    return { kind: "resume_data", profile: (r.profile as Record<string, unknown>) ?? {} };
  }

  throw new ValidationError("Unknown kind");
}

export const POST = withAuth(async (request, session) => {
  const { success } = rateLimit(request as unknown as NextRequest, 60, 60000);
  if (!success) {
    return new Response(sseEvent("error", { message: "Too many messages." }), { status: 429, headers: SSE_HEADERS });
  }

  const raw = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON");
  });
  const body = parseBody(raw);
  const stored = await getOrCreateSession(session.userId);

  if (body.kind === "start_over") {
    if (stored.meta.resetCount >= START_OVER_LIMIT) {
      return new Response(sseEvent("error", { message: `Already restarted ${START_OVER_LIMIT} times.` }), { headers: SSE_HEADERS });
    }
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
      pendingTextInput: undefined,
      enhancementTurns: 0,
      resetCount,
    };
    stored.messages = [];
    stored.responseChainId = null;
    stored.turnCount = 0;
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
    });
  }

  if (body.kind === "skip_onboarding") {
    const supabase = await (await import("@/lib/supabase/server")).createClient();
    await supabase.from("users").update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq("id", session.userId);
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "dashboard_handoff", payload: { skipped: true } });
    return streamTurn({
      message: fallbackFor("profile_ready"),
      question: null,
      readiness: calculateProfileReadiness(stored.profile),
      stage: "dashboard_handoff",
    });
  }

  if (body.kind === "pill" || body.kind === "pill_click") {
    const questionKey = body.questionKey || stored.meta.lastQuestionKey || body.pill.field || body.pill.value;
    applyPillAction(stored, questionKey, body.pill);
    stored.messages.push({ role: "user", content: body.pill.label, ts: new Date().toISOString() });
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "pill_clicked", payload: { questionKey, pill: body.pill } });
  } else if (body.kind === "message" || body.kind === "text_input") {
    const guarded = applyInputGuardrails(body.text);
    if (guarded.blocked) return new Response(sseEvent("error", { message: "Invalid input." }), { headers: SSE_HEADERS });
    stored.messages.push({ role: "user", content: guarded.text, ts: new Date().toISOString() });
    applyTextToField(stored, guarded.text);
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "text_submitted", payload: { textLength: guarded.text.length } });
  } else if (body.kind === "multi_select") {
    applyMultiSelect(stored, body.field, body.values);
    stored.messages.push({ role: "user", content: body.values.length ? body.values.join(", ") : "Continue", ts: new Date().toISOString() });
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "field_confirmed", payload: { questionKey: body.questionKey, field: body.field, count: body.values.length } });
  } else if (body.kind === "skills_update") {
    applySkillsUpdate(stored, body.skills);
    stored.messages.push({ role: "user", content: "Updated skills", ts: new Date().toISOString() });
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "field_updated", payload: { field: "skills", counts: body.skills } });
  } else if (body.kind === "resume_data") {
    applyResumeData(stored, body.profile);
    stored.meta.resumeUploaded = true;
    stored.meta.resumeParsed = true;
    stored.meta.currentPhase = "resume_summary";
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "resume_parsed", payload: { keys: Object.keys(body.profile) } });
  } else if (body.kind === "resume_failed") {
    stored.meta.resumeUploaded = true;
    stored.meta.resumeParsed = false;
    stored.meta.currentPhase = "resume_upload";
  } else if (body.kind === "greeting") {
    stored.meta.currentPhase = "resume_upload";
  }

  normalizeStoredProfile(stored.profile);

  const readiness = calculateProfileReadiness(stored.profile);
  const question = planNextQuestion(stored.profile, stored.meta);

  if (!question && readiness.canEnterDashboard) {
    const normalized = normalizeProfile(toNormalizerInput(stored.profile), session.email, session.fullName ?? "");
    Object.assign(normalized, onboardingProfileExtras(stored.profile));
    await persistProfile({
      userId: session.userId,
      sessionEmail: session.email,
      sessionFullName: session.fullName,
      profile: normalized,
      markOnboardingCompleted: true,
    });

    stored.meta.currentPhase = "dashboard_handoff";
    await saveSession(session.userId, stored);
    await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "profile_ready", payload: { score: readiness.score } });
    return streamTurn({ message: fallbackFor("profile_ready"), question: null, readiness, stage: "dashboard_handoff" });
  }

  if (!question) {
    stored.meta.currentPhase = "profile_gap_fill";
    await saveSession(session.userId, stored);
    return streamTurn({
      message: readiness.blockers[0] ?? "A little more profile detail is needed before the dashboard.",
      question: null,
      readiness,
      stage: "profile_gap_fill",
    });
  }

  stored.meta.currentPhase = question.phase;
  stored.meta.lastQuestionKey = question.questionKey;
  await logOnboardingEvent({ userId: session.userId, sessionId: stored.id, eventType: "question_planned", payload: { phase: question.phase, questionKey: question.questionKey } });

  const message = await generateAssistantMessage(question, stored.profile);

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

  return streamTurn({ message, question, readiness, stage: question.phase });
});

async function generateAssistantMessage(question: OnboardingQuestion, profile: UserCareerProfile): Promise<string> {
  const fixed = fixedCardPrompt(question);
  if (fixed) return fixed;

  let message = fallbackFor(question.questionKey);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const context = buildProfileContext(profile, question.phase);
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
          "[OUTPUT RULES]",
          "Write exactly 1 short message. Max 2 sentences. Do not create pills or decide the next question.",
          "If cards are provided, do not summarize the card contents. Ask the user to review the cards instead.",
        ].join("\n"),
      }],
      max_output_tokens: 120,
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
  }

  const safe = stripOutputLeaks(message).trim();
  return safe || fallbackFor(question.questionKey);
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
    case "emphasis_preferences":
      return "Choose the areas future resumes should emphasize most, then continue.";
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
    if (field === "careerIntent.interestedRoles" || questionKey === "role_interests") {
      profile.careerIntent.interestedRoles.confirmed = true;
    }
    if (field === "careerIntent.preferredMarkets" || questionKey === "market_preferences") {
      profile.careerIntent.preferredMarkets.confirmed = true;
    }
    if (field === "resumeWritingPreferences.emphasisAreas" || questionKey === "emphasis_preferences") {
      profile.resumeWritingPreferences.emphasisAreas.confirmed = true;
    }
    meta.answeredQuestionKeys.push(questionKey);
    return;
  }

  if (pill.action === "set_field") {
    switch (field) {
      case "professionalProfile.professionalIdentities":
      case "professional_identity":
        profile.professionalProfile.professionalIdentities = { value: [pill.value], source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
        break;
      case "careerIntent.careerDirection":
      case "career_direction":
        profile.careerIntent.careerDirection = { value: pill.value as any, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
        break;
      case "careerIntent.interestedRoles":
      case "role_interests":
        profile.careerIntent.interestedRoles = { value: [...new Set([...profile.careerIntent.interestedRoles.value, pill.value])], source: "user", confidence: 1, confirmed: false, lastUpdatedAt: now };
        break;
      case "careerIntent.preferredMarkets":
      case "market_preferences":
        profile.careerIntent.preferredMarkets = { value: [...new Set([...profile.careerIntent.preferredMarkets.value, pill.value])], source: "user", confidence: 1, confirmed: false, lastUpdatedAt: now };
        break;
      case "careerIntent.workPreference":
      case "work_preferences":
        profile.careerIntent.workPreference = { value: pill.value as any, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
        break;
      case "resumeWritingPreferences.emphasisAreas":
      case "emphasis_preferences":
        profile.resumeWritingPreferences.emphasisAreas = { value: [...new Set([...profile.resumeWritingPreferences.emphasisAreas.value, pill.value])], source: "user", confidence: 1, confirmed: false, lastUpdatedAt: now };
        break;
    }
    meta.answeredQuestionKeys.push(questionKey);
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

function applyTextToField(stored: SessionState, text: string) {
  const pending = stored.meta.pendingTextInput;
  if (!pending) return;

  const values = text.split(",").map((v) => v.trim()).filter(Boolean);
  const now = new Date().toISOString();

  switch (pending.field) {
    case "professionalProfile.professionalIdentities":
      stored.profile.professionalProfile.professionalIdentities = { value: values, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
    case "careerIntent.interestedRoles":
      stored.profile.careerIntent.interestedRoles = { value: values, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
    case "careerIntent.preferredMarkets":
      stored.profile.careerIntent.preferredMarkets = { value: values, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
    case "resumeWritingPreferences.emphasisAreas":
      stored.profile.resumeWritingPreferences.emphasisAreas = { value: values, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
    case "skills":
      stored.profile.skills.technical = { value: values, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      stored.meta.skillsConfirmed = true;
      break;
  }

  stored.meta.answeredQuestionKeys.push(pending.questionKey);
  stored.meta.pendingTextInput = undefined;
}

function applyMultiSelect(stored: SessionState, field: string, values: string[]) {
  const now = new Date().toISOString();
  const selected = [...new Set(values.map((value) => value.trim()).filter(Boolean))];

  switch (field) {
    case "careerIntent.interestedRoles":
    case "role_interests":
      stored.profile.careerIntent.interestedRoles = { value: selected, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
    case "careerIntent.preferredMarkets":
    case "market_preferences":
      stored.profile.careerIntent.preferredMarkets = { value: selected, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
    case "resumeWritingPreferences.emphasisAreas":
    case "emphasis_preferences":
      stored.profile.resumeWritingPreferences.emphasisAreas = { value: selected, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
      break;
  }
}

function applySkillsUpdate(stored: SessionState, skills: { technical: string[]; tools: string[]; business: string[] }) {
  const now = new Date().toISOString();
  stored.profile.skills.technical = { value: skills.technical, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
  stored.profile.skills.tools = { value: skills.tools, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
  stored.profile.skills.business = { value: skills.business, source: "user", confidence: 1, confirmed: true, lastUpdatedAt: now };
  stored.meta.skillsConfirmed = true;
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
      id: e.id ?? `exp-${i}`,
      title: e.title ?? "",
      company: e.company ?? "",
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate ?? "Present",
      isCurrent: e.isCurrent,
      responsibilities: Array.isArray(e.responsibilities) ? e.responsibilities : (e.description ? [e.description] : []),
      achievements: Array.isArray(e.achievements) ? e.achievements : [],
      tools: Array.isArray(e.tools) ? e.tools : [],
      skills: Array.isArray(e.skills) ? e.skills : [],
      domain: e.domain,
      confidence: 0.8,
    })));
  }

  if (Array.isArray(data.education)) {
    profile.education = field(data.education.map((e: any, i: number) => ({
      id: e.id ?? `edu-${i}`,
      degree: e.degree ?? "",
      institution: e.institution ?? "",
      fieldOfStudy: e.fieldOfStudy,
      graduationYear: e.graduationYear ?? e.endDate,
      location: e.location,
      grade: e.grade,
    })));
  }

  if (Array.isArray(data.skillsTier1)) profile.skills.technical = field(extractSkillNames(data.skillsTier1));
  else if (Array.isArray(data.technicalSkills)) profile.skills.technical = field(data.technicalSkills.map(String));
  else if (Array.isArray(data.skills)) profile.skills.technical = field(data.skills.map(String));

  if (Array.isArray(data.skillsTier2)) profile.skills.tools = field(extractSkillNames(data.skillsTier2));
  else if (Array.isArray(data.tools)) profile.skills.tools = field(data.tools.map(String));

  if (Array.isArray(data.skillsTier3)) profile.skills.business = field(extractSkillNames(data.skillsTier3));
  else if (Array.isArray(data.professionalSkills)) profile.skills.business = field(data.professionalSkills.map(String));
  if (data.currentTitle) profile.professionalProfile.currentTitles = field([String(data.currentTitle)]);
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
