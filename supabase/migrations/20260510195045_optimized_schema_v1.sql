-- Test env reset (data loss acceptable)
DROP VIEW IF EXISTS public.applications_legacy_view CASCADE;
DROP TABLE IF EXISTS public.generation_audit_packets CASCADE;
DROP TABLE IF EXISTS public.generation_results CASCADE;
DROP TABLE IF EXISTS public.generation_questions CASCADE;
DROP TABLE IF EXISTS public.generation_conflicts CASCADE;
DROP TABLE IF EXISTS public.generation_snapshots CASCADE;
DROP TABLE IF EXISTS public.generation_ticks CASCADE;
DROP TABLE IF EXISTS public.generation_goals CASCADE;
DROP TABLE IF EXISTS public.applications CASCADE;
DROP TABLE IF EXISTS public.generation_artifacts CASCADE;
DROP TABLE IF EXISTS public.generations CASCADE;
DROP TABLE IF EXISTS public.jd_analysis CASCADE;
DROP TABLE IF EXISTS public.job_descriptions CASCADE;
DROP TABLE IF EXISTS public.onboarding_turns CASCADE;
DROP TABLE IF EXISTS public.onboarding_conversations CASCADE;
DROP TABLE IF EXISTS public.profile_education CASCADE;
DROP TABLE IF EXISTS public.profile_experiences CASCADE;
DROP TABLE IF EXISTS public.profile_skills CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.skill_ontology CASCADE;
DROP TABLE IF EXISTS public.billing_usage CASCADE;
DROP TABLE IF EXISTS public.billing_subscriptions CASCADE;
DROP TABLE IF EXISTS public.processor_consents CASCADE;
DROP TABLE IF EXISTS public.gdpr_deletion_log CASCADE;
DROP TABLE IF EXISTS public.oauth_accounts CASCADE;
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

DROP TYPE IF EXISTS public.billing_plan CASCADE;
DROP TYPE IF EXISTS public.billing_interval CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL UNIQUE,
  email_verified_at   TIMESTAMPTZ,
  onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX users_email_idx ON public.users (email);
CREATE INDEX users_deleted_at_idx ON public.users (deleted_at);
CREATE INDEX users_email_trgm_idx ON public.users USING GIN (email gin_trgm_ops);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT
);
CREATE INDEX user_sessions_user_idx ON public.user_sessions (user_id);
CREATE INDEX user_sessions_expires_idx ON public.user_sessions (expires_at);

CREATE TABLE public.oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);
CREATE INDEX oauth_accounts_user_idx ON public.oauth_accounts (user_id);
CREATE INDEX oauth_accounts_provider_idx ON public.oauth_accounts (provider, provider_id);
CREATE TRIGGER oauth_accounts_updated_at BEFORE UPDATE ON public.oauth_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.gdpr_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  requested_by TEXT NOT NULL DEFAULT 'user' CHECK (requested_by IN ('user', 'admin', 'automated')),
  notes TEXT
);
CREATE INDEX gdpr_deletion_log_user_idx ON public.gdpr_deletion_log (user_id);
CREATE INDEX gdpr_deletion_log_completed_idx ON public.gdpr_deletion_log (completed_at);

CREATE TABLE public.processor_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'marketing', 'data_processing', 'ai_processing')),
  version TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);
CREATE INDEX processor_consents_user_type_idx ON public.processor_consents (user_id, consent_type, granted_at DESC);

CREATE TYPE public.billing_plan AS ENUM ('free', 'pro', 'team', 'enterprise');
CREATE TYPE public.billing_interval AS ENUM ('monthly', 'annual');

CREATE TABLE public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  plan public.billing_plan NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused', 'incomplete', 'incomplete_expired')),
  interval public.billing_interval,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  stripe_customer_id TEXT UNIQUE,
  stripe_sub_id TEXT UNIQUE,
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX billing_subscriptions_status_idx ON public.billing_subscriptions (status);
CREATE INDEX billing_subscriptions_customer_idx ON public.billing_subscriptions (stripe_customer_id);
CREATE INDEX billing_subscriptions_period_end_idx ON public.billing_subscriptions (current_period_end);
CREATE TRIGGER billing_subscriptions_updated_at BEFORE UPDATE ON public.billing_subscriptions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.billing_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  generation_id UUID,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  generations_used INTEGER NOT NULL DEFAULT 0,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX billing_usage_user_period_idx ON public.billing_usage (user_id, period_start DESC);

CREATE TABLE public.skill_ontology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('language', 'framework', 'domain', 'tool', 'soft')),
  parent_id UUID REFERENCES public.skill_ontology(id),
  aliases TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX skill_ontology_name_idx ON public.skill_ontology (canonical_name);
CREATE INDEX skill_ontology_aliases_idx ON public.skill_ontology USING GIN (aliases);
CREATE INDEX skill_ontology_name_trgm_idx ON public.skill_ontology USING GIN (canonical_name gin_trgm_ops);
CREATE INDEX skill_ontology_parent_idx ON public.skill_ontology (parent_id);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT,
  headline TEXT,
  location TEXT,
  years_experience SMALLINT,
  seniority_level TEXT CHECK (seniority_level IN ('junior', 'mid', 'senior', 'staff', 'principal', 'executive')),
  target_roles TEXT[] NOT NULL DEFAULT '{}',
  target_markets TEXT[] NOT NULL DEFAULT '{}',
  skills TEXT[] NOT NULL DEFAULT '{}',
  industries TEXT[] NOT NULL DEFAULT '{}',
  raw_text TEXT,
  linkedin_url TEXT,
  voice_fingerprint JSONB,
  completeness_score NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profiles_user_idx ON public.profiles (user_id);
CREATE INDEX profiles_skills_idx ON public.profiles USING GIN (skills);
CREATE INDEX profiles_target_roles_idx ON public.profiles USING GIN (target_roles);
CREATE INDEX profiles_completeness_idx ON public.profiles (completeness_score);
CREATE INDEX profiles_full_name_trgm_idx ON public.profiles USING GIN (full_name gin_trgm_ops);
CREATE INDEX profiles_headline_trgm_idx ON public.profiles USING GIN (headline gin_trgm_ops);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.profile_skills (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES public.skill_ontology(id) ON DELETE CASCADE,
  proficiency TEXT CHECK (proficiency IN ('familiar', 'proficient', 'expert')),
  years SMALLINT,
  PRIMARY KEY (profile_id, skill_id)
);
CREATE INDEX profile_skills_skill_idx ON public.profile_skills (skill_id);

CREATE TABLE public.profile_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at DATE NOT NULL,
  ended_at DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  skills_used TEXT[] NOT NULL DEFAULT '{}',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_current_ended_at_consistency CHECK (
    (is_current = true AND ended_at IS NULL) OR
    (is_current = false AND ended_at IS NOT NULL)
  )
);
CREATE INDEX profile_experiences_profile_started_idx ON public.profile_experiences (profile_id, started_at DESC);
CREATE TRIGGER profile_experiences_updated_at BEFORE UPDATE ON public.profile_experiences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.profile_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT,
  field TEXT,
  started_at DATE,
  ended_at DATE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profile_education_profile_idx ON public.profile_education (profile_id);

CREATE TABLE public.onboarding_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'started' CHECK (stage IN ('started', 'upload', 'conversation', 'review', 'complete')),
  provider TEXT NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic', 'openai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER onboarding_conversations_updated_at BEFORE UPDATE ON public.onboarding_conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.onboarding_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  onboarding_conversation_id UUID NOT NULL REFERENCES public.onboarding_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  stage_at_turn TEXT NOT NULL,
  extracted_profile_patch JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX onboarding_turns_conversation_created_idx ON public.onboarding_turns (onboarding_conversation_id, created_at ASC);

CREATE TABLE public.job_descriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jd_hash TEXT NOT NULL,
  title TEXT,
  company TEXT,
  location TEXT,
  market TEXT,
  jd_text TEXT NOT NULL,
  jd_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_descriptions_user_hash_ux ON public.job_descriptions (user_id, jd_hash);
CREATE INDEX job_descriptions_user_created_idx ON public.job_descriptions (user_id, created_at DESC);
CREATE INDEX job_descriptions_company_trgm_idx ON public.job_descriptions USING GIN (company gin_trgm_ops);
CREATE INDEX job_descriptions_title_trgm_idx ON public.job_descriptions USING GIN (title gin_trgm_ops);

CREATE TABLE public.jd_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jd_id UUID NOT NULL UNIQUE REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  ml_model_version TEXT NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  preferred_skills TEXT[] NOT NULL DEFAULT '{}',
  discourse_tags TEXT[] NOT NULL DEFAULT '{}',
  extracted_spans JSONB,
  seniority_signal TEXT,
  culture_signals JSONB,
  ats_keywords TEXT[] NOT NULL DEFAULT '{}',
  raw_ml_output JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jd_analysis_required_skills_idx ON public.jd_analysis USING GIN (required_skills);
CREATE INDEX jd_analysis_ats_keywords_idx ON public.jd_analysis USING GIN (ats_keywords);
CREATE INDEX jd_analysis_model_version_idx ON public.jd_analysis (ml_model_version);

CREATE TABLE public.generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jd_id UUID NOT NULL REFERENCES public.job_descriptions(id),
  profile_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'awaiting_user', 'completed', 'refused', 'failed', 'canceled')),
  runtime TEXT NOT NULL DEFAULT 'temporal' CHECK (runtime IN ('temporal', 'in_memory')),
  temporal_workflow_id TEXT UNIQUE,
  temporal_run_id TEXT,
  budget_tokens INTEGER NOT NULL DEFAULT 100000,
  spent_tokens INTEGER NOT NULL DEFAULT 0,
  max_ticks SMALLINT NOT NULL DEFAULT 120,
  total_ticks SMALLINT NOT NULL DEFAULT 0,
  termination_reason TEXT,
  ship_decision TEXT CHECK (ship_decision IN ('ship', 'revise', 'refuse')),
  ats_score NUMERIC(5,2),
  narrative_summary TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generations_user_created_idx ON public.generations (user_id, created_at DESC);
CREATE INDEX generations_status_idx ON public.generations (status);
CREATE INDEX generations_temporal_workflow_idx ON public.generations (temporal_workflow_id);
CREATE TRIGGER generations_updated_at BEFORE UPDATE ON public.generations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.billing_usage
  ADD CONSTRAINT fk_billing_usage_generation
  FOREIGN KEY (generation_id) REFERENCES public.generations(id) ON DELETE SET NULL;

CREATE TABLE public.generation_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'skipped', 'failed')),
  priority NUMERIC(18,9) NOT NULL DEFAULT 0,
  parent_goal_id UUID REFERENCES public.generation_goals(id),
  input_context JSONB,
  output JSONB,
  specialist_id TEXT,
  attempt_count SMALLINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generation_goals_open_priority_idx ON public.generation_goals (generation_id, priority ASC) WHERE status = 'open';
CREATE INDEX generation_goals_parent_idx ON public.generation_goals (parent_goal_id);
CREATE INDEX generation_goals_generation_status_idx ON public.generation_goals (generation_id, status);
CREATE TRIGGER generation_goals_updated_at BEFORE UPDATE ON public.generation_goals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Supabase-compatible: keep non-partitioned ticks table (pg_partman not required)
CREATE TABLE public.generation_ticks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL,
  goal_id UUID,
  specialist_id TEXT,
  tick_number SMALLINT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('ok', 'conflict', 'skipped', 'error')),
  writes JSONB,
  conflicts_raised SMALLINT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generation_ticks_generation_tick_idx ON public.generation_ticks (generation_id, tick_number);
CREATE INDEX generation_ticks_generation_created_idx ON public.generation_ticks (generation_id, created_at DESC);

CREATE TABLE public.generation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  tick_number SMALLINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'diff' CHECK (kind IN ('diff', 'full')),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generation_id, tick_number)
);
CREATE INDEX generation_snapshots_generation_tick_idx ON public.generation_snapshots (generation_id, tick_number ASC);
CREATE INDEX generation_snapshots_generation_kind_idx ON public.generation_snapshots (generation_id, kind);

CREATE TABLE public.generation_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  tick_number SMALLINT NOT NULL,
  conflict_type TEXT NOT NULL,
  blackboard_key TEXT NOT NULL,
  raised_by TEXT NOT NULL,
  resolved_by TEXT,
  resolution TEXT CHECK (resolution IN ('accepted', 'overridden', 'escalated')),
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX generation_conflicts_generation_tick_idx ON public.generation_conflicts (generation_id, tick_number);
CREATE INDEX generation_conflicts_type_idx ON public.generation_conflicts (conflict_type);
CREATE INDEX generation_conflicts_resolved_idx ON public.generation_conflicts (resolved_at);

CREATE TABLE public.generation_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  tick_number SMALLINT NOT NULL,
  raised_by TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'freetext' CHECK (question_type IN ('freetext', 'choice', 'confirm')),
  options JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'answered', 'expired', 'skipped')),
  answer_text TEXT,
  answered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generation_questions_generation_status_idx ON public.generation_questions (generation_id, status);
CREATE INDEX generation_questions_expires_idx ON public.generation_questions (expires_at);

CREATE TABLE public.generation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('resume_docx', 'resume_pdf', 'cover_letter_docx', 'cover_letter_pdf', 'strategy_md', 'ats_report_json')),
  version SMALLINT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,
  storage_key TEXT NOT NULL,
  storage_bucket TEXT,
  size_bytes INTEGER,
  checksum_sha256 TEXT,
  renderer_version TEXT,
  render_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generation_id, kind, version)
);
CREATE UNIQUE INDEX generation_artifacts_current_ux ON public.generation_artifacts (generation_id, kind) WHERE is_current = true;
CREATE INDEX generation_artifacts_generation_kind_version_idx ON public.generation_artifacts (generation_id, kind, version DESC);

CREATE TABLE public.generation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL UNIQUE REFERENCES public.generations(id) ON DELETE CASCADE,
  ship_decision TEXT NOT NULL CHECK (ship_decision IN ('ship', 'revise', 'refuse')),
  refusal_reason TEXT,
  ats_score NUMERIC(5,2),
  gap_analysis JSONB,
  arc_selected TEXT,
  critic_scores JSONB,
  outcome_prediction JSONB,
  total_ticks SMALLINT,
  total_tokens INTEGER,
  total_cost_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.generation_audit_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL UNIQUE REFERENCES public.generations(id) ON DELETE CASCADE,
  trace_payload JSONB NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 years'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generation_audit_packets_retain_idx ON public.generation_audit_packets (retain_until);

CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  generation_id UUID UNIQUE REFERENCES public.generations(id) ON DELETE SET NULL,
  company TEXT,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'refused', 'submitted', 'archived', 'failed', 'canceled', 'draft')),
  ats_score NUMERIC(5,2),
  resume_content TEXT,
  cover_letter_content TEXT,
  application_strategy TEXT,
  resume_artifact_id UUID REFERENCES public.generation_artifacts(id) ON DELETE SET NULL,
  cover_letter_artifact_id UUID REFERENCES public.generation_artifacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX applications_user_created_idx ON public.applications (user_id, created_at DESC);
CREATE INDEX applications_generation_idx ON public.applications (generation_id);
CREATE INDEX applications_status_idx ON public.applications (status);
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.check_artifact_generation_match()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  resume_gen_id UUID;
  cover_letter_gen_id UUID;
BEGIN
  IF NEW.resume_artifact_id IS NOT NULL THEN
    SELECT generation_id INTO resume_gen_id FROM public.generation_artifacts WHERE id = NEW.resume_artifact_id;
    IF resume_gen_id IS DISTINCT FROM NEW.generation_id THEN
      RAISE EXCEPTION 'resume_artifact_id % belongs to generation % not %', NEW.resume_artifact_id, resume_gen_id, NEW.generation_id;
    END IF;
  END IF;

  IF NEW.cover_letter_artifact_id IS NOT NULL THEN
    SELECT generation_id INTO cover_letter_gen_id FROM public.generation_artifacts WHERE id = NEW.cover_letter_artifact_id;
    IF cover_letter_gen_id IS DISTINCT FROM NEW.generation_id THEN
      RAISE EXCEPTION 'cover_letter_artifact_id % belongs to generation % not %', NEW.cover_letter_artifact_id, cover_letter_gen_id, NEW.generation_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER applications_artifact_generation_check
BEFORE INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.check_artifact_generation_match();

CREATE VIEW public.applications_legacy_view AS
SELECT
  id, user_id, generation_id, company, role, status,
  ats_score, resume_content, cover_letter_content,
  application_strategy, created_at, updated_at
FROM public.applications;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_isolation ON public.users USING (id = public.current_user_id());
CREATE POLICY profiles_isolation ON public.profiles USING (user_id = public.current_user_id());
CREATE POLICY generations_isolation ON public.generations USING (user_id = public.current_user_id());
CREATE POLICY goals_isolation ON public.generation_goals USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY artifacts_isolation ON public.generation_artifacts USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY applications_isolation ON public.applications USING (user_id = public.current_user_id());

CREATE POLICY profiles_write_isolation ON public.profiles FOR INSERT WITH CHECK (user_id = public.current_user_id());
CREATE POLICY profiles_update_isolation ON public.profiles FOR UPDATE USING (user_id = public.current_user_id()) WITH CHECK (user_id = public.current_user_id());

CREATE POLICY generations_write_isolation ON public.generations FOR INSERT WITH CHECK (user_id = public.current_user_id());
CREATE POLICY generations_update_isolation ON public.generations FOR UPDATE USING (user_id = public.current_user_id()) WITH CHECK (user_id = public.current_user_id());

CREATE POLICY applications_write_isolation ON public.applications FOR INSERT WITH CHECK (user_id = public.current_user_id());
CREATE POLICY applications_update_isolation ON public.applications FOR UPDATE USING (user_id = public.current_user_id()) WITH CHECK (user_id = public.current_user_id());
