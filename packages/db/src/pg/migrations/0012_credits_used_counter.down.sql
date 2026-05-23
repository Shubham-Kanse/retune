-- 0012_credits_used_counter.down.sql
-- Charter 18-Migrations Epic 01 — reversible migration for the
-- billing_subscriptions counter columns introduced in 0012.
--
-- Note: backfill from this migration cannot be reversed. After down +
-- up the counter restarts from a fresh SUM of usage_records, which is
-- the same as the original up migration's behaviour, so this is safe.

DROP INDEX IF EXISTS idx_billing_subscriptions_credits_used;

ALTER TABLE billing_subscriptions DROP COLUMN IF EXISTS credits_reset_at;
ALTER TABLE billing_subscriptions DROP COLUMN IF EXISTS credits_used;
