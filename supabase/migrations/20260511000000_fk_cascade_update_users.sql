-- Make FKs referencing users.id cascade on UPDATE
-- so Google auth account merges work without FK violations.

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_user_id_fkey,
  ADD CONSTRAINT billing_subscriptions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.onboarding_conversations
  DROP CONSTRAINT IF EXISTS onboarding_conversations_user_id_fkey,
  ADD CONSTRAINT onboarding_conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_id_fkey,
  ADD CONSTRAINT profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE CASCADE;
