-- Compatibility fix:
-- Current runtime insert path does not provide generations.profile_snapshot,
-- while optimized schema requires NOT NULL.
-- Set a safe JSON default so inserts succeed.

ALTER TABLE public.generations
  ALTER COLUMN profile_snapshot SET DEFAULT '{}'::jsonb;

UPDATE public.generations
SET profile_snapshot = '{}'::jsonb
WHERE profile_snapshot IS NULL;

