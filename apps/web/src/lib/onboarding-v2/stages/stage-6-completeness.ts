// Onboarding V2 — Stage 6: Completeness Assessment & Path Branching

import { callLLM } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import { COMPLETENESS_ASSESSMENT_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { CompletenessPath, OnboardingV2Session } from "../types";

export interface CompletenessResult {
  completeness_score: number;
  missing_critical_fields: string[];
  completeness_path: CompletenessPath;
  resume_stale: boolean;
  employment_gaps_present: boolean;
  has_quantified_achievements: boolean;
  special_handling_notes: string;
}

export interface ActiveQuestions {
  target_role: boolean;
  target_role_specificity: boolean;
  underrepresented_skills: boolean;
  deemphasis_preferences: boolean;
  resume_frame: boolean;
  career_transition_framing: boolean;
  gap_handling: boolean;
  achievement_depth: boolean;
}

export async function runCompletenessAssessment(
  session: OnboardingV2Session,
): Promise<CompletenessResult> {
  try {
    const result = await callLLM({
      systemPrompt: COMPLETENESS_ASSESSMENT_SYSTEM_PROMPT,
      userMessage: [
        `Confirmed extraction:\n${JSON.stringify(session.dual_extraction.pure_extraction, null, 2)}`,
        `Confirmed role family: ${session.confirmation.confirmed_role_family}`,
        `Confirmed seniority: ${session.confirmation.confirmed_seniority}`,
        `Flags: new_grad=${session.inference.new_grad}, career_transition_detected=${session.inference.career_transition_detected}, work_pattern=${session.inference.work_pattern}`,
      ].join("\n"),
      model: "smart",
      temperature: 0,
      maxTokens: 1024,
      stage: 6,
      callName: "completeness_assessment",
    });

    const parsed = safeParseLLMJson<CompletenessResult>(result.content, validateCompleteness);
    if (parsed.success) return parsed.data;
  } catch {
    /* fall through to default */
  }

  // Default fallback
  return {
    completeness_score: 60,
    missing_critical_fields: [],
    completeness_path: "standard",
    resume_stale: false,
    employment_gaps_present: false,
    has_quantified_achievements: false,
    special_handling_notes: "",
  };
}

export function determineActiveQuestions(
  session: OnboardingV2Session,
  completeness: CompletenessResult,
): ActiveQuestions {
  return {
    target_role: true,
    target_role_specificity: false, // activated dynamically after Q1 if low specificity
    underrepresented_skills: true,
    deemphasis_preferences: true,
    resume_frame: true,
    career_transition_framing: session.inference.career_transition_detected,
    gap_handling: completeness.employment_gaps_present,
    achievement_depth: !completeness.has_quantified_achievements,
  };
}

export async function applyCompleteness(
  userId: string,
  _session: OnboardingV2Session,
  result: CompletenessResult,
): Promise<void> {
  await updateSession(userId, {
    completeness: {
      completeness_score: result.completeness_score,
      completeness_path: result.completeness_path,
      missing_critical_fields: result.missing_critical_fields,
      has_quantified_achievements: result.has_quantified_achievements,
      resume_stale: result.resume_stale,
      employment_gaps_present: result.employment_gaps_present,
    },
    onboarding_status: "path_branched",
  });
}

function validateCompleteness(parsed: unknown): {
  valid: boolean;
  result: CompletenessResult | null;
  errors: string[];
} {
  if (!parsed || typeof parsed !== "object")
    return { valid: false, result: null, errors: ["Not an object"] };
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.completeness_score !== "number")
    return { valid: false, result: null, errors: ["Missing completeness_score"] };
  if (
    !["standard", "new_grad", "career_changer", "contractor", "returning"].includes(
      obj.completeness_path as string,
    )
  ) {
    return { valid: false, result: null, errors: ["Invalid completeness_path"] };
  }
  return { valid: true, result: parsed as CompletenessResult, errors: [] };
}
