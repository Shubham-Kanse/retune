-- Backfill compatibility columns for runtime queries that sort/filter by created_at.
-- Supabase migrations already add these in some environments; local pg/pglite
-- migrations need the same guarantees.

ALTER TABLE voice_centroids
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE honesty_calibrations
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

