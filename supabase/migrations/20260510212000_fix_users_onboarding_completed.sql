-- Ensure legacy-compatible Drizzle column exists for runtime code paths.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Keep the legacy + new flag aligned for existing rows.
UPDATE public.users
SET onboarding_completed = COALESCE(onboarding_completed, onboarding_complete, false)
WHERE onboarding_completed IS DISTINCT FROM COALESCE(onboarding_complete, false);
