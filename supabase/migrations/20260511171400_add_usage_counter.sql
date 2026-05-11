-- Add cached usage counter to subscriptions table to avoid expensive SUM queries

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0;

-- Backfill from usage_records
UPDATE public.billing_subscriptions s
SET credits_used = COALESCE((
  SELECT SUM(cost_usd)::INTEGER
  FROM public.usage_records u
  WHERE u.user_id = s.user_id
    AND u.cost_usd IS NOT NULL
    AND u.type IN ('generation', 'refinement')
), 0);

-- Create trigger to maintain counter
CREATE OR REPLACE FUNCTION public.update_subscription_credits()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.cost_usd IS NOT NULL AND NEW.type IN ('generation', 'refinement') THEN
      UPDATE public.billing_subscriptions
      SET credits_used = credits_used + NEW.cost_usd::INTEGER
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS usage_records_update_credits ON public.usage_records;

CREATE TRIGGER usage_records_update_credits
  AFTER INSERT ON public.usage_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_subscription_credits();
