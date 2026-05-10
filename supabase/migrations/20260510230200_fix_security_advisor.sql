-- Fix Security Advisor error: applications_legacy_view must use SECURITY INVOKER.
-- Supabase creates views as SECURITY DEFINER by default; explicitly set INVOKER
-- so the view respects the calling user's RLS policies.
DROP VIEW IF EXISTS public.applications_legacy_view;

CREATE VIEW public.applications_legacy_view
  WITH (security_invoker = true)
AS
SELECT
  id, user_id, generation_id, company, role, status,
  ats_score, created_at, updated_at
FROM public.applications;
