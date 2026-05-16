-- 004 Career Profile Intelligence SOTA upgrade — pglite mirror.
--
-- Pglite is used by `pnpm test` and dev runs without a real Postgres.
-- The migrator runs SQL files in lexical order, so this number must
-- come after 0007_generation_requests.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_understanding JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_understanding_version TEXT NOT NULL DEFAULT 'career-understanding-v1';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_understanding_fingerprint TEXT;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_understanding_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_understanding_stale_since TIMESTAMPTZ;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS career_understanding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_career_understanding_stale_ix
  ON profiles (career_understanding_stale_since)
  WHERE career_understanding_stale_since IS NOT NULL;
