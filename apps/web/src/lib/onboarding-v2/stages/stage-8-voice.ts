// Onboarding V2 — Stage 8: Voice & Tone Extraction

import { VOICE_SAMPLE_MIN_WORDS } from "../constants";
import { callLLM } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import { VOICE_EXTRACTION_SYSTEM_PROMPT } from "../llm/prompts";
import { updateSession } from "../session";
import type { Confidence, OnboardingV2Session, VoiceProfile } from "../types";

export interface VoiceQuestionPresentation {
  field: "natural_voice_sample" | "tone_preferences" | "tone_aversions";
  prompt: string;
  chips: Array<{ label: string; value: string }> | null;
  freeTextAllowed: boolean;
  multiSelect: boolean;
}

interface VoiceExtractionLLMResult {
  sentence_structure?: string | null;
  vocabulary_register?: string | null;
  leading_pattern?: VoiceProfile["leading_pattern"];
  phrases_to_use?: string[];
  phrases_to_avoid?: string[];
  tone_calibration_summary?: string | null;
  confidence?: Confidence | null;
}

export function getNextVoiceQuestion(
  session: OnboardingV2Session,
): VoiceQuestionPresentation | null {
  if (!session.voice_profile.natural_voice_sample) return buildVoiceQ1();
  if (
    !Array.isArray(session.voice_profile.tone_preferences) ||
    session.voice_profile.tone_preferences.length === 0
  ) {
    if (
      session.voice_profile.tone_preferences !== "open" &&
      session.voice_profile.tone_preferences !== "context_dependent"
    )
      return buildVoiceQ2();
  }
  if (
    session.voice_profile.tone_aversions.length === 0 &&
    session.voice_profile.voice_profile_source !== "collected"
  )
    return buildVoiceQ3();
  return null;
}

function buildVoiceQ1(): VoiceQuestionPresentation {
  return {
    field: "natural_voice_sample",
    prompt:
      "In your own words — how would you describe what you do professionally to someone who works in tech but doesn't know your specific area?",
    chips: null,
    freeTextAllowed: true,
    multiSelect: false,
  };
}

function buildVoiceQ2(): VoiceQuestionPresentation {
  return {
    field: "tone_preferences",
    prompt:
      "How would you describe the tone you want your resume to have? Pick as many as feel right.",
    chips: [
      { label: "Direct and confident", value: "direct_confident" },
      { label: "Technical and precise", value: "technical_precise" },
      { label: "Warm and collaborative", value: "warm_collaborative" },
      { label: "Leadership-focused", value: "leadership_focused" },
      { label: "Results-driven", value: "results_driven" },
      { label: "Understated", value: "understated" },
      { label: "Bold", value: "bold" },
      { label: "Conversational", value: "conversational" },
    ],
    freeTextAllowed: true,
    multiSelect: true,
  };
}

function buildVoiceQ3(): VoiceQuestionPresentation {
  return {
    field: "tone_aversions",
    prompt:
      "Is there anything you'd never want your resume to sound like? Things that feel off-brand for you?",
    chips: [
      { label: "Corporate buzzwords", value: "corporate_buzzwords" },
      { label: "Overly humble", value: "overly_humble" },
      { label: "Overly boastful", value: "overly_boastful" },
      { label: "Jargon-heavy", value: "jargon_heavy" },
      { label: "Vague or fluffy", value: "vague_fluffy" },
      { label: "Too casual", value: "too_casual" },
      { label: "First-person (I/we)", value: "first_person" },
      { label: "Nothing — I'm open", value: "none" },
    ],
    freeTextAllowed: true,
    multiSelect: true,
  };
}

export async function processVoiceAnswer(
  session: OnboardingV2Session,
  userId: string,
  field: string,
  answer: string | string[],
): Promise<{
  accepted: boolean;
  followUp?: string;
  stageComplete: boolean;
  nextQuestion: VoiceQuestionPresentation | null;
}> {
  switch (field) {
    case "natural_voice_sample": {
      const text = answer as string;
      const wordCount = text.split(/\s+/).length;
      if (wordCount < VOICE_SAMPLE_MIN_WORDS) {
        return {
          accepted: false,
          followUp:
            "That's okay — imagine you're at a tech meetup and someone asks what you do. What's the version you'd tell them?",
          stageComplete: false,
          nextQuestion: null,
        };
      }
      const style = detectStyle(text);
      await updateSession(userId, {
        voice_profile: {
          ...session.voice_profile,
          natural_voice_sample: text,
          self_description_style: style,
        },
      });
      break;
    }
    case "tone_preferences": {
      const values = Array.isArray(answer) ? answer : [answer];
      const stored = values.length >= 8 ? "open" : values;
      await updateSession(userId, {
        voice_profile: { ...session.voice_profile, tone_preferences: stored },
      });
      break;
    }
    case "tone_aversions": {
      const values = Array.isArray(answer) ? answer : [answer];
      const aversions = values.includes("none") ? [] : values;
      const hasAiAversion =
        typeof answer === "string" &&
        (answer.toLowerCase().includes("ai") || answer.toLowerCase().includes("artificial"));
      await updateSession(userId, {
        voice_profile: {
          ...session.voice_profile,
          tone_aversions: aversions,
          aversion_to_ai_language: hasAiAversion,
          voice_profile_source: "collected",
        },
      });
      break;
    }
  }

  // Check if all voice questions answered → run extraction
  const updated = (await import("../session")).loadSession(userId);
  const updatedSession = await updated;
  if (!updatedSession) return { accepted: true, stageComplete: false, nextQuestion: null };

  const next = getNextVoiceQuestion(updatedSession);
  if (!next) {
    await runVoiceExtraction(updatedSession, userId);
    return { accepted: true, stageComplete: true, nextQuestion: null };
  }
  return { accepted: true, stageComplete: false, nextQuestion: next };
}

async function runVoiceExtraction(session: OnboardingV2Session, userId: string): Promise<void> {
  try {
    const result = await callLLM({
      systemPrompt: VOICE_EXTRACTION_SYSTEM_PROMPT,
      userMessage: `Natural voice sample: ${session.voice_profile.natural_voice_sample || "Not provided"}\nTone preferences: ${JSON.stringify(session.voice_profile.tone_preferences)}\nTone aversions: ${JSON.stringify(session.voice_profile.tone_aversions)}\nSelf-description style: ${session.voice_profile.self_description_style || "unknown"}\nRole family and seniority: ${session.confirmation.confirmed_role_family}, ${session.confirmation.confirmed_seniority}`,
      model: "fast",
      temperature: 0.1,
      maxTokens: 1024,
      stage: 8,
      callName: "voice_extraction",
    });

    const parsed = safeParseLLMJson<VoiceExtractionLLMResult>(result.content, (p) => {
      if (!p || typeof p !== "object")
        return { valid: false, result: null, errors: ["Not an object"] };
      return { valid: true, result: p as VoiceExtractionLLMResult, errors: [] };
    });
    if (parsed.success) {
      await updateSession(userId, {
        voice_profile: {
          ...session.voice_profile,
          sentence_structure: parsed.data.sentence_structure,
          vocabulary_register: parsed.data.vocabulary_register,
          leading_pattern: parsed.data.leading_pattern,
          phrases_to_use: parsed.data.phrases_to_use || [],
          phrases_to_avoid: [
            ...(session.voice_profile.phrases_to_avoid || []),
            ...(parsed.data.phrases_to_avoid || []),
          ],
          tone_calibration_summary: parsed.data.tone_calibration_summary,
          voice_profile_confidence: parsed.data.confidence ?? "medium",
        },
        onboarding_status: "voice_extraction_complete",
      });
      return;
    }
  } catch {
    /* fallthrough */
  }

  // Fallback: store raw, mark as raw_only
  await updateSession(userId, {
    voice_profile: { ...session.voice_profile, voice_profile_confidence: "low" },
    onboarding_status: "voice_extraction_complete",
  });
}

function detectStyle(text: string): "formal" | "conversational" | "structured/terse" {
  const hasContractions = /\b(I'm|don't|can't|won't|it's|that's|I've)\b/.test(text);
  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const avgLen =
    sentences.reduce((s, sent) => s + sent.split(/\s+/).length, 0) / (sentences.length || 1);
  if (/^[-•*]/m.test(text) || avgLen < 8) return "structured/terse";
  if (hasContractions && avgLen < 20) return "conversational";
  return "formal";
}
