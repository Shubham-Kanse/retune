// PATCH /api/profile-v2
//
// Single endpoint for editing the v2 profile from the career profile page.
// Body shape: { section: "voice" | "preferences" | "skills" | "experience" | "education", payload: ... }
//
// For voice edits we re-run the voice-extraction LLM call so the
// tone_calibration_summary is updated.

import { trackOnboardingEvent } from "@/lib/onboarding-v2/analytics";
import { callLLM } from "@/lib/onboarding-v2/llm/calls";
import { safeParseLLMJson } from "@/lib/onboarding-v2/llm/guardrails";
import { VOICE_EXTRACTION_SYSTEM_PROMPT } from "@/lib/onboarding-v2/llm/prompts";
import type { ExtractionEducation, ExtractionExperience } from "@/lib/onboarding-v2/types";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const REGEN_TRIGGER_FIELDS = new Set([
  "target_role",
  "resume_frame",
  "confirmed_role_family",
  "confirmed_seniority",
  "confirmed_industry",
]);

export async function PATCH(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const section = body.section as string;
  const payload = body.payload;
  const supabase = await createClient();

  switch (section) {
    case "voice": {
      const voicePayload = payload as {
        natural_voice_sample: string;
        tone_preferences: string[];
        tone_aversions: string[];
      };
      const voice = await runVoiceExtraction(voicePayload, userId);
      await supabase.from("user_voice_profiles_v2").upsert(
        {
          user_id: userId,
          natural_voice_sample: voicePayload.natural_voice_sample,
          tone_preferences: voicePayload.tone_preferences,
          tone_aversions: voicePayload.tone_aversions,
          ...voice,
          voice_profile_source: "collected",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      return NextResponse.json({ success: true, voice });
    }

    case "preferences": {
      const prefs = payload as Record<string, unknown>;
      const update: Record<string, unknown> = {};
      const fields = [
        "target_role",
        "target_role_specificity",
        "resume_frame",
        "underrepresented_skills",
        "deemphasis_preferences",
        "career_transition_framing",
        "gap_handling",
        "achievement_depth",
      ];
      for (const f of fields) if (prefs[f] !== undefined) update[f] = prefs[f];
      update.updated_at = new Date().toISOString();
      await supabase.from("user_profiles_v2").update(update).eq("user_id", userId);

      // Trigger understanding regeneration if a regen-trigger field changed
      const triggered = Object.keys(update).some((k) => REGEN_TRIGGER_FIELDS.has(k));
      if (triggered) {
        regenerateUnderstanding(userId).catch(() => {});
      }
      return NextResponse.json({ success: true, regenerationQueued: triggered });
    }

    case "skills": {
      const skills = payload as { raw_list: string[]; grouped?: Record<string, string[]> };
      await supabase.from("user_skills_v2").upsert(
        {
          user_id: userId,
          raw_list: skills.raw_list,
          grouped: skills.grouped ?? {},
          source: "user_supplied",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      regenerateUnderstanding(userId).catch(() => {});
      return NextResponse.json({ success: true });
    }

    case "experience": {
      const { entry, index } = payload as { entry: ExtractionExperience; index?: number };
      const entries = await loadExperience(userId);
      if (typeof index === "number" && entries[index]) {
        entries[index] = entry;
      } else {
        entries.push(entry);
      }
      await replaceExperience(userId, entries);
      regenerateUnderstanding(userId).catch(() => {});
      return NextResponse.json({ success: true });
    }

    case "education": {
      const { entry, index } = payload as { entry: ExtractionEducation; index?: number };
      const entries = await loadEducation(userId);
      if (typeof index === "number" && entries[index]) {
        entries[index] = entry;
      } else {
        entries.push(entry);
      }
      await replaceEducation(userId, entries);
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "invalid_section" }, { status: 400 });
  }
}

async function loadExperience(userId: string): Promise<ExtractionExperience[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_experience_v2")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  return (data as ExtractionExperience[]) ?? [];
}

async function replaceExperience(userId: string, entries: ExtractionExperience[]) {
  const supabase = await createClient();
  await supabase.from("user_experience_v2").delete().eq("user_id", userId);
  if (entries.length === 0) return;
  await supabase.from("user_experience_v2").insert(
    entries.map((e, i) => ({
      user_id: userId,
      sort_order: i,
      title: e.title,
      company: e.company,
      location: e.location,
      start_date: e.start_date,
      end_date: e.end_date,
      is_current: e.is_current,
      bullets: e.bullets ?? [],
      source: "user_supplied",
    })),
  );
}

async function loadEducation(userId: string): Promise<ExtractionEducation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_education_v2")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order");
  return (data as ExtractionEducation[]) ?? [];
}

async function replaceEducation(userId: string, entries: ExtractionEducation[]) {
  const supabase = await createClient();
  await supabase.from("user_education_v2").delete().eq("user_id", userId);
  if (entries.length === 0) return;
  await supabase.from("user_education_v2").insert(
    entries.map((e, i) => ({
      user_id: userId,
      sort_order: i,
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      start_date: e.start_date,
      end_date: e.end_date,
      gpa: e.gpa,
      honours: e.honours,
      source: "user_supplied",
    })),
  );
}

async function runVoiceExtraction(
  payload: { natural_voice_sample: string; tone_preferences: string[]; tone_aversions: string[] },
  userId: string,
): Promise<Record<string, unknown>> {
  try {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from("user_profiles_v2")
      .select("confirmed_role_family, confirmed_seniority")
      .eq("user_id", userId)
      .single();

    const result = await callLLM({
      systemPrompt: VOICE_EXTRACTION_SYSTEM_PROMPT,
      userMessage: `Natural voice sample: ${payload.natural_voice_sample}\nTone preferences: ${JSON.stringify(payload.tone_preferences)}\nTone aversions: ${JSON.stringify(payload.tone_aversions)}\nRole family and seniority: ${profile?.confirmed_role_family || "unknown"}, ${profile?.confirmed_seniority || "unknown"}`,
      model: "fast",
      temperature: 0.1,
      maxTokens: 1024,
      stage: 8,
      callName: "voice_extraction_edit",
    });
    const parsed = safeParseLLMJson<Record<string, unknown>>(result.content, (p) => ({
      valid: !!p && typeof p === "object",
      result: p as Record<string, unknown>,
      errors: [],
    }));
    if (parsed.success) {
      return {
        sentence_structure: parsed.data.sentence_structure,
        vocabulary_register: parsed.data.vocabulary_register,
        leading_pattern: parsed.data.leading_pattern,
        phrases_to_use: parsed.data.phrases_to_use ?? [],
        phrases_to_avoid: parsed.data.phrases_to_avoid ?? [],
        tone_calibration_summary: parsed.data.tone_calibration_summary,
        voice_profile_confidence: parsed.data.confidence ?? "medium",
      };
    }
  } catch {
    /* fallthrough */
  }
  return { voice_profile_confidence: "low" };
}

async function regenerateUnderstanding(userId: string): Promise<void> {
  // Defer to the existing onboarding stage-9 helper which handles the LLM
  // call and DB write. We run it best-effort — the page caller does not
  // wait on it and will simply see an updated document next refresh.
  try {
    const { generateUnderstandingDocument } = await import(
      "@/lib/onboarding-v2/stages/stage-9-audit"
    );
    const { loadSession } = await import("@/lib/onboarding-v2/session");
    const session = await loadSession(userId);
    if (session) await generateUnderstandingDocument(session);
    trackOnboardingEvent({
      event: "onboarding_v2_committed",
      properties: {
        qualityScore: session?.audit.profile_quality_score ?? 0,
        completenessPath: session?.completeness.completeness_path ?? "standard",
        totalLLMCalls: 0,
        totalCostUsd: 0,
        durationMs: 0,
      },
    });
  } catch {
    /* swallow — best effort */
  }
}
