// Onboarding V2 — Stage 3: Industry & Role Inference

import { INFERENCE_MAX_RETRIES } from "../constants";
import { callLLMWithRetry } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import { INFERENCE_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { InferenceResult, OnboardingV2Session } from "../types";

export async function runInference(session: OnboardingV2Session): Promise<InferenceResult | null> {
  const extraction = session.dual_extraction.pure_extraction;
  const summary = session.dual_extraction.inferred_summary;

  if (!extraction) return null;

  try {
    const result = await callLLMWithRetry(
      {
        systemPrompt: INFERENCE_SYSTEM_PROMPT,
        userMessage: `Structured extraction:\n${JSON.stringify(extraction, null, 2)}\n\nProfessional narrative:\n${summary || "Not available"}`,
        model: "smart",
        temperature: 0.1,
        maxTokens: 2048,
        stage: 3,
        callName: "inference",
      },
      INFERENCE_MAX_RETRIES,
    );

    const parsed = safeParseLLMJson<InferenceResult>(result.content, validateInference);
    if (parsed.success) return parsed.data;
    return null;
  } catch {
    return null;
  }
}

export async function applyInference(
  userId: string,
  result: InferenceResult | null,
): Promise<void> {
  if (result) {
    await updateSession(userId, {
      inference: result,
      onboarding_status: "inference_complete",
    });
  } else {
    await updateSession(userId, {
      inference: { inference_status: "failed" },
      onboarding_status: "inference_complete",
    });
  }
}

export function generateRoleChips(roleFamily: string | null): string[] {
  const chipMap: Record<string, string[]> = {
    "Backend Engineering": [
      "Backend Engineer",
      "Senior Backend Engineer",
      "Staff Backend Engineer",
      "Platform Engineer",
      "API Engineer",
    ],
    "Frontend Engineering": [
      "Frontend Engineer",
      "Senior Frontend Engineer",
      "UI Engineer",
      "Design Engineer",
    ],
    "Fullstack Engineering": [
      "Fullstack Engineer",
      "Senior Fullstack Engineer",
      "Software Engineer",
      "Product Engineer",
    ],
    "ML Engineering": ["ML Engineer", "Senior ML Engineer", "AI Engineer", "Research Engineer"],
    "Data Engineering": [
      "Data Engineer",
      "Senior Data Engineer",
      "Analytics Engineer",
      "Data Platform Engineer",
    ],
    "DevOps/SRE": ["DevOps Engineer", "SRE", "Platform Engineer", "Infrastructure Engineer"],
    "Mobile Engineering": [
      "iOS Engineer",
      "Android Engineer",
      "Mobile Engineer",
      "React Native Engineer",
    ],
    "Platform/Infrastructure Engineering": [
      "Platform Engineer",
      "Infrastructure Engineer",
      "Cloud Engineer",
      "Systems Engineer",
    ],
    "Security Engineering": ["Security Engineer", "AppSec Engineer", "Security Architect"],
    "Engineering Management": [
      "Engineering Manager",
      "Tech Lead",
      "VP Engineering",
      "Director of Engineering",
    ],
    "Technical Product Management": ["Technical PM", "Product Manager", "Senior PM"],
    "Developer Relations": ["Developer Advocate", "DevRel Engineer", "Technical Writer"],
    "QA/Testing Engineering": ["QA Engineer", "SDET", "Test Automation Engineer"],
  };
  const chips = chipMap[roleFamily || ""] || ["Software Engineer", "Senior Software Engineer"];
  return [...chips, "Something else — I'll type it"];
}

function validateInference(parsed: unknown): {
  valid: boolean;
  result: InferenceResult | null;
  errors: string[];
} {
  if (!parsed || typeof parsed !== "object")
    return { valid: false, result: null, errors: ["Not an object"] };
  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];

  if (!obj.industry || typeof obj.industry !== "string") errors.push("Missing industry");
  if (!obj.role_family || typeof obj.role_family !== "string") errors.push("Missing role_family");
  if (!obj.seniority || typeof obj.seniority !== "string") errors.push("Missing seniority");
  if (!["high", "medium", "low"].includes(obj.industry_confidence as string))
    errors.push("Invalid industry_confidence");
  if (!["high", "medium", "low"].includes(obj.role_family_confidence as string))
    errors.push("Invalid role_family_confidence");
  if (!["high", "medium", "low"].includes(obj.seniority_confidence as string))
    errors.push("Invalid seniority_confidence");

  if (errors.length > 0) return { valid: false, result: null, errors };
  return { valid: true, result: parsed as InferenceResult, errors: [] };
}
