-- Onboarding V2 tables
-- FK references public.users (not auth.users) to work with both Supabase and local Postgres

CREATE TABLE IF NOT EXISTS onboarding_v2_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_state JSONB NOT NULL DEFAULT '{}',
  onboarding_status TEXT NOT NULL DEFAULT 'awaiting_upload',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_profiles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  confirmed_role_family TEXT,
  confirmed_seniority TEXT,
  confirmed_industry TEXT,
  target_role TEXT,
  target_role_specificity TEXT,
  resume_frame TEXT,
  underrepresented_skills JSONB DEFAULT '[]',
  deemphasis_preferences JSONB DEFAULT '[]',
  career_transition_framing TEXT,
  gap_handling TEXT,
  achievement_depth JSONB,
  completeness_path TEXT,
  completeness_score INTEGER,
  profile_quality_score INTEGER,
  profile_depth TEXT DEFAULT 'standard',
  career_transition_detected BOOLEAN DEFAULT false,
  new_grad BOOLEAN DEFAULT false,
  work_pattern TEXT DEFAULT 'permanent',
  resume_stale BOOLEAN DEFAULT false,
  employment_gaps_present BOOLEAN DEFAULT false,
  understanding_document TEXT,
  understanding_generated_at TIMESTAMPTZ,
  inferred_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_experience_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  company TEXT,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  is_current BOOLEAN DEFAULT false,
  bullets JSONB DEFAULT '[]',
  source TEXT DEFAULT 'extracted',
  field_overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

CREATE TABLE IF NOT EXISTS user_education_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  institution TEXT,
  degree TEXT,
  field TEXT,
  start_date TEXT,
  end_date TEXT,
  gpa TEXT,
  honours TEXT,
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

CREATE TABLE IF NOT EXISTS user_skills_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_list JSONB DEFAULT '[]',
  grouped JSONB DEFAULT '{}',
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_projects_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  description TEXT,
  technologies JSONB DEFAULT '[]',
  url TEXT,
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, sort_order)
);

CREATE TABLE IF NOT EXISTS user_certifications_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  issuer TEXT,
  date TEXT,
  source TEXT DEFAULT 'extracted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_extras_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  languages JSONB DEFAULT '[]',
  awards JSONB DEFAULT '[]',
  publications JSONB DEFAULT '[]',
  volunteering JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_voice_profiles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  natural_voice_sample TEXT,
  tone_preferences JSONB DEFAULT '[]',
  tone_aversions JSONB DEFAULT '[]',
  self_description_style TEXT,
  sentence_structure TEXT,
  vocabulary_register TEXT,
  leading_pattern TEXT,
  phrases_to_use JSONB DEFAULT '[]',
  phrases_to_avoid JSONB DEFAULT '[]',
  tone_calibration_summary TEXT,
  aversion_to_ai_language BOOLEAN DEFAULT false,
  voice_profile_confidence TEXT DEFAULT 'low',
  voice_profile_source TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_onboarding_metadata_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID,
  field_sources JSONB DEFAULT '{}',
  field_confidences JSONB DEFAULT '{}',
  low_confidence_fields JSONB DEFAULT '[]',
  needs_review_fields JSONB DEFAULT '[]',
  correction_rounds INTEGER DEFAULT 0,
  correction_unresolved BOOLEAN DEFAULT false,
  extraction_confidence TEXT,
  extraction_method TEXT,
  upload_file_name TEXT,
  total_llm_calls INTEGER DEFAULT 0,
  total_llm_cost_usd NUMERIC(6,4) DEFAULT 0,
  onboarding_started_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_v2_sessions_user ON onboarding_v2_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_v2_sessions_status ON onboarding_v2_sessions(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_user_experience_v2_user ON user_experience_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_v2_user ON user_profiles_v2(user_id);
