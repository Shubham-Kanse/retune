-- Disable auto-create trigger - let application code handle user creation
-- The trigger was causing conflicts with application-level user creation logic

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_auth_user();
