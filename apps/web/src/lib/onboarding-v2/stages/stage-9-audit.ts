// Onboarding V2 — Stage 9: Confidence Audit & Profile Commit

import { createClient } from "@/lib/supabase/server";
import { COMMIT_MAX_RETRIES } from "../constants";
import { CommitError } from "../errors";
import { callLLM, getSessionStats } from "../llm/calls";
import { safeParseLLMJson } from "../llm/guardrails";
import {
  CONFIDENCE_AUDIT_SYSTEM_PROMPT,
  INFERRED_SUMMARY_SYSTEM_PROMPT,
  UNDERSTANDING_GENERATION_SYSTEM_PROMPT,
} from "../llm/prompts";
import { updateSession } from "../session";
import type { OnboardingV2Session } from "../types";

export interface AuditResult {
  critical_gaps: Array<{ field: string; reason: string; simplified_question: string }>;
  important_gaps: Array<{
    field: string;
    current_value: string;
    confidence: string;
    clarification_question: string;
  }>;
  contradictions: Array<{
    field: string;
    extracted_value: string;
    user_stated_value: string;
    resolution_question: string;
  }>;
  user_supplied_overrides: string[];
  regenerate_inferred_summary: boolean;
  profile_quality_score: number;
  profile_quality_note: string;
  ready_to_commit: boolean;
}

export async function runConfidenceAudit(session: OnboardingV2Session): Promise<AuditResult> {
  // Deterministic critical check first
  const criticalMissing = checkCriticalFields(session);

  try {
    const result = await callLLM({
      systemPrompt: CONFIDENCE_AUDIT_SYSTEM_PROMPT,
      userMessage: `Complete session:\n${JSON.stringify(session, null, 2)}`,
      model: "smart",
      temperature: 0,
      maxTokens: 2048,
      stage: 9,
      callName: "confidence_audit",
    });

    const parsed = safeParseLLMJson<AuditResult>(result.content, (p) => {
      if (!p || typeof p !== "object")
        return { valid: false, result: null, errors: ["Not an object"] };
      return { valid: true, result: p as AuditResult, errors: [] };
    });

    if (parsed.success) {
      // Merge deterministic critical gaps
      const merged = { ...parsed.data };
      for (const field of criticalMissing) {
        if (!merged.critical_gaps.some((g) => g.field === field)) {
          merged.critical_gaps.push({
            field,
            reason: "Required for resume generation",
            simplified_question: getSimplifiedQuestion(field),
          });
        }
      }
      // Filter out gaps for fields that already have values
      const resolved = getResolvedFields(session);
      merged.critical_gaps = merged.critical_gaps.filter((g) => !resolved.has(g.field));
      merged.important_gaps = merged.important_gaps.filter((g) => !resolved.has(g.field));
      merged.contradictions = merged.contradictions.filter((c) => !resolved.has(c.field));
      merged.ready_to_commit = merged.critical_gaps.length === 0;
      return merged;
    }
  } catch {
    /* fallthrough */
  }

  // Fallback: deterministic-only audit
  return {
    critical_gaps: criticalMissing.map((f) => ({
      field: f,
      reason: "Required for resume generation",
      simplified_question: getSimplifiedQuestion(f),
    })),
    important_gaps: [],
    contradictions: [],
    user_supplied_overrides: session.confirmation.user_supplied_overrides,
    regenerate_inferred_summary: session.dual_extraction.summary_quality === "low",
    profile_quality_score: session.completeness.completeness_score || 60,
    profile_quality_note: "Profile assessed with fallback scoring.",
    ready_to_commit: criticalMissing.length === 0,
  };
}

function checkCriticalFields(session: OnboardingV2Session): string[] {
  const missing: string[] = [];
  if (!session.confirmation.confirmed_role_family) missing.push("confirmed_role_family");
  if (!session.confirmation.confirmed_seniority) missing.push("confirmed_seniority");
  if (!session.question_map.target_role.value) missing.push("target_role");
  if (!session.question_map.resume_frame.value) missing.push("resume_frame");
  const ext = session.dual_extraction.pure_extraction;
  if (!ext?.experience?.length || !ext.experience.some((e) => e.title && e.company))
    missing.push("experience_entry");
  if (!ext?.skills?.raw_list?.length) missing.push("skills");
  return missing;
}

function getResolvedFields(session: OnboardingV2Session): Set<string> {
  const resolved = new Set<string>();
  const id = session.dual_extraction.pure_extraction?.identity;
  if (id?.linkedin_url) resolved.add("linkedin_url");
  if (id?.github_url) resolved.add("github_url");
  if (id?.portfolio_url) resolved.add("portfolio_url");
  if (id?.phone) resolved.add("phone");
  if (id?.location) resolved.add("location");
  if (id?.email) resolved.add("email");
  const ext = session.dual_extraction.pure_extraction;
  if (ext?.projects?.some((p) => p.url)) resolved.add("project_urls");
  if (ext?.languages?.length) resolved.add("languages");
  if (ext?.experience?.some((e) => e.location)) resolved.add("role_locations");
  // Also check user_supplied_overrides
  for (const field of session.confirmation.user_supplied_overrides) {
    resolved.add(field);
  }
  return resolved;
}

function getSimplifiedQuestion(field: string): string {
  const map: Record<string, string> = {
    confirmed_role_family: "What type of engineering role best describes you?",
    confirmed_seniority: "What seniority level are you at?",
    target_role: "What role are you targeting with this resume?",
    resume_frame: "What's the one thing you want someone to take away from your resume?",
    experience_entry:
      "Could you tell me about your most recent role — title, company, and what you worked on?",
    skills: "What are your top 5 technical skills?",
  };
  return map[field] || `Could you provide your ${field.replace(/_/g, " ")}?`;
}

export async function commitProfile(session: OnboardingV2Session): Promise<void> {
  const supabase = await createClient();
  const userId = session.user_id;

  for (let attempt = 1; attempt <= COMMIT_MAX_RETRIES; attempt++) {
    try {
      // Atomic DB-side transaction. The RPC writes all v2 profile tables,
      // metadata, users.onboarding_completed, and the session committed status
      // in one Postgres transaction.
      const stats = getSessionStats();
      const { error } = await supabase.rpc("commit_onboarding_v2_profile", {
        p_user_id: userId,
        p_session: session,
        p_llm_stats: stats,
      });
      if (error) throw new Error(error.message);
      return; // success
    } catch (err) {
      if (attempt === COMMIT_MAX_RETRIES)
        throw new CommitError(err instanceof Error ? err : undefined);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

export async function generateUnderstandingDocument(session: OnboardingV2Session): Promise<void> {
  try {
    const result = await callLLM({
      systemPrompt: UNDERSTANDING_GENERATION_SYSTEM_PROMPT,
      userMessage: JSON.stringify({
        extraction: session.dual_extraction.pure_extraction,
        inferred_summary: session.dual_extraction.inferred_summary,
        voice_profile: session.voice_profile,
        question_map: session.question_map,
        confirmed_role_family: session.confirmation.confirmed_role_family,
        confirmed_seniority: session.confirmation.confirmed_seniority,
        confirmed_industry: session.confirmation.confirmed_industry,
      }),
      model: "smart",
      temperature: 0.3,
      maxTokens: 2048,
      stage: 9,
      callName: "understanding_generation",
    });

    const supabase = await createClient();
    await supabase
      .from("user_profiles_v2")
      .update({
        understanding_document: result.content,
        understanding_generated_at: new Date().toISOString(),
      })
      .eq("user_id", session.user_id);
  } catch {
    /* non-blocking — will be retried */
  }
}

/**
 * Stage 9 — Inferred Summary Regeneration (background, non-blocking).
 *
 * Fires when summary_quality was flagged as low in Stage 2. Now that we have
 * the full enriched session (confirmed positioning, voice profile, question
 * answers) we can produce a substantially better narrative than the original
 * Stage 2 attempt could.
 */
export async function regenerateInferredSummary(session: OnboardingV2Session): Promise<void> {
  if (session.dual_extraction.summary_quality !== "low") return;
  try {
    const result = await callLLM({
      systemPrompt: INFERRED_SUMMARY_SYSTEM_PROMPT,
      userMessage: [
        `Structured extraction:\n${JSON.stringify(session.dual_extraction.pure_extraction, null, 2)}`,
        `Confirmed role family: ${session.confirmation.confirmed_role_family}`,
        `Confirmed seniority: ${session.confirmation.confirmed_seniority}`,
        `Confirmed industry: ${session.confirmation.confirmed_industry}`,
        `Target role: ${session.question_map.target_role.value ?? "not set"}`,
        `Resume frame: ${session.question_map.resume_frame.value ?? "not set"}`,
        `Voice tone summary: ${session.voice_profile.tone_calibration_summary ?? "not set"}`,
      ].join("\n\n"),
      model: "smart",
      temperature: 0.3,
      maxTokens: 1024,
      stage: 9,
      callName: "summary_regeneration",
    });

    const supabase = await createClient();
    await supabase
      .from("user_profiles_v2")
      .update({ inferred_summary: result.content.trim() })
      .eq("user_id", session.user_id);

    await updateSession(session.user_id, {
      dual_extraction: {
        ...session.dual_extraction,
        inferred_summary: result.content.trim(),
        inferred_summary_status: "success",
        summary_quality: "high",
      },
      audit: { ...session.audit, regenerated_inferred_summary: true },
    });
  } catch {
    /* swallow — best effort, original low-quality summary remains */
  }
}
