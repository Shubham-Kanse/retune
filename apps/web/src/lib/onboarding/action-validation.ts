/**
 * Server-side validation of client-submitted actions against the current
 * planned question. Prevents clients from writing arbitrary profile fields
 * by forging pill identities or submitting stale question keys.
 */
import type { OnboardingQuestion, Pill } from "./types";

export interface TrustedPillAction {
  kind: "pill_click";
  questionKey: string;
  pill: Pill;
}

export interface TrustedMultiSelectAction {
  kind: "multi_select";
  questionKey: string;
  field: string;
  values: string[];
}

export interface TrustedSkillsUpdateAction {
  kind: "skills_update";
  skills: { technical: string[]; tools: string[]; business: string[] };
}

export type TrustedClientAction =
  | TrustedPillAction
  | TrustedMultiSelectAction
  | TrustedSkillsUpdateAction;

export interface ValidationErrorResult {
  valid: false;
  reason: string;
}

export interface ValidationOkResult {
  valid: true;
  action: TrustedClientAction;
}

type ValidationResult = ValidationOkResult | ValidationErrorResult;

/**
 * Stable identity of a pill: the fields that must match between client and
 * server. Display-only fields (recommended, selected, reason, label) are
 * intentionally excluded.
 */
function pillIdentity(p: Pill) {
  return `${p.action}|${p.field ?? ""}|${p.value}`;
}

export function resolveTrustedPillAction(input: {
  kind: "pill" | "pill_click";
  questionKey: string;
  pill?: Pill;
  action?: Pill["action"];
  field?: string;
  value?: string;
  currentQuestion: OnboardingQuestion | null;
}): ValidationResult {
  const { questionKey, currentQuestion } = input;

  if (!currentQuestion) {
    return { valid: false, reason: "No active question to validate pill against" };
  }

  // The question key must match the current question
  if (questionKey && questionKey !== currentQuestion.questionKey) {
    return { valid: false, reason: `Pill question key "${questionKey}" does not match current question "${currentQuestion.questionKey}"` };
  }

  // The pill must exist in the current question's pills by stable identity
  const candidate = input.pill ?? {
    label: "",
    action: input.action,
    field: input.field,
    value: input.value,
  } as Pill;
  const clientIdentity = pillIdentity(candidate);
  const serverPill = currentQuestion.pills.find((p) => pillIdentity(p) === clientIdentity);

  if (!serverPill) {
    return { valid: false, reason: `Pill "${candidate.value}" (action: ${candidate.action}, field: ${candidate.field ?? "none"}) is not a valid option for question "${currentQuestion.questionKey}"` };
  }

  // Return the server-authoritative pill (ignores client label/recommended/selected/reason)
  return {
    valid: true,
    action: {
      kind: "pill_click",
      questionKey: currentQuestion.questionKey,
      pill: serverPill,
    },
  };
}

export function resolveTrustedClientAction(input: {
  request: {
    kind: string;
    questionKey?: string;
    pill?: Pill;
    action?: Pill["action"];
    field?: string;
    value?: string;
    values?: string[];
    skills?: { technical: string[]; tools: string[]; business: string[] };
  };
  currentQuestion: OnboardingQuestion | null;
}): ValidationResult {
  const { request, currentQuestion } = input;
  if (request.kind === "pill" || request.kind === "pill_click") {
    return resolveTrustedPillAction({
      kind: "pill_click",
      questionKey: request.questionKey ?? "",
      pill: request.pill,
      action: request.action,
      field: request.field,
      value: request.value,
      currentQuestion,
    });
  }
  if (request.kind === "multi_select") {
    return resolveTrustedMultiSelectAction({
      questionKey: request.questionKey ?? "",
      field: request.field ?? "",
      values: request.values ?? [],
      currentQuestion,
    });
  }
  if (request.kind === "skills_update") {
    return resolveTrustedSkillsUpdateAction({
      questionKey: request.questionKey,
      skills: request.skills ?? { technical: [], tools: [], business: [] },
      currentQuestion,
    });
  }
  return { valid: false, reason: `Unsupported action kind: ${request.kind}` };
}

export function resolveTrustedMultiSelectAction(input: {
  questionKey: string;
  field: string;
  values: string[];
  currentQuestion: OnboardingQuestion | null;
}): ValidationResult {
  const { questionKey, field, values, currentQuestion } = input;

  if (!currentQuestion) {
    return { valid: false, reason: "No active question to validate multi_select against" };
  }

  if (questionKey && questionKey !== currentQuestion.questionKey) {
    return { valid: false, reason: `multi_select question key "${questionKey}" does not match current question "${currentQuestion.questionKey}"` };
  }

  if (field !== currentQuestion.field) {
    return { valid: false, reason: `multi_select field "${field}" does not match current question field "${currentQuestion.field}"` };
  }

  // Every submitted value must correspond to a pill with action "set_field" and matching field
  const allowedValues = new Set(
    currentQuestion.pills
      .filter((p) => p.action === "set_field" && (p.field === field || !p.field))
      .map((p) => p.value),
  );

  const invalidValues = values.filter((v) => !allowedValues.has(v));
  if (invalidValues.length > 0) {
    return { valid: false, reason: `Values not allowed for field "${field}": ${invalidValues.join(", ")}` };
  }

  return {
    valid: true,
    action: { kind: "multi_select", questionKey: currentQuestion.questionKey, field, values },
  };
}

export function resolveTrustedSkillsUpdateAction(input: {
  questionKey?: string;
  skills: { technical: string[]; tools: string[]; business: string[] };
  currentQuestion: OnboardingQuestion | null;
}): ValidationResult {
  const { skills, currentQuestion, questionKey } = input;

  const allowedKeys = new Set(["skills_confirm", "fill_skills"]);
  if (!currentQuestion || !allowedKeys.has(currentQuestion.questionKey)) {
    return { valid: false, reason: `skills_update is only allowed during skills_confirm or fill_skills questions` };
  }
  if (questionKey && questionKey !== currentQuestion.questionKey) {
    return { valid: false, reason: `skills_update question key "${questionKey}" does not match current question "${currentQuestion.questionKey}"` };
  }

  return {
    valid: true,
    action: { kind: "skills_update", skills },
  };
}
