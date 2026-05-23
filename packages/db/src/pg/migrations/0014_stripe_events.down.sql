-- 0014_stripe_events.down.sql
-- Charter 18-Migrations Epic 01 — reversible migration for the
-- stripe_events table introduced in 0014.

DROP INDEX IF EXISTS idx_stripe_events_user;
DROP INDEX IF EXISTS idx_stripe_events_customer;
DROP INDEX IF EXISTS idx_stripe_events_subscription;
DROP INDEX IF EXISTS idx_stripe_events_type;
DROP INDEX IF EXISTS idx_stripe_events_status;

DROP TABLE IF EXISTS stripe_events;
