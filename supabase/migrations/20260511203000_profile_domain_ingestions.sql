-- Profile-domain ingestion state + enum check hardening

CREATE TABLE IF NOT EXISTS public.resume_ingestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  stage text NOT NULL DEFAULT 'upload',
  filename text NOT NULL,
  media_type text,
  size_bytes integer NOT NULL,
  content_hash text NOT NULL,
  extracted_profile_json text,
  error_code text,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resume_ingestions_source_ck CHECK (source IN ('onboarding_upload', 'profile_upload', 'manual_patch')),
  CONSTRAINT resume_ingestions_status_ck CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT resume_ingestions_stage_ck CHECK (stage IN ('upload', 'conversation', 'complete', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS resume_ingestions_user_hash_ux
  ON public.resume_ingestions(user_id, content_hash);

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_experience_level_ck;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_experience_level_ck
  CHECK (experience_level IS NULL OR experience_level IN ('entry', 'early', 'mid', 'senior', 'staff'));

ALTER TABLE public.onboarding_conversations DROP CONSTRAINT IF EXISTS onboarding_conversations_stage_ck;
ALTER TABLE public.onboarding_conversations
  ADD CONSTRAINT onboarding_conversations_stage_ck
  CHECK (stage IN ('upload', 'conversation', 'complete', 'skipped'));
