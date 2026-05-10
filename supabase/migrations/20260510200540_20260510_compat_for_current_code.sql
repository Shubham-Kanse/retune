-- Compatibility bridge: make optimized schema work with current codebase
-- Non-destructive: only adds missing legacy columns/tables/indexes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users: legacy columns expected by auth/profile code
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(32) DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS persona_type VARCHAR(32) DEFAULT 'experienced_ic',
  ADD COLUMN IF NOT EXISTS market VARCHAR(8) DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(16) DEFAULT 'en-US',
  ADD COLUMN IF NOT EXISTS kms_key_id TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_residency_region VARCHAR(8) DEFAULT 'us';

-- job tables expected by code (@retune/db/pg schema)
CREATE TABLE IF NOT EXISTS public.jd_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_hash VARCHAR(64) NOT NULL UNIQUE,
  analysis_blob JSONB,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(32) NOT NULL,
  url TEXT,
  content_hash VARCHAR(64) NOT NULL,
  raw_text TEXT NOT NULL,
  parsed_at TIMESTAMPTZ,
  cluster_id UUID REFERENCES public.jd_clusters(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jds_content_hash_ix ON public.jds(content_hash);
CREATE INDEX IF NOT EXISTS jds_cluster_ix ON public.jds(cluster_id);

-- generations: add legacy fields used by current api routes
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS ontology_version VARCHAR(32) DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS termination VARCHAR(32),
  ADD COLUMN IF NOT EXISTS ticks_executed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cost_usd DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_latency_ms INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_blackboard JSONB,
  ADD COLUMN IF NOT EXISTS started_at_legacy TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at_legacy TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Keep legacy names in sync by best-effort trigger for new writes
CREATE OR REPLACE FUNCTION public.sync_generations_legacy_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.termination IS NULL AND NEW.termination_reason IS NOT NULL THEN
    NEW.termination = NEW.termination_reason;
  END IF;
  IF NEW.ticks_executed IS NULL THEN
    NEW.ticks_executed = COALESCE(NEW.total_ticks, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generations_legacy_sync_trg ON public.generations;
CREATE TRIGGER generations_legacy_sync_trg
BEFORE INSERT OR UPDATE ON public.generations
FOR EACH ROW EXECUTE FUNCTION public.sync_generations_legacy_fields();

-- snapshot/audit support tables used by persistence code
CREATE TABLE IF NOT EXISTS public.blackboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generation_id, seq)
);

CREATE TABLE IF NOT EXISTS public.audit_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  specialist VARCHAR(128) NOT NULL,
  micro_stage VARCHAR(128),
  inputs_hash VARCHAR(64) NOT NULL,
  output_hash VARCHAR(64) NOT NULL,
  justification TEXT,
  model_version VARCHAR(128),
  latency_ms INTEGER NOT NULL,
  cost_usd DOUBLE PRECISION NOT NULL,
  writes JSONB NOT NULL DEFAULT '[]'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generation_id, seq)
);

CREATE TABLE IF NOT EXISTS public.conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  monitor VARCHAR(128) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  kind VARCHAR(128) NOT NULL,
  payload JSONB,
  resolved_by_specialist VARCHAR(128),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  kind VARCHAR(64) NOT NULL,
  priority INTEGER NOT NULL,
  emitted_by VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payload JSONB,
  parent_goal_id UUID,
  satisfied_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.active_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  target_field VARCHAR(256) NOT NULL,
  parent_goal_field VARCHAR(128),
  answered_at TIMESTAMPTZ,
  answer_text TEXT,
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- profiles: add legacy fields consumed by current web APIs
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS linkedin TEXT,
  ADD COLUMN IF NOT EXISTS visa_status TEXT,
  ADD COLUMN IF NOT EXISTS relocation_preferences TEXT,
  ADD COLUMN IF NOT EXISTS experience_level TEXT,
  ADD COLUMN IF NOT EXISTS current_title TEXT,
  ADD COLUMN IF NOT EXISTS experience TEXT,
  ADD COLUMN IF NOT EXISTS education TEXT,
  ADD COLUMN IF NOT EXISTS certifications TEXT,
  ADD COLUMN IF NOT EXISTS projects TEXT,
  ADD COLUMN IF NOT EXISTS skills_tier1 TEXT,
  ADD COLUMN IF NOT EXISTS skills_tier2 TEXT,
  ADD COLUMN IF NOT EXISTS skills_tier3 TEXT,
  ADD COLUMN IF NOT EXISTS voice_notes TEXT,
  ADD COLUMN IF NOT EXISTS profile_markdown TEXT;

-- onboarding conversations: add legacy fields
ALTER TABLE public.onboarding_conversations
  ADD COLUMN IF NOT EXISTS messages TEXT,
  ADD COLUMN IF NOT EXISTS resume_text TEXT;

-- subscriptions/password reset legacy tables used by code
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- processor_consents legacy shape compatibility
ALTER TABLE public.processor_consents
  ADD COLUMN IF NOT EXISTS processor TEXT,
  ADD COLUMN IF NOT EXISTS granted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS granted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- generation_preflights table expected by preflight flow
CREATE TABLE IF NOT EXISTS public.generation_preflights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  jd_hash VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'none',
  missing_must_have JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_good_to_have JSONB NOT NULL DEFAULT '[]'::jsonb,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS generation_preflights_user_hash_ix ON public.generation_preflights(user_id, jd_hash);
CREATE INDEX IF NOT EXISTS generation_preflights_expires_ix ON public.generation_preflights(expires_at);

-- applications: add legacy columns consumed across UI/api
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS jd_id UUID,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS role_title TEXT,
  ADD COLUMN IF NOT EXISTS job_description TEXT,
  ADD COLUMN IF NOT EXISTS jd_url TEXT,
  ADD COLUMN IF NOT EXISTS market VARCHAR(8),
  ADD COLUMN IF NOT EXISTS current_step TEXT,
  ADD COLUMN IF NOT EXISTS steps_completed TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_log TEXT,
  ADD COLUMN IF NOT EXISTS company_intel TEXT,
  ADD COLUMN IF NOT EXISTS ats_report TEXT,
  ADD COLUMN IF NOT EXISTS resume_docx_path TEXT,
  ADD COLUMN IF NOT EXISTS resume_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS cover_letter_docx_path TEXT,
  ADD COLUMN IF NOT EXISTS cover_letter_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS refinement_history TEXT,
  ADD COLUMN IF NOT EXISTS resume_version INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS token_usage TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- backfill for old code expectations
UPDATE public.applications
SET
  company_name = COALESCE(company_name, company, 'Unknown'),
  role_title = COALESCE(role_title, role, ''),
  market = COALESCE(market, 'us')
WHERE company_name IS NULL OR role_title IS NULL OR market IS NULL;

ALTER TABLE public.applications
  ALTER COLUMN company_name SET DEFAULT 'Unknown';
ALTER TABLE public.applications
  ALTER COLUMN role_title SET DEFAULT '';
ALTER TABLE public.applications
  ALTER COLUMN market SET DEFAULT 'us';

-- auxiliary legacy tables referenced by code
CREATE TABLE IF NOT EXISTS public.outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source VARCHAR(32) NOT NULL,
  feedback_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gdpr_packets (
  generation_id UUID PRIMARY KEY REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  verdict VARCHAR(16) NOT NULL,
  packet JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ab_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  experiment_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  token_usage TEXT,
  cost_usd DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contest_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- documents/evidence/calibration tables expected by type exports and some services
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  content JSONB NOT NULL,
  rendered_html TEXT,
  rendered_pdf_url TEXT,
  watermark_tag VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (generation_id, kind)
);

CREATE TABLE IF NOT EXISTS public.evidence_spans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_document_id UUID,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  text_snippet TEXT NOT NULL,
  span_type VARCHAR(32) NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  provenance VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.voice_centroids (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  vector JSONB NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.honesty_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claim_type VARCHAR(64) NOT NULL,
  trust_factor DOUBLE PRECISION NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_type)
);

CREATE TABLE IF NOT EXISTS public.emotional_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES public.generations(id) ON DELETE CASCADE,
  valence DOUBLE PRECISION NOT NULL,
  arousal DOUBLE PRECISION NOT NULL,
  dominance DOUBLE PRECISION NOT NULL,
  primary_emotion VARCHAR(32) NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  source_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.emotional_state_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emotional_state_id UUID NOT NULL REFERENCES public.emotional_states(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  corrected_emotion VARCHAR(32) NOT NULL,
  feedback_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mood_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  valence_avg DOUBLE PRECISION NOT NULL,
  arousal_avg DOUBLE PRECISION NOT NULL,
  dominance_avg DOUBLE PRECISION NOT NULL,
  stability DOUBLE PRECISION NOT NULL,
  sample_window_hours INTEGER NOT NULL DEFAULT 168,
  sample_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.motivation_modulators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  claim_type VARCHAR(64) NOT NULL,
  drive_level DOUBLE PRECISION NOT NULL,
  reward_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_reward_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_type)
);

CREATE TABLE IF NOT EXISTS public.case_base_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jd_embedding JSONB NOT NULL,
  profile_embedding JSONB NOT NULL,
  document_embeddings JSONB NOT NULL,
  outcome_kind VARCHAR(32) NOT NULL,
  opt_in BOOLEAN NOT NULL DEFAULT false,
  user_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ontology_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semver VARCHAR(32) NOT NULL UNIQUE,
  content_hash VARCHAR(64) NOT NULL,
  migration_path JSONB,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
