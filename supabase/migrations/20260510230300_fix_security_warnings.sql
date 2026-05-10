-- Fix all 9 Security Advisor warnings.

-- ─── 1. Pin search_path on all public functions ───────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID
$$;

CREATE OR REPLACE FUNCTION public.check_artifact_generation_match()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION public.sync_users_onboarding_flags()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.onboarding_completed IS TRUE OR NEW.onboarding_complete IS TRUE THEN
      NEW.onboarding_completed := true;
      NEW.onboarding_complete  := true;
    ELSE
      NEW.onboarding_completed := false;
      NEW.onboarding_complete  := false;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed THEN
    NEW.onboarding_complete := NEW.onboarding_completed;
  ELSIF NEW.onboarding_complete IS DISTINCT FROM OLD.onboarding_complete THEN
    NEW.onboarding_completed := NEW.onboarding_complete;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_generations_legacy_fields()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
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

-- ─── 2. Move pg_trgm and vector out of public into extensions schema ──────────
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION vector    SET SCHEMA extensions;

-- ─── 3. Drop the rls_auto_enable SECURITY DEFINER function ───────────────────
-- Drop the dependent event trigger first, then the function.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();
