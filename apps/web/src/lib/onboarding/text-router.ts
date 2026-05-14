/**
 * Free-text interpreter.
 *
 * Turns any user free-text reply into a structured RouterDecision so the
 * profile is never updated blindly. Single LLM call, JSON-only output via
 * a tool definition. Falls back to safe defaults if the call fails.
 *
 * Layer 2 of the SOTA onboarding pipeline:
 *   planner (deterministic)
 *   → router (THIS FILE — interprets free text)
 *   → writer (validates + applies patch)
 */
import OpenAI from "openai";

import type { OnboardingQuestion, StoredMessage, UserCareerProfile } from "./types";
import { buildProfileContext } from "./profile-context";

// ─── Public types ────────────────────────────────────────────────────────────

export type RouterField =
  | "identity.fullName"
  | "identity.email"
  | "identity.phone"
  | "identity.location"
  | "identity.linkedin"
  | "experience"
  | "education"
  | "skills"
  | "professionalProfile.professionalIdentities"
  | "professionalProfile.currentTitles"
  | "careerIntent.interestedRoles"
  | "careerIntent.preferredMarkets"
  | "careerIntent.workPreference"
  | "careerIntent.careerDirection"
  | "careerIntent.seniorityComfort"
  | "careerIntent.industriesOfInterest"
  | "resumeWritingPreferences.emphasisAreas"
  | "resumeWritingPreferences.deEmphasisAreas"
  | "resumeWritingPreferences.toneSignals";

export type RouterDecision =
  | {
      intent: "answer_current";
      field: RouterField;
      value: unknown;
      confidence: number;
      rationale: string;
    }
  | {
      intent: "edit_field";
      field: RouterField;
      value: unknown;
      confidence: number;
      rationale: string;
    }
  | { intent: "skip"; rationale: string }
  | { intent: "off_topic"; userQuestion: string; rationale: string }
  | { intent: "ambiguous"; clarification: string; rationale: string };

// ─── Tool schema ─────────────────────────────────────────────────────────────

const ROUTER_TOOL = {
  type: "function" as const,
  name: "route_input",
  description:
    "Classify the user's free-text reply against the current onboarding question and known profile. Return exactly one decision.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["intent", "rationale"],
    properties: {
      intent: {
        type: "string",
        enum: ["answer_current", "edit_field", "skip", "off_topic", "ambiguous"],
      },
      field: {
        type: "string",
        description:
          "Dotted profile path. Required for answer_current and edit_field. Must be one of the supported router fields.",
      },
      value: {
        description:
          "Structured value matching the field's schema. String for scalar fields. Array of strings for list fields. Object matching ExperienceEntry / EducationEntry for those.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "0–1. Required for answer_current and edit_field.",
      },
      userQuestion: {
        type: "string",
        description:
          "Required when intent === off_topic. The user's side question, paraphrased briefly.",
      },
      clarification: {
        type: "string",
        description:
          "Required when intent === ambiguous. A short clarifying question to ask the user.",
      },
      rationale: {
        type: "string",
        description: "One short sentence explaining the decision.",
      },
    },
  },
};

// ─── Field schema descriptions (for the LLM) ─────────────────────────────────

const FIELD_SCHEMAS: Record<RouterField, string> = {
  "identity.fullName": "string. Full name as written.",
  "identity.email": "string. Valid email address.",
  "identity.phone": "string. Phone number as written.",
  "identity.location": "string. City, country (or city, region, country).",
  "identity.linkedin": "string. URL or handle.",
  experience:
    'array of {title, company, startDate, endDate, isCurrent, responsibilities[], tools[]}. Use ONLY when user is appending or replacing the whole list.',
  education:
    "array of {degree, institution, fieldOfStudy?, graduationYear?, location?}.",
  skills:
    "object {technical: string[], tools: string[], business: string[]}. Each is a flat list of skill names.",
  "professionalProfile.professionalIdentities":
    'array of strings, e.g. ["Backend Engineer", "API Architect"].',
  "professionalProfile.currentTitles": "array of job-title strings.",
  "careerIntent.interestedRoles": "array of role-title strings.",
  "careerIntent.preferredMarkets":
    'array of region/country strings, e.g. ["UK", "EU Remote"].',
  "careerIntent.workPreference":
    'string enum: "remote" | "hybrid" | "onsite" | "open".',
  "careerIntent.careerDirection":
    'string enum: "same" | "slight_shift" | "major_switch" | "not_sure".',
  "careerIntent.seniorityComfort":
    'array of strings, e.g. ["Mid-level", "Senior IC", "Open"].',
  "careerIntent.industriesOfInterest":
    'array of industry strings, e.g. ["Fintech", "SaaS", "AI/ML"].',
  "resumeWritingPreferences.emphasisAreas":
    "array of skill or theme strings to emphasise on future resumes.",
  "resumeWritingPreferences.deEmphasisAreas":
    "array of themes future resumes should avoid over-highlighting.",
  "resumeWritingPreferences.toneSignals":
    "array of tone strings, e.g. Direct, Technical, Business-impact, Concise.",
};

// ─── Prompt assembly ─────────────────────────────────────────────────────────

const ROUTER_INSTRUCTIONS = `You interpret a user's free-text reply during onboarding and return ONE structured decision via the route_input tool.

Decision policy:
- "answer_current": the user is answering THE CURRENT QUESTION. Set field to the question's field, value to the structured value, confidence ≥ 0.7.
- "edit_field": the user is asking to change a field that ISN'T the current question (e.g. on identity confirm they say "actually my phone is +353…"). Set field to the field they meant.
- "skip": the user explicitly wants to skip ("skip", "next", "I don't want to answer").
- "off_topic": the user is asking a side question ("how does this work?", "can I delete my account?"). Set userQuestion to a short paraphrase.
- "ambiguous": the reply doesn't fit any of the above OR confidence would be < 0.7. Set clarification to a short follow-up question.

Hard rules:
- NEVER invent data. If the user says "yes" or "ok", that's "ambiguous" unless the question is yes/no.
- NEVER fabricate emails, names, locations, dates.
- For list fields: only include items the user actually mentioned.
- For experience/education: only emit a value if the user gave concrete title/company/degree/institution. Otherwise → "ambiguous".
- Output JSON only via the route_input tool. No prose.`;

function buildHistoryBlock(messages: StoredMessage[]): string {
  const last = messages.slice(-6);
  if (!last.length) return "[HISTORY] (none)";
  const lines = last.map((m) => `${m.role === "user" ? "USER" : "AI"}: ${m.content.replace(/\s+/g, " ").trim().slice(0, 240)}`);
  return `[HISTORY]\n${lines.join("\n")}`;
}

function buildAnsweredBlock(answeredKeys: string[], skippedKeys: string[]): string {
  const parts: string[] = [];
  if (answeredKeys.length) parts.push(`Answered: ${answeredKeys.join(", ")}`);
  if (skippedKeys.length) parts.push(`Skipped: ${skippedKeys.join(", ")}`);
  if (!parts.length) return "[PROGRESS] (nothing answered yet)";
  return `[PROGRESS]\n${parts.join("\n")}`;
}

function buildQuestionBlock(question: OnboardingQuestion | null): string {
  if (!question) return "[QUESTION] (no current question — onboarding may be complete)";
  const fieldKey = question.field as RouterField;
  const schema = FIELD_SCHEMAS[fieldKey] ?? "free text";
  return [
    "[QUESTION]",
    `phase: ${question.phase}`,
    `questionKey: ${question.questionKey}`,
    `field: ${question.field}`,
    `expectedSchema: ${schema}`,
    `prompt: ${question.prompt}`,
    question.whyAsked ? `whyAsked: ${question.whyAsked}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Public entry point ──────────────────────────────────────────────────────

export interface RouterInput {
  text: string;
  question: OnboardingQuestion | null;
  profile: UserCareerProfile;
  messages: StoredMessage[];
  answeredKeys: string[];
  skippedKeys: string[];
}

export async function routeFreeText(input: RouterInput): Promise<RouterDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return safeFallback(input);
  }

  try {
    const openai = new OpenAI({ apiKey });
    const profileBlock = buildProfileContext(input.profile, input.question?.phase ?? "resume_upload");
    const userBlock = `[USER REPLY]\n${input.text.slice(0, 1500)}`;

    const inputContent = [
      buildQuestionBlock(input.question),
      "",
      profileBlock,
      "",
      buildAnsweredBlock(input.answeredKeys, input.skippedKeys),
      "",
      buildHistoryBlock(input.messages),
      "",
      userBlock,
    ].join("\n");

    const response = await (openai.responses as any).create({
      model: process.env.ONBOARDING_ROUTER_MODEL ?? process.env.ONBOARDING_MODEL ?? "gpt-4o-mini",
      instructions: ROUTER_INSTRUCTIONS,
      input: [{ role: "user", content: inputContent }],
      tools: [ROUTER_TOOL],
      tool_choice: { type: "function", name: "route_input" },
      max_output_tokens: 400,
    });

    const toolCall = response.output?.find?.((o: any) => o.type === "function_call" && o.name === "route_input");
    if (!toolCall) return safeFallback(input);

    const parsed = JSON.parse(toolCall.arguments) as Partial<RouterDecision> & Record<string, unknown>;
    return normaliseDecision(parsed) ?? safeFallback(input);
  } catch (err) {
    console.error("[onboarding/text-router] LLM error:", err);
    return safeFallback(input);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseDecision(raw: Partial<RouterDecision> & Record<string, unknown>): RouterDecision | null {
  const intent = raw.intent;
  const rationale = typeof raw.rationale === "string" ? raw.rationale : "";

  if (intent === "answer_current" || intent === "edit_field") {
    const field = raw.field as RouterField | undefined;
    const value = raw.value;
    const confidence = typeof raw.confidence === "number" ? raw.confidence : 0;
    if (!field || !(field in FIELD_SCHEMAS)) return null;
    if (value === undefined || value === null) return null;
    if (confidence < 0.5) {
      return {
        intent: "ambiguous",
        clarification:
          typeof raw.clarification === "string" && raw.clarification.length > 0
            ? raw.clarification
            : "Could you rephrase that?",
        rationale,
      };
    }
    return { intent, field, value, confidence, rationale };
  }

  if (intent === "skip") {
    return { intent, rationale };
  }

  if (intent === "off_topic") {
    return {
      intent,
      userQuestion: typeof raw.userQuestion === "string" ? raw.userQuestion : "(unspecified)",
      rationale,
    };
  }

  if (intent === "ambiguous") {
    return {
      intent,
      clarification: typeof raw.clarification === "string" ? raw.clarification : "Could you rephrase that?",
      rationale,
    };
  }

  return null;
}

function safeFallback(input: RouterInput): RouterDecision {
  return {
    intent: "ambiguous",
    clarification: input.question
      ? `I want to make sure I capture this right — could you rephrase your answer to "${input.question.questionKey}"?`
      : "Could you rephrase that?",
    rationale: "router_unavailable_or_failed",
  };
}
