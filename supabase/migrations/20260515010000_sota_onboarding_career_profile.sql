-- SOTA onboarding storage contract.
-- Test environment: additive and compatible with the current runtime.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS career_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS career_profile_version TEXT NOT NULL DEFAULT 'career-profile-v1',
  ADD COLUMN IF NOT EXISTS profile_readiness JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS de_emphasis_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS resume_file_hash TEXT,
  ADD COLUMN IF NOT EXISTS extraction_status TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.onboarding_events
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS ai_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS ai_cost_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS error_code TEXT;

CREATE INDEX IF NOT EXISTS onboarding_events_trace_id_idx
  ON public.onboarding_events(trace_id);

CREATE INDEX IF NOT EXISTS onboarding_sessions_status_idx
  ON public.onboarding_sessions(status);

CREATE INDEX IF NOT EXISTS onboarding_sessions_resume_file_hash_idx
  ON public.onboarding_sessions(user_id, resume_file_hash);
