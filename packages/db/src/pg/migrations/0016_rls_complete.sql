-- 0016_rls_complete.sql
-- Charter 08-Data-Integrity Epic 01 — comprehensive Row-Level Security.
--
-- Closes the gap between the Drizzle schema (39 tables) and the existing
-- RLS coverage in `supabase/migrations/20260510230400_rls_policies_missing.sql`,
-- which was written for an older/different schema and missed these tables:
--
--   USER-OWNED:
--     generations, voice_centroids, honesty_calibrations, mood_fingerprints,
--     motivation_modulators, applications, outcomes, gdpr_packets,
--     profiles, onboarding_sessions, onboarding_events, resume_ingestions,
--     generation_requests, resume_extraction_audit, generation_model_calls
--
--   GENERATION-SCOPED:
--     blackboard_snapshots, audit_entries, conflicts, goals,
--     active_questions, evidence_spans, emotional_states,
--     emotional_state_corrections, documents
--
--   SERVICE-ROLE-ONLY (DENY ALL — RLS bypassed by service_role, blocks anon):
--     stripe_events, security_audit_log
--
-- Service role (PostgREST `service_role`) bypasses RLS by default, so any
-- table marked DENY-ALL is still writable by the API layer that uses the
-- service-role key but invisible to the anon/authenticated app user.
--
-- The current_user_id() helper is defined in 20260510230300_fix_security_warnings.sql.

-- ── User-owned tables (direct user_id column) ──────────────────────────────
ALTER TABLE public.generations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_centroids        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.honesty_calibrations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_fingerprints      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivation_modulators  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_packets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_ingestions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_extraction_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_model_calls ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (idempotent migration).
DROP POLICY IF EXISTS generations_isolation ON public.generations;
DROP POLICY IF EXISTS voice_centroids_isolation ON public.voice_centroids;
DROP POLICY IF EXISTS honesty_calibrations_isolation ON public.honesty_calibrations;
DROP POLICY IF EXISTS mood_fingerprints_isolation ON public.mood_fingerprints;
DROP POLICY IF EXISTS motivation_modulators_isolation ON public.motivation_modulators;
DROP POLICY IF EXISTS applications_isolation ON public.applications;
DROP POLICY IF EXISTS outcomes_isolation ON public.outcomes;
DROP POLICY IF EXISTS gdpr_packets_isolation ON public.gdpr_packets;
DROP POLICY IF EXISTS profiles_isolation ON public.profiles;
DROP POLICY IF EXISTS onboarding_sessions_isolation ON public.onboarding_sessions;
DROP POLICY IF EXISTS onboarding_events_isolation ON public.onboarding_events;
DROP POLICY IF EXISTS resume_ingestions_isolation ON public.resume_ingestions;
DROP POLICY IF EXISTS generation_requests_isolation ON public.generation_requests;
DROP POLICY IF EXISTS resume_extraction_audit_isolation ON public.resume_extraction_audit;
DROP POLICY IF EXISTS generation_model_calls_isolation ON public.generation_model_calls;

CREATE POLICY generations_isolation             ON public.generations             USING (user_id = public.current_user_id());
CREATE POLICY voice_centroids_isolation         ON public.voice_centroids         USING (user_id = public.current_user_id());
CREATE POLICY honesty_calibrations_isolation    ON public.honesty_calibrations    USING (user_id = public.current_user_id());
CREATE POLICY mood_fingerprints_isolation       ON public.mood_fingerprints       USING (user_id = public.current_user_id());
CREATE POLICY motivation_modulators_isolation   ON public.motivation_modulators   USING (user_id = public.current_user_id());
CREATE POLICY applications_isolation            ON public.applications            USING (user_id = public.current_user_id());
CREATE POLICY outcomes_isolation                ON public.outcomes                USING (user_id = public.current_user_id());
CREATE POLICY gdpr_packets_isolation            ON public.gdpr_packets            USING (user_id = public.current_user_id());
CREATE POLICY profiles_isolation                ON public.profiles                USING (user_id = public.current_user_id());
CREATE POLICY onboarding_sessions_isolation     ON public.onboarding_sessions     USING (user_id = public.current_user_id());
CREATE POLICY onboarding_events_isolation       ON public.onboarding_events       USING (user_id = public.current_user_id());
CREATE POLICY resume_ingestions_isolation       ON public.resume_ingestions       USING (user_id = public.current_user_id());
CREATE POLICY generation_requests_isolation     ON public.generation_requests     USING (user_id = public.current_user_id());
CREATE POLICY resume_extraction_audit_isolation ON public.resume_extraction_audit USING (user_id = public.current_user_id());
CREATE POLICY generation_model_calls_isolation  ON public.generation_model_calls  USING (user_id = public.current_user_id());

-- ── Generation-scoped tables (no user_id, scoped through generation) ──────
ALTER TABLE public.blackboard_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_entries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflicts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_questions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_spans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_states             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_state_corrections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blackboard_snapshots_isolation ON public.blackboard_snapshots;
DROP POLICY IF EXISTS audit_entries_isolation ON public.audit_entries;
DROP POLICY IF EXISTS conflicts_isolation ON public.conflicts;
DROP POLICY IF EXISTS goals_isolation ON public.goals;
DROP POLICY IF EXISTS active_questions_isolation ON public.active_questions;
DROP POLICY IF EXISTS evidence_spans_isolation ON public.evidence_spans;
DROP POLICY IF EXISTS emotional_states_isolation ON public.emotional_states;
DROP POLICY IF EXISTS emotional_state_corrections_isolation ON public.emotional_state_corrections;
DROP POLICY IF EXISTS documents_isolation ON public.documents;

CREATE POLICY blackboard_snapshots_isolation ON public.blackboard_snapshots
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY audit_entries_isolation ON public.audit_entries
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY conflicts_isolation ON public.conflicts
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY goals_isolation ON public.goals
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY active_questions_isolation ON public.active_questions
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY evidence_spans_isolation ON public.evidence_spans
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY emotional_states_isolation ON public.emotional_states
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY emotional_state_corrections_isolation ON public.emotional_state_corrections
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));
CREATE POLICY documents_isolation ON public.documents
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

-- ── Service-role-only tables (DENY ALL for non-service connections) ───────
-- The service_role key bypasses RLS, so the API layer (which uses
-- service_role) can still read/write. Anon and authenticated users
-- cannot see these rows directly.
ALTER TABLE public.stripe_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_events_deny_all ON public.stripe_events;
DROP POLICY IF EXISTS security_audit_log_deny_all ON public.security_audit_log;

CREATE POLICY stripe_events_deny_all      ON public.stripe_events      USING (false);
CREATE POLICY security_audit_log_deny_all ON public.security_audit_log USING (false);

-- ── Audit: ensure FORCE ROW LEVEL SECURITY on the most sensitive tables
-- so even table owners can't bypass RLS without explicit role switching.
ALTER TABLE public.security_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_packets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events FORCE ROW LEVEL SECURITY;
