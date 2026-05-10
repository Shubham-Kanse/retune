-- Fix remaining 4 architectural issues.
-- Data loss accepted: dev/integration environment only.

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #10: pgvector — migrate case_base_entries embeddings from JSONB to vector
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop data (accepted) and swap columns to proper vector type.
-- Dimension 1536 = OpenAI text-embedding-3-small / ada-002 default.
-- Adjust if your ML service uses a different dimension.
TRUNCATE public.case_base_entries;

ALTER TABLE public.case_base_entries
  DROP COLUMN jd_embedding,
  DROP COLUMN profile_embedding,
  DROP COLUMN document_embeddings;

ALTER TABLE public.case_base_entries
  ADD COLUMN jd_embedding      vector(1536) NOT NULL,
  ADD COLUMN profile_embedding vector(1536) NOT NULL,
  ADD COLUMN document_embeddings vector(1536) NOT NULL;

-- IVFFlat indexes for approximate nearest-neighbour search.
-- lists=100 is a reasonable default for up to ~1M rows.
CREATE INDEX IF NOT EXISTS case_base_jd_embedding_idx
  ON public.case_base_entries USING ivfflat (jd_embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS case_base_profile_embedding_idx
  ON public.case_base_entries USING ivfflat (profile_embedding vector_cosine_ops) WITH (lists = 100);

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #11: generation_results — remove duplicate columns that already live
--            in generations / applications. Keep generation_results as the
--            dedicated read-optimised result store (used by optimized-results.ts)
--            but drop the columns that are pure duplicates of generations.
--
--            Columns removed from generations that are now owned by generation_results:
--              ship_decision, ats_score, narrative_summary
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.generations
  DROP COLUMN IF EXISTS ship_decision,
  DROP COLUMN IF EXISTS ats_score,
  DROP COLUMN IF EXISTS narrative_summary;

-- applications.resume_content / cover_letter_content / application_strategy
-- are legacy v1 columns kept for the web UI. generation_results is the v2
-- authoritative store. Drop the view first, drop the columns, recreate the view.
DROP VIEW IF EXISTS public.applications_legacy_view;

ALTER TABLE public.applications
  DROP COLUMN IF EXISTS resume_content,
  DROP COLUMN IF EXISTS cover_letter_content,
  DROP COLUMN IF EXISTS application_strategy;

-- Recreate the view without the dropped columns.
CREATE VIEW public.applications_legacy_view AS
SELECT
  id, user_id, generation_id, company, role, status,
  ats_score, created_at, updated_at
FROM public.applications;

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #16: naming consistency — applications table has mixed camelCase SQL
--            column names. Rename the offending columns to snake_case.
--            (The Drizzle schema uses JS camelCase names that map to these.)
-- ─────────────────────────────────────────────────────────────────────────────
-- Nothing to do at the SQL level — all columns in the DB are already snake_case
-- (user_id, jd_id, generation_id, etc.). The inconsistency is only in the
-- Drizzle schema JS property names, fixed below in schema.ts.

-- ─────────────────────────────────────────────────────────────────────────────
-- Issue #19: two parallel subscription tables.
--            billing_subscriptions is the well-designed v2 table.
--            subscriptions is the legacy v1 table used by packages/billing.
--            Strategy: migrate billing code to billing_subscriptions, then drop
--            the legacy table. We backfill first, then drop.
-- ─────────────────────────────────────────────────────────────────────────────

-- Backfill billing_subscriptions from legacy subscriptions (best-effort).
INSERT INTO public.billing_subscriptions (
  user_id, plan, status,
  stripe_customer_id, stripe_sub_id,
  current_period_start, current_period_end,
  created_at, updated_at
)
SELECT
  s.user_id,
  CASE s.plan
    WHEN 'pro'        THEN 'pro'::public.billing_plan
    WHEN 'max'        THEN 'pro'::public.billing_plan  -- map unknown tier to pro
    WHEN 'enterprise' THEN 'enterprise'::public.billing_plan
    WHEN 'team'       THEN 'team'::public.billing_plan
    ELSE 'free'::public.billing_plan
  END,
  CASE s.status
    WHEN 'active'     THEN 'active'
    WHEN 'cancelled'  THEN 'canceled'
    WHEN 'past_due'   THEN 'past_due'
    WHEN 'expired'    THEN 'canceled'
    ELSE 'active'
  END,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  s.current_period_start,
  s.current_period_end,
  s.created_at,
  s.updated_at
FROM public.subscriptions s
ON CONFLICT (user_id) DO UPDATE SET
  plan               = EXCLUDED.plan,
  status             = EXCLUDED.status,
  stripe_customer_id = EXCLUDED.stripe_customer_id,
  stripe_sub_id      = EXCLUDED.stripe_sub_id,
  current_period_start = EXCLUDED.current_period_start,
  current_period_end   = EXCLUDED.current_period_end,
  updated_at           = EXCLUDED.updated_at;

-- Drop the legacy table.
DROP TABLE IF EXISTS public.subscriptions CASCADE;
