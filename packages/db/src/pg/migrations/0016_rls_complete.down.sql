-- 0016_rls_complete.down.sql
-- Charter 18-Migrations Epic 01 — reversible migration.
--
-- Pairs with 0016_rls_complete.sql. Disables the RLS policies and
-- ROW LEVEL SECURITY toggle that 0016 added so the schema returns to
-- its previous state.
--
-- Use case: an emergency rollback of the RLS rollout if a query path
-- we missed is breaking under the new policies. After running this
-- the previous (partial) RLS state from
-- `supabase/migrations/20260510230400_rls_policies_missing.sql`
-- remains in effect for tables that migration covers.

-- ── Drop user-owned policies ──────────────────────────────────────
DROP POLICY IF EXISTS generations_isolation             ON public.generations;
DROP POLICY IF EXISTS voice_centroids_isolation         ON public.voice_centroids;
DROP POLICY IF EXISTS honesty_calibrations_isolation    ON public.honesty_calibrations;
DROP POLICY IF EXISTS mood_fingerprints_isolation       ON public.mood_fingerprints;
DROP POLICY IF EXISTS motivation_modulators_isolation   ON public.motivation_modulators;
DROP POLICY IF EXISTS applications_isolation            ON public.applications;
DROP POLICY IF EXISTS outcomes_isolation                ON public.outcomes;
DROP POLICY IF EXISTS gdpr_packets_isolation            ON public.gdpr_packets;
DROP POLICY IF EXISTS profiles_isolation                ON public.profiles;
DROP POLICY IF EXISTS onboarding_sessions_isolation     ON public.onboarding_sessions;
DROP POLICY IF EXISTS onboarding_events_isolation       ON public.onboarding_events;
DROP POLICY IF EXISTS resume_ingestions_isolation       ON public.resume_ingestions;
DROP POLICY IF EXISTS generation_requests_isolation     ON public.generation_requests;
DROP POLICY IF EXISTS resume_extraction_audit_isolation ON public.resume_extraction_audit;
DROP POLICY IF EXISTS generation_model_calls_isolation  ON public.generation_model_calls;

-- ── Drop generation-scoped policies ───────────────────────────────
DROP POLICY IF EXISTS blackboard_snapshots_isolation         ON public.blackboard_snapshots;
DROP POLICY IF EXISTS audit_entries_isolation                ON public.audit_entries;
DROP POLICY IF EXISTS conflicts_isolation                    ON public.conflicts;
DROP POLICY IF EXISTS goals_isolation                        ON public.goals;
DROP POLICY IF EXISTS active_questions_isolation             ON public.active_questions;
DROP POLICY IF EXISTS evidence_spans_isolation               ON public.evidence_spans;
DROP POLICY IF EXISTS emotional_states_isolation             ON public.emotional_states;
DROP POLICY IF EXISTS emotional_state_corrections_isolation  ON public.emotional_state_corrections;
DROP POLICY IF EXISTS documents_isolation                    ON public.documents;

-- ── Drop service-role-only policies ───────────────────────────────
DROP POLICY IF EXISTS stripe_events_deny_all      ON public.stripe_events;
DROP POLICY IF EXISTS security_audit_log_deny_all ON public.security_audit_log;

-- ── Disable ROW LEVEL SECURITY on tables we enabled ───────────────
ALTER TABLE public.generations             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_centroids         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.honesty_calibrations    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_fingerprints       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.motivation_modulators   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.outcomes                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_packets            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_events       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_ingestions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_requests     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_extraction_audit DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_model_calls  DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.blackboard_snapshots         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_entries                DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflicts                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals                        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_questions             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_spans               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_states             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.emotional_state_corrections  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                    DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_events       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log  NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_packets        NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events       NO FORCE ROW LEVEL SECURITY;
