-- Keep legacy + new onboarding flags in sync for compatibility.
-- Legacy/runtime: users.onboarding_completed
-- Product schema: users.onboarding_complete

CREATE OR REPLACE FUNCTION public.sync_users_onboarding_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed THEN
    NEW.onboarding_complete := NEW.onboarding_completed;
  ELSIF NEW.onboarding_complete IS DISTINCT FROM OLD.onboarding_complete THEN
    NEW.onboarding_completed := NEW.onboarding_complete;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_onboarding_flags ON public.users;

CREATE TRIGGER users_sync_onboarding_flags
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_users_onboarding_flags();
