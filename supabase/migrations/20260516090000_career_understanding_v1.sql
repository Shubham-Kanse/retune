-- 004 Career Profile Intelligence SOTA upgrade.
-- Adds persistent storage for CareerUnderstandingV1 — Retune's derived
-- interpretation of a candidate's career facts.
--
-- The understanding is stored alongside CareerProfileV1 in the same row so a
-- single read returns both, but the columns are deliberately separate so AI
-- interpretation never mutates user facts.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS career_understanding JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS career_understanding_version TEXT NOT NULL DEFAULT 'career-understanding-v1',
  ADD COLUMN IF NOT EXISTS career_understanding_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS career_understanding_revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS career_understanding_stale_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS career_understanding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_career_understanding_stale_ix
  ON public.profiles (career_understanding_stale_since)
  WHERE career_understanding_stale_since IS NOT NULL;
