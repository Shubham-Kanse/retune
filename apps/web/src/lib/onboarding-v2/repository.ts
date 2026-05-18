// Onboarding V2 — Profile Repository
//
// Server-side loader that aggregates data from the v2 tables for rendering
// on the career profile page. Returns null when the user has not yet
// committed a v2 profile so callers can fall back to the legacy data.

import { createClient } from "@/lib/supabase/server";
import type {
  ExtractionCertification,
  ExtractionEducation,
  ExtractionExperience,
  ExtractionProject,
} from "./types";

export interface V2ProfileSnapshot {
  profile: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    linkedin_url: string | null;
    github_url: string | null;
    portfolio_url: string | null;
    confirmed_role_family: string | null;
    confirmed_seniority: string | null;
    confirmed_industry: string | null;
    target_role: string | null;
    target_role_specificity: string | null;
    resume_frame: string | null;
    underrepresented_skills: unknown;
    deemphasis_preferences: unknown;
    career_transition_framing: string | null;
    gap_handling: string | null;
    achievement_depth: unknown;
    completeness_path: string | null;
    completeness_score: number | null;
    profile_quality_score: number | null;
    profile_depth: string | null;
    career_transition_detected: boolean;
    new_grad: boolean;
    work_pattern: string | null;
    resume_stale: boolean;
    employment_gaps_present: boolean;
    understanding_document: string | null;
    understanding_generated_at: string | null;
    inferred_summary: string | null;
  };
  experience: ExtractionExperience[];
  education: ExtractionEducation[];
  skills: { raw_list: string[]; grouped: Record<string, string[]> };
  projects: ExtractionProject[];
  certifications: ExtractionCertification[];
  extras: {
    languages: string[];
    awards: string[];
    publications: string[];
    volunteering: string[];
  };
  voice: {
    natural_voice_sample: string | null;
    tone_preferences: unknown;
    tone_aversions: string[];
    self_description_style: string | null;
    sentence_structure: string | null;
    vocabulary_register: string | null;
    leading_pattern: string | null;
    phrases_to_use: string[];
    phrases_to_avoid: string[];
    tone_calibration_summary: string | null;
    aversion_to_ai_language: boolean;
    voice_profile_confidence: string | null;
    voice_profile_source: string | null;
  } | null;
  metadata: {
    field_sources: Record<string, string>;
    field_confidences: Record<string, string>;
    low_confidence_fields: string[];
    needs_review_fields: string[];
    correction_rounds: number;
    correction_unresolved: boolean;
    extraction_confidence: string | null;
    extraction_method: string | null;
    upload_file_name: string | null;
  } | null;
}

export async function loadV2Profile(userId: string): Promise<V2ProfileSnapshot | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("user_profiles_v2")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!profile) return null;

  const [
    { data: experience },
    { data: education },
    { data: skills },
    { data: projects },
    { data: certifications },
    { data: extras },
    { data: voice },
    { data: metadata },
  ] = await Promise.all([
    supabase
      .from("user_experience_v2")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("user_education_v2")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase.from("user_skills_v2").select("*").eq("user_id", userId).single(),
    supabase
      .from("user_projects_v2")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase.from("user_certifications_v2").select("*").eq("user_id", userId),
    supabase.from("user_extras_v2").select("*").eq("user_id", userId).single(),
    supabase.from("user_voice_profiles_v2").select("*").eq("user_id", userId).single(),
    supabase.from("user_onboarding_metadata_v2").select("*").eq("user_id", userId).single(),
  ]);

  return {
    profile: profile as V2ProfileSnapshot["profile"],
    experience: (experience as ExtractionExperience[]) ?? [],
    education: (education as ExtractionEducation[]) ?? [],
    skills: {
      raw_list: (skills as { raw_list?: string[] } | null)?.raw_list ?? [],
      grouped:
        ((skills as { grouped?: Record<string, string[]> } | null)?.grouped as Record<
          string,
          string[]
        >) ?? {},
    },
    projects: (projects as ExtractionProject[]) ?? [],
    certifications: (certifications as ExtractionCertification[]) ?? [],
    extras: {
      languages: (extras as { languages?: string[] } | null)?.languages ?? [],
      awards: (extras as { awards?: string[] } | null)?.awards ?? [],
      publications: (extras as { publications?: string[] } | null)?.publications ?? [],
      volunteering: (extras as { volunteering?: string[] } | null)?.volunteering ?? [],
    },
    voice: voice as V2ProfileSnapshot["voice"],
    metadata: metadata as V2ProfileSnapshot["metadata"],
  };
}
