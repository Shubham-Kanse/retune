-- Add RLS policies for all tables that had RLS enabled but no policies.

-- ── User-owned tables (direct user_id column) ─────────────────────────────────
ALTER TABLE public.ab_test_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_usage             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contest_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_preflights     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_results        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processor_consents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions             ENABLE ROW LEVEL SECURITY;

CREATE POLICY ab_test_assignments_isolation      ON public.ab_test_assignments      USING (user_id = public.current_user_id());
CREATE POLICY billing_subscriptions_isolation    ON public.billing_subscriptions    USING (user_id = public.current_user_id());
CREATE POLICY billing_usage_isolation            ON public.billing_usage            USING (user_id = public.current_user_id());
CREATE POLICY contest_log_isolation              ON public.contest_log              USING (user_id = public.current_user_id());
CREATE POLICY generation_preflights_isolation    ON public.generation_preflights    USING (user_id = public.current_user_id());
CREATE POLICY job_descriptions_isolation         ON public.job_descriptions         USING (user_id = public.current_user_id());
CREATE POLICY oauth_accounts_isolation           ON public.oauth_accounts           USING (user_id = public.current_user_id());
CREATE POLICY onboarding_conversations_isolation ON public.onboarding_conversations USING (user_id = public.current_user_id());
CREATE POLICY password_reset_tokens_isolation    ON public.password_reset_tokens    USING (user_id = public.current_user_id());
CREATE POLICY processor_consents_isolation       ON public.processor_consents       USING (user_id = public.current_user_id());
CREATE POLICY usage_records_isolation            ON public.usage_records            USING (user_id = public.current_user_id());
CREATE POLICY user_sessions_isolation            ON public.user_sessions            USING (user_id = public.current_user_id());

-- generation_results: scoped via generation → user
CREATE POLICY generation_results_isolation ON public.generation_results
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

-- ── Profile sub-tables (scoped via profiles → user) ───────────────────────────
ALTER TABLE public.profile_education   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_skills      ENABLE ROW LEVEL SECURITY;

CREATE POLICY profile_education_isolation ON public.profile_education
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = public.current_user_id()));
CREATE POLICY profile_experiences_isolation ON public.profile_experiences
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = public.current_user_id()));
CREATE POLICY profile_skills_isolation ON public.profile_skills
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = public.current_user_id()));

-- ── Onboarding turns (scoped via onboarding_conversations → user) ─────────────
ALTER TABLE public.onboarding_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_turns_isolation ON public.onboarding_turns
  USING (onboarding_conversation_id IN (
    SELECT id FROM public.onboarding_conversations WHERE user_id = public.current_user_id()
  ));

-- ── GDPR deletion log: admin/service-role only, no user self-access ───────────
ALTER TABLE public.gdpr_deletion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY gdpr_deletion_log_deny_all ON public.gdpr_deletion_log USING (false);

-- ── Generation audit packets: user can read their own ─────────────────────────
ALTER TABLE public.generation_audit_packets ENABLE ROW LEVEL SECURITY;
CREATE POLICY generation_audit_packets_isolation ON public.generation_audit_packets
  USING (generation_id IN (SELECT id FROM public.generations WHERE user_id = public.current_user_id()));

-- ── Shared/reference tables: readable by all authenticated users, no user filter
ALTER TABLE public.jd_clusters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jds               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jd_analysis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_ontology    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ontology_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_base_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY jd_clusters_read       ON public.jd_clusters       FOR SELECT USING (true);
CREATE POLICY jds_read               ON public.jds               FOR SELECT USING (true);
CREATE POLICY jd_analysis_read       ON public.jd_analysis       FOR SELECT USING (true);
CREATE POLICY skill_ontology_read    ON public.skill_ontology    FOR SELECT USING (true);
CREATE POLICY ontology_versions_read ON public.ontology_versions FOR SELECT USING (true);
-- case_base_entries: only opt-in rows are visible to authenticated users
CREATE POLICY case_base_entries_read ON public.case_base_entries FOR SELECT USING (opt_in = true);
