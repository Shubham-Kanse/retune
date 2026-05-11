-- Align profiles.completeness_score with app/runtime expectations.
-- App writes integer percentages (0..100), but an earlier schema used NUMERIC(4,3) in [0,1].
-- This migration converts existing values safely and enforces the 0..100 range.

DO $$
DECLARE
  c RECORD;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'completeness_score'
  ) THEN
    -- Drop existing checks that mention completeness_score (including legacy <= 1 constraint).
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = 'profiles'
        AND pg_get_constraintdef(con.oid) ILIKE '%completeness_score%'
    LOOP
      EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', c.conname);
    END LOOP;

    ALTER TABLE public.profiles
      ALTER COLUMN completeness_score TYPE integer
      USING (
        CASE
          WHEN completeness_score IS NULL THEN 0
          WHEN completeness_score <= 1 THEN round(completeness_score * 100)::integer
          ELSE round(completeness_score)::integer
        END
      ),
      ALTER COLUMN completeness_score SET DEFAULT 0,
      ALTER COLUMN completeness_score SET NOT NULL;

    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_completeness_score_range_check
      CHECK (completeness_score >= 0 AND completeness_score <= 100);
  END IF;
END $$;

