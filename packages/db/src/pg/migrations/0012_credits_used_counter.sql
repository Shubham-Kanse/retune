-- 0012_credits_used_counter.sql
-- Charter 03 Epic 01 — billing integrity quick win.
--
-- Adds a denormalised `credits_used` counter on `billing_subscriptions`
-- so `atomicCheckGeneration` no longer runs a `COALESCE(SUM(usage_records.cost_usd))`
-- table scan on every generation request.
--
-- Backfill from existing `usage_records` with a single SUM per user.
-- Going forward, `credits_used` is incremented atomically inside the
-- generation/refinement transaction, and resets to 0 on plan rollover.

ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0;

ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS credits_reset_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill from usage_records (one-time, single transaction).
-- Assumes usage_records.cost_usd is the credit count (NOT a USD value).
-- Adjust column name if the production schema diverges.
UPDATE billing_subscriptions s
SET credits_used = COALESCE((
  SELECT SUM(u.cost_usd)::INTEGER
  FROM usage_records u
  WHERE u.user_id = s.user_id
    AND u.created_at > s.credits_reset_at
), 0);

-- Index for dashboard queries that filter by approaching limits.
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_credits_used
  ON billing_subscriptions (user_id, credits_used);
