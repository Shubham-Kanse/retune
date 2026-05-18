// Onboarding V2 — Complete Type Definitions

export type OnboardingV2Status =
  | "awaiting_upload"
  | "extraction_complete"
  | "dual_extraction_complete"
  | "inference_complete"
  | "summary_confirmed"
  | "correction_in_progress"
  | "path_branched"
  | "resume_questions_complete"
  | "voice_extraction_complete"
  | "committed";

export type Confidence = "high" | "medium" | "low";
export type FieldSource =
  | "extracted"
  | "inferred"
  | "user_supplied"
  | "user_confirmed"
  | "default"
  | "deferred";

export interface QuestionMapField {
  value: string | string[] | null;
  confidence: Confidence | null;
  source: "chip" | "free_text" | "inferred" | null;
}

export interface OnboardingV2Session {
  session_id: string;
  user_id: string;
  onboarding_started_at: string;
  onboarding_completed_at: string | null;
  onboarding_status: OnboardingV2Status;

  upload: {
    file_name: string | null;
    file_type: string | null;
    file_size_bytes: number | null;
    upload_timestamp: string | null;
    upload_attempts: number;
  };

  extraction: {
    raw_text: string | null;
    raw_text_character_count: number;
    extraction_method: "file" | "paste" | null;
    schema_mapping_status: "success" | "failed" | null;
    schema_mapping_object: ExtractionSchema | null;
    extraction_quality: Confidence | null;
  };

  dual_extraction: {
    pure_extraction: ExtractionSchema | null;
    pure_extraction_confidence: Confidence | null;
    inferred_summary: string | null;
    inferred_summary_status: "success" | "failed" | "low_quality" | null;
    summary_quality: Confidence | null;
  };

  inference: InferenceResult & { inference_status?: "failed" };

  confirmation: {
    summary_confirmed: boolean;
    correction_submitted: boolean;
    confirmed_role_family: string | null;
    confirmed_industry: string | null;
    confirmed_seniority: string | null;
    correction_rounds: number;
    correction_unresolved: boolean;
    user_supplied_overrides: string[];
  };

  completeness: {
    completeness_score: number | null;
    completeness_path: CompletenessPath | null;
    missing_critical_fields: string[];
    has_quantified_achievements: boolean;
    resume_stale: boolean;
    employment_gaps_present: boolean;
  };

  question_map: QuestionMap;

  voice_profile: VoiceProfile;

  audit: {
    critical_gaps_resolved: boolean;
    important_gaps_resolved: boolean;
    contradictions_resolved: boolean;
    profile_quality_score: number | null;
    ready_to_commit: boolean;
    regenerated_inferred_summary: boolean;
  };
}

export type CompletenessPath =
  | "standard"
  | "new_grad"
  | "career_changer"
  | "contractor"
  | "returning";

export interface QuestionMap {
  target_role: QuestionMapField;
  target_role_specificity: QuestionMapField;
  underrepresented_skills: QuestionMapField;
  deemphasis_preferences: QuestionMapField;
  resume_frame: QuestionMapField;
  career_transition_framing: QuestionMapField;
  gap_handling: QuestionMapField;
  achievement_depth: QuestionMapField;
}

export interface VoiceProfile {
  natural_voice_sample: string | null;
  tone_preferences: string[] | "open" | "context_dependent";
  tone_aversions: string[];
  self_description_style: "formal" | "conversational" | "structured/terse" | null;
  sentence_structure: string | null;
  vocabulary_register: string | null;
  leading_pattern: "results_first" | "context_first" | "method_first" | "mixed" | null;
  phrases_to_use: string[];
  phrases_to_avoid: string[];
  tone_calibration_summary: string | null;
  aversion_to_ai_language: boolean;
  voice_profile_confidence: Confidence | null;
  voice_profile_source: "collected" | "default" | null;
}

export interface InferenceResult {
  industry: string | null;
  industry_confidence: Confidence | null;
  industry_note: string | null;
  industry_ambiguous: boolean;
  industry_candidates: string[] | null;
  role_family: string | null;
  role_family_confidence: Confidence | null;
  role_family_note: string | null;
  role_family_ambiguous: boolean;
  role_family_candidates: string[] | null;
  seniority: string | null;
  seniority_confidence: Confidence | null;
  seniority_note: string | null;
  seniority_ambiguous: boolean;
  career_transition_detected: boolean;
  transition_note: string | null;
  new_grad: boolean;
  work_pattern: "permanent" | "contract" | "mixed" | null;
}

// --- Extraction Schema (LLM output shape) ---

export interface ExtractionIdentity {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
}

export interface ExtractionExperience {
  title: string | null;
  company: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  bullets: string[];
}

export interface ExtractionEducation {
  institution: string | null;
  degree: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  gpa: string | null;
  honours: string | null;
}

export interface ExtractionProject {
  name: string | null;
  description: string | null;
  technologies: string[];
  url: string | null;
}

export interface ExtractionCertification {
  name: string | null;
  issuer: string | null;
  date: string | null;
}

export interface ExtractionSchema {
  identity: ExtractionIdentity | null;
  experience: ExtractionExperience[];
  education: ExtractionEducation[];
  skills: { raw_list: string[]; grouped: Record<string, string[]> } | null;
  projects: ExtractionProject[];
  certifications: ExtractionCertification[];
  languages: string[];
  awards: string[];
  publications: string[];
  volunteering: string[];
  extraction_confidence: Confidence;
  extraction_notes: string;
}

// --- Empty session factory ---

export function createEmptySession(userId: string): OnboardingV2Session {
  return {
    session_id: crypto.randomUUID(),
    user_id: userId,
    onboarding_started_at: new Date().toISOString(),
    onboarding_completed_at: null,
    onboarding_status: "awaiting_upload",
    upload: {
      file_name: null,
      file_type: null,
      file_size_bytes: null,
      upload_timestamp: null,
      upload_attempts: 0,
    },
    extraction: {
      raw_text: null,
      raw_text_character_count: 0,
      extraction_method: null,
      schema_mapping_status: null,
      schema_mapping_object: null,
      extraction_quality: null,
    },
    dual_extraction: {
      pure_extraction: null,
      pure_extraction_confidence: null,
      inferred_summary: null,
      inferred_summary_status: null,
      summary_quality: null,
    },
    inference: {
      industry: null,
      industry_confidence: null,
      industry_note: null,
      industry_ambiguous: false,
      industry_candidates: null,
      role_family: null,
      role_family_confidence: null,
      role_family_note: null,
      role_family_ambiguous: false,
      role_family_candidates: null,
      seniority: null,
      seniority_confidence: null,
      seniority_note: null,
      seniority_ambiguous: false,
      career_transition_detected: false,
      transition_note: null,
      new_grad: false,
      work_pattern: null,
    },
    confirmation: {
      summary_confirmed: false,
      correction_submitted: false,
      confirmed_role_family: null,
      confirmed_industry: null,
      confirmed_seniority: null,
      correction_rounds: 0,
      correction_unresolved: false,
      user_supplied_overrides: [],
    },
    completeness: {
      completeness_score: null,
      completeness_path: null,
      missing_critical_fields: [],
      has_quantified_achievements: false,
      resume_stale: false,
      employment_gaps_present: false,
    },
    question_map: {
      target_role: { value: null, confidence: null, source: null },
      target_role_specificity: { value: null, confidence: null, source: null },
      underrepresented_skills: { value: null, confidence: null, source: null },
      deemphasis_preferences: { value: null, confidence: null, source: null },
      resume_frame: { value: null, confidence: null, source: null },
      career_transition_framing: { value: null, confidence: null, source: null },
      gap_handling: { value: null, confidence: null, source: null },
      achievement_depth: { value: null, confidence: null, source: null },
    },
    voice_profile: {
      natural_voice_sample: null,
      tone_preferences: [],
      tone_aversions: [],
      self_description_style: null,
      sentence_structure: null,
      vocabulary_register: null,
      leading_pattern: null,
      phrases_to_use: [],
      phrases_to_avoid: [],
      tone_calibration_summary: null,
      aversion_to_ai_language: false,
      voice_profile_confidence: null,
      voice_profile_source: null,
    },
    audit: {
      critical_gaps_resolved: false,
      important_gaps_resolved: false,
      contradictions_resolved: false,
      profile_quality_score: null,
      ready_to_commit: false,
      regenerated_inferred_summary: false,
    },
  };
}
