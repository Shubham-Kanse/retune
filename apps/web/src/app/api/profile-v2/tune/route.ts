// POST /api/profile-v2/tune
//
// Conversational profile-tuning endpoint. Routes the user's natural-language
// request to an LLM that returns a structured patch, applies it to the
// appropriate v2 table, and returns a confirmation message.
//
// Body: { section: "voice"|"preferences"|"positioning"|"experience"|"skills", message: string }

import { callLLM } from "@/lib/onboarding-v2/llm/calls";
import { safeParseLLMJson } from "@/lib/onboarding-v2/llm/guardrails";
import { sanitizeUserInput } from "@/lib/onboarding-v2/validation";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

async function getAuthUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const SECTION_PROMPTS: Record<string, string> = {
  voice: `You are an assistant tuning the user's resume voice profile. They have a stored set of preferences (tone, aversions, voice sample). Read their natural-language message, decide which voice fields to adjust, and return a JSON patch.

OUTPUT FORMAT:
{ "understood": boolean, "clarifying_question": string|null, "patch": { "natural_voice_sample"?: string, "tone_preferences"?: string[], "tone_aversions"?: string[] }, "confirmation_message": string }

Rules:
- Return valid JSON only. No preamble.
- If unclear, set understood: false and ask one focused clarifying_question.
- Only include fields the user actually changed in patch.
- confirmation_message should be a single warm sentence describing what changed.`,

  preferences: `You are tuning the user's resume generation preferences. They've previously set a target role, frame, highlights, and de-emphasis. Read their message, decide which preference fields to adjust, and return a JSON patch.

OUTPUT FORMAT:
{ "understood": boolean, "clarifying_question": string|null, "patch": { "target_role"?: string, "target_role_specificity"?: string, "resume_frame"?: string, "underrepresented_skills"?: string[], "deemphasis_preferences"?: string[], "career_transition_framing"?: string, "gap_handling"?: string }, "confirmation_message": string }

Rules:
- Return valid JSON only. No preamble.
- If unclear, set understood: false and ask one focused clarifying_question.
- Only include fields the user actually changed in patch.`,

  positioning: `You are tuning the user's resume positioning (target_role + resume_frame). Read their message and return a JSON patch.

OUTPUT FORMAT:
{ "understood": boolean, "clarifying_question": string|null, "patch": { "target_role"?: string, "resume_frame"?: string, "confirmed_role_family"?: string, "confirmed_seniority"?: string }, "confirmation_message": string }

Rules:
- Return valid JSON only. No preamble.
- Only include fields the user actually changed.`,

  skills: `You are tuning the user's skills list. Read their message ("add Rust", "remove jQuery", "I'm strong in TypeScript") and return a JSON patch.

OUTPUT FORMAT:
{ "understood": boolean, "clarifying_question": string|null, "patch": { "add"?: string[], "remove"?: string[] }, "confirmation_message": string }

Rules:
- Return valid JSON only. No preamble.`,
};

export async function POST(req: Request) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const section = body.section as string;
  const message = sanitizeUserInput(body.message ?? "");
  if (!section || !message) {
    return NextResponse.json({ error: "missing_section_or_message" }, { status: 400 });
  }

  const systemPrompt = SECTION_PROMPTS[section];
  if (!systemPrompt) {
    return NextResponse.json({ error: "invalid_section" }, { status: 400 });
  }

  // Pre-load context the LLM needs
  const context = await loadContext(userId, section);

  let llmResult: { content: string };
  try {
    llmResult = await callLLM({
      systemPrompt,
      userMessage: `Current ${section} state:\n${JSON.stringify(context, null, 2)}\n\nUser message:\n"${message}"`,
      model: "smart",
      temperature: 0.1,
      maxTokens: 1024,
      stage: 0,
      callName: `profile_tune_${section}`,
    });
  } catch {
    return NextResponse.json(
      { error: "llm_failed", message: "I'm having trouble interpreting that — try again?" },
      { status: 500 },
    );
  }

  const parsed = safeParseLLMJson<{
    understood: boolean;
    clarifying_question: string | null;
    patch: Record<string, unknown>;
    confirmation_message: string;
  }>(llmResult.content, (p) => ({
    valid: !!p && typeof p === "object" && typeof (p as { understood?: unknown }).understood === "boolean",
    result: p as {
      understood: boolean;
      clarifying_question: string | null;
      patch: Record<string, unknown>;
      confirmation_message: string;
    },
    errors: [],
  }));

  if (!parsed.success) {
    return NextResponse.json({
      understood: false,
      clarifying_question: "Could you put it differently? I had trouble parsing that.",
    });
  }

  if (!parsed.data.understood) {
    return NextResponse.json({
      understood: false,
      clarifying_question: parsed.data.clarifying_question ?? "Could you be more specific?",
    });
  }

  // Apply the patch
  await applyPatch(userId, section, parsed.data.patch);

  return NextResponse.json({
    understood: true,
    confirmationMessage: parsed.data.confirmation_message,
    patch: parsed.data.patch,
  });
}

async function loadContext(userId: string, section: string): Promise<unknown> {
  const supabase = await createClient();
  switch (section) {
    case "voice": {
      const { data } = await supabase
        .from("user_voice_profiles_v2")
        .select("natural_voice_sample, tone_preferences, tone_aversions, tone_calibration_summary")
        .eq("user_id", userId)
        .single();
      return data;
    }
    case "preferences":
    case "positioning": {
      const { data } = await supabase
        .from("user_profiles_v2")
        .select(
          "target_role, target_role_specificity, resume_frame, underrepresented_skills, deemphasis_preferences, career_transition_framing, gap_handling, confirmed_role_family, confirmed_seniority",
        )
        .eq("user_id", userId)
        .single();
      return data;
    }
    case "skills": {
      const { data } = await supabase
        .from("user_skills_v2")
        .select("raw_list")
        .eq("user_id", userId)
        .single();
      return data;
    }
    default:
      return null;
  }
}

async function applyPatch(
  userId: string,
  section: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = await createClient();
  switch (section) {
    case "voice": {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.natural_voice_sample) update.natural_voice_sample = patch.natural_voice_sample;
      if (patch.tone_preferences) update.tone_preferences = patch.tone_preferences;
      if (patch.tone_aversions) update.tone_aversions = patch.tone_aversions;
      await supabase
        .from("user_voice_profiles_v2")
        .update(update)
        .eq("user_id", userId);
      break;
    }
    case "preferences":
    case "positioning": {
      const allowed = [
        "target_role",
        "target_role_specificity",
        "resume_frame",
        "underrepresented_skills",
        "deemphasis_preferences",
        "career_transition_framing",
        "gap_handling",
        "confirmed_role_family",
        "confirmed_seniority",
      ];
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowed) if (patch[k] !== undefined) update[k] = patch[k];
      await supabase.from("user_profiles_v2").update(update).eq("user_id", userId);
      break;
    }
    case "skills": {
      const { data: current } = await supabase
        .from("user_skills_v2")
        .select("raw_list")
        .eq("user_id", userId)
        .single();
      const next = new Set<string>((current?.raw_list as string[]) ?? []);
      for (const s of (patch.add as string[]) ?? []) next.add(s);
      for (const s of (patch.remove as string[]) ?? []) next.delete(s);
      await supabase
        .from("user_skills_v2")
        .upsert(
          {
            user_id: userId,
            raw_list: Array.from(next),
            source: "user_supplied",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      break;
    }
  }
}
