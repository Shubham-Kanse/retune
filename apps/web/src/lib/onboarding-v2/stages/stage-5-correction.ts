// Onboarding V2 — Stage 5: Correction Handling Loop

import { CORRECTION_MAX_ROUNDS, VAGUE_ROUNDS_BEFORE_ESCAPE } from "../constants";
import { callLLM } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import { CORRECTION_INTERPRETATION_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { ExtractionSchema, OnboardingV2Session } from "../types";

export interface CorrectionResult {
  correctionUnderstood: boolean;
  clarifyingQuestion: string | null;
  fieldsChanged: string[];
  updatedExtraction: ExtractionSchema | null;
  userConfirmationMessage: string;
  userSuppliedFields: string[];
  shouldEscalate: boolean;
  escapeMessage: string | null;
  action?: "restart";
}

interface LLMCorrectionOutput {
  correction_understood: boolean;
  clarifying_question: string | null;
  fields_changed: string[];
  updated_extraction: Record<string, unknown> | null;
  user_confirmation_message: string;
  user_supplied_fields: string[];
}

export async function processCorrectionRound(
  session: OnboardingV2Session,
  userId: string,
  userMessage: string,
): Promise<CorrectionResult> {
  const roundNumber = session.confirmation.correction_rounds + 1;

  // Hard limit
  if (roundNumber > CORRECTION_MAX_ROUNDS) {
    return escalate(
      "Would you like to move on for now and come back to editing your profile details later? You'll be able to make changes at any time from your dashboard.",
    );
  }

  // Detect restart intent
  if (userMessage.toLowerCase().includes("start over")) {
    return {
      correctionUnderstood: false,
      clarifyingQuestion: null,
      fieldsChanged: [],
      updatedExtraction: null,
      userConfirmationMessage: "",
      userSuppliedFields: [],
      shouldEscalate: false,
      escapeMessage: null,
      action: "restart",
    };
  }

  // Detect frustration
  const frustrated = [
    "completely wrong",
    "nothing looks right",
    "this is wrong",
    "terrible",
    "useless",
  ].some((s) => userMessage.toLowerCase().includes(s));
  if (frustrated) {
    await updateSession(userId, {
      confirmation: { ...session.confirmation, correction_rounds: roundNumber },
    });
    return {
      correctionUnderstood: false,
      clarifyingQuestion:
        "I'm sorry about that — let's fix it together. What would you like to start with?",
      fieldsChanged: [],
      updatedExtraction: null,
      userConfirmationMessage: "",
      userSuppliedFields: [],
      shouldEscalate: false,
      escapeMessage: null,
    };
  }

  // Fire LLM correction call
  const llmResult = await callCorrectionLLM(session, userMessage, roundNumber);

  // Track vague rounds
  if (!llmResult.correction_understood) {
    const vagueCount = countVagueRounds(session, roundNumber);
    if (vagueCount >= VAGUE_ROUNDS_BEFORE_ESCAPE) {
      return escalate(
        "No problem — let's move forward and you can make any adjustments as we go. Your profile isn't locked in at this stage.",
      );
    }
    await updateSession(userId, {
      confirmation: { ...session.confirmation, correction_rounds: roundNumber },
    });
    return {
      correctionUnderstood: false,
      clarifyingQuestion: llmResult.clarifying_question,
      fieldsChanged: [],
      updatedExtraction: null,
      userConfirmationMessage: "",
      userSuppliedFields: [],
      shouldEscalate: false,
      escapeMessage: null,
    };
  }

  // Apply correction
  await updateSession(userId, {
    dual_extraction: {
      ...session.dual_extraction,
      pure_extraction: llmResult.updated_extraction as ExtractionSchema | null,
    },
    confirmation: {
      ...session.confirmation,
      correction_rounds: roundNumber,
      user_supplied_overrides: [
        ...session.confirmation.user_supplied_overrides,
        ...llmResult.user_supplied_fields,
      ],
    },
  });

  return {
    correctionUnderstood: true,
    clarifyingQuestion: null,
    fieldsChanged: llmResult.fields_changed,
    updatedExtraction: llmResult.updated_extraction as ExtractionSchema | null,
    userConfirmationMessage: llmResult.user_confirmation_message,
    userSuppliedFields: llmResult.user_supplied_fields,
    shouldEscalate: false,
    escapeMessage: null,
  };
}

export async function confirmCorrectionComplete(
  userId: string,
  session: OnboardingV2Session,
): Promise<void> {
  await updateSession(userId, {
    confirmation: {
      ...session.confirmation,
      summary_confirmed: true,
      confirmed_role_family:
        session.confirmation.confirmed_role_family || session.inference.role_family,
      confirmed_industry: session.confirmation.confirmed_industry || session.inference.industry,
      confirmed_seniority: session.confirmation.confirmed_seniority || session.inference.seniority,
    },
    onboarding_status: "summary_confirmed",
  });
}

export async function acceptEscape(userId: string, session: OnboardingV2Session): Promise<void> {
  await updateSession(userId, {
    confirmation: {
      ...session.confirmation,
      summary_confirmed: true,
      correction_unresolved: true,
      confirmed_role_family:
        session.confirmation.confirmed_role_family || session.inference.role_family,
      confirmed_industry: session.confirmation.confirmed_industry || session.inference.industry,
      confirmed_seniority: session.confirmation.confirmed_seniority || session.inference.seniority,
    },
    onboarding_status: "summary_confirmed",
  });
}

async function callCorrectionLLM(
  session: OnboardingV2Session,
  message: string,
  round: number,
): Promise<LLMCorrectionOutput> {
  const result = await callLLM({
    systemPrompt: CORRECTION_INTERPRETATION_SYSTEM_PROMPT,
    userMessage: [
      `Current session extraction:\n${JSON.stringify(session.dual_extraction.pure_extraction, null, 2)}`,
      `\nCurrent inferred summary:\n${session.dual_extraction.inferred_summary || "N/A"}`,
      `\nUser's correction message:\n"${message}"`,
      `\nCorrection round: ${round}`,
    ].join("\n"),
    model: "smart",
    temperature: 0.1,
    maxTokens: 4096,
    stage: 5,
    callName: "correction_interpretation",
  });

  const parsed = safeParseLLMJson<LLMCorrectionOutput>(result.content, validateCorrectionOutput);
  if (parsed.success) return parsed.data;

  // Fallback: treat as not understood
  return {
    correction_understood: false,
    clarifying_question: "Could you be more specific about what needs to change?",
    fields_changed: [],
    updated_extraction: null,
    user_confirmation_message: "",
    user_supplied_fields: [],
  };
}

function validateCorrectionOutput(parsed: unknown): {
  valid: boolean;
  result: LLMCorrectionOutput | null;
  errors: string[];
} {
  if (!parsed || typeof parsed !== "object")
    return { valid: false, result: null, errors: ["Not an object"] };
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.correction_understood !== "boolean")
    return { valid: false, result: null, errors: ["Missing correction_understood"] };
  return { valid: true, result: parsed as LLMCorrectionOutput, errors: [] };
}

function countVagueRounds(session: OnboardingV2Session, currentRound: number): number {
  // Simple heuristic: if we're on round 2+ and correction_rounds shows no fields were ever changed
  // In practice, track this in session. For now, use round number as proxy.
  return session.confirmation.user_supplied_overrides.length === 0 ? currentRound : 0;
}

function escalate(message: string): CorrectionResult {
  return {
    correctionUnderstood: false,
    clarifyingQuestion: null,
    fieldsChanged: [],
    updatedExtraction: null,
    userConfirmationMessage: "",
    userSuppliedFields: [],
    shouldEscalate: true,
    escapeMessage: message,
  };
}
