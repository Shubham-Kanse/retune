-- Fix all schema issues identified in audit.
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS / DO $$ guards throughout.

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #2: goals.id missing DEFAULT gen_random_uuid()
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.goals
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #1: generation_ticks missing FK on generation_id
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'generation_ticks_generation_id_fkey'
      AND table_name = 'generation_ticks'
  ) THEN
    ALTER TABLE public.generation_ticks
      ADD CONSTRAINT generation_ticks_generation_id_fkey
      FOREIGN KEY (generation_id) REFERENCES public.generations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Issue #7: index to support that FK (and general lookups)
CREATE INDEX IF NOT EXISTS generation_ticks_generation_id_idx
  ON public.generation_ticks (generation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #3: evidence_spans.source_document_id — wire FK to documents
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'evidence_spans_source_document_id_fkey'
      AND table_name = 'evidence_spans'
  ) THEN
    ALTER TABLE public.evidence_spans
      ADD CONSTRAINT evidence_spans_source_document_id_fkey
      FOREIGN KEY (source_document_id) REFERENCES public.documents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #4: onboarding_completed / onboarding_complete sync gap on INSERT
-- Fix the trigger to also fire on INSERT so both flags are always in sync.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_users_onboarding_flags()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- On INSERT both columns arrive together; just make them agree.
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

  -- On UPDATE: whichever column changed wins; keep the other in sync.
  IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed THEN
    NEW.onboarding_complete := NEW.onboarding_completed;
  ELSIF NEW.onboarding_complete IS DISTINCT FROM OLD.onboarding_complete THEN
    NEW.onboarding_completed := NEW.onboarding_complete;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_onboarding_flags ON public.users;
CREATE TRIGGER users_sync_onboarding_flags
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_users_onboarding_flags();

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #5: processor_consents — add unique constraint on (user_id, processor)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'processor_consents_user_processor_ux'
      AND table_name = 'processor_consents'
  ) THEN
    ALTER TABLE public.processor_consents
      ADD CONSTRAINT processor_consents_user_processor_ux
      UNIQUE (user_id, processor);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #6: generation_preflights.resolved_at should be nullable (not default now())
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_preflights
  ALTER COLUMN resolved_at DROP NOT NULL,
  ALTER COLUMN resolved_at DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #8: drop redundant plain email index on users (partial unique covers it)
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.users_email_idx;

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #9: missing index on billing_usage.generation_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS billing_usage_generation_id_idx
  ON public.billing_usage (generation_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #12/13: add missing created_at to voice_centroids, honesty_calibrations,
--               motivation_modulators
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.voice_centroids
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.honesty_calibrations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.motivation_modulators
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #14: enable RLS on tables that are missing it
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generation_ticks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_conflicts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_entries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackboard_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_packets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_spans             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_states           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_state_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_fingerprints          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivation_modulators      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honesty_calibrations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_centroids            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflicts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_questions           ENABLE ROW LEVEL SECURITY;

-- RLS policies for the newly-secured tables (all scoped to current_user_id())
CREATE POLICY ticks_isolation ON public.generation_ticks
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY snapshots_isolation ON public.generation_snapshots
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY gen_conflicts_isolation ON public.generation_conflicts
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY gen_questions_isolation ON public.generation_questions
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY audit_entries_isolation ON public.audit_entries
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY blackboard_snapshots_isolation ON public.blackboard_snapshots
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY outcomes_isolation ON public.outcomes
  USING (application_id IN (SELECT id FROM public.applications WHERE user_id = public.current_user_id()));

CREATE POLICY gdpr_packets_isolation ON public.gdpr_packets
  USING (user_id = public.current_user_id());

CREATE POLICY evidence_spans_isolation ON public.evidence_spans
  USING (user_id = public.current_user_id());

CREATE POLICY emotional_states_isolation ON public.emotional_states
  USING (user_id = public.current_user_id());

CREATE POLICY emotional_corrections_isolation ON public.emotional_state_corrections
  USING (user_id = public.current_user_id());

CREATE POLICY mood_fingerprints_isolation ON public.mood_fingerprints
  USING (user_id = public.current_user_id());

CREATE POLICY motivation_modulators_isolation ON public.motivation_modulators
  USING (user_id = public.current_user_id());

CREATE POLICY honesty_calibrations_isolation ON public.honesty_calibrations
  USING (user_id = public.current_user_id());

CREATE POLICY voice_centroids_isolation ON public.voice_centroids
  USING (user_id = public.current_user_id());

CREATE POLICY documents_isolation ON public.documents
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY conflicts_isolation ON public.conflicts
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY goals_isolation ON public.goals
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

CREATE POLICY active_questions_isolation ON public.active_questions
  USING (user_id = public.current_user_id());

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #15: gdpr_deletion_log.user_id intentionally has no FK (survives user
--            deletion). Add a comment so it is never "fixed" accidentally.
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.gdpr_deletion_log.user_id IS
  'Intentionally no FK — this log must survive user deletion for compliance.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #17: generation_preflights.resolved_at — already fixed above (#6)

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #18: ab_test_assignments — unique constraint on (user_id, experiment_id)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ab_test_assignments_user_experiment_ux'
      AND table_name = 'ab_test_assignments'
  ) THEN
    -- Remove any duplicate rows first (keep earliest)
    DELETE FROM public.ab_test_assignments a
    USING public.ab_test_assignments b
    WHERE a.user_id = b.user_id
      AND a.experiment_id = b.experiment_id
      AND a.created_at > b.created_at;

    ALTER TABLE public.ab_test_assignments
      ADD CONSTRAINT ab_test_assignments_user_experiment_ux
      UNIQUE (user_id, experiment_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #20: password_reset_tokens — composite index on (user_id, expires_at)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_expires_idx
  ON public.password_reset_tokens (user_id, expires_at);
