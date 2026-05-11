-- Fix: Properly wire auth.users and public.users
-- 
-- PROBLEM:
-- 1. auth.users (Supabase managed) and public.users (app managed) are separate tables
-- 2. When user deleted from auth.users, public.users row persists with old onboarding state
-- 3. Google OAuth creates new auth.users UUID but finds old public.users by email
-- 4. Old public.users has onboarding_completed=true, so redirects to dashboard
--
-- SOLUTION:
-- 1. Cascade delete from auth.users to public.users (already added in 20260511165200)
-- 2. Auto-create public.users when auth.users created (already added in 20260511165300)
-- 3. Reset onboarding when auth provider changes (this migration)

-- When merging accounts (email -> Google), reset onboarding if it was never actually completed
CREATE OR REPLACE FUNCTION public.handle_auth_provider_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If auth_provider is changing and onboarding_completed_at is NULL,
  -- it means onboarding was never truly completed, so reset the flag
  IF NEW.auth_provider IS DISTINCT FROM OLD.auth_provider 
     AND OLD.onboarding_completed_at IS NULL 
     AND OLD.onboarding_completed = true THEN
    NEW.onboarding_completed := false;
    NEW.onboarding_complete := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_provider_change ON public.users;

CREATE TRIGGER on_auth_provider_change
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  WHEN (NEW.auth_provider IS DISTINCT FROM OLD.auth_provider)
  EXECUTE FUNCTION public.handle_auth_provider_change();
