-- billing_subscriptions is missing cancel_at_period_end (legacy subscriptions had it,
-- billing_subscriptions only has canceled_at). Add it so the Drizzle schema matches.
ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
