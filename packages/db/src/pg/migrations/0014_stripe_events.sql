-- 0014_stripe_events.sql
-- Charter 03 Epic 03 — Stripe webhook idempotency + 7-year retention.
--
-- Every Stripe webhook event is persisted by its `event.id` BEFORE the
-- billing logic runs. If the same event is delivered twice, the second
-- attempt is rejected at the unique-constraint level — the billing
-- handler never runs twice. Also gives the team a queryable history of
-- every billing event for auditing and tax retention (Charter 03 Epic 06).

CREATE TABLE IF NOT EXISTS stripe_events (
  -- Stripe's event id (e.g. 'evt_1234abcd'). Unique → idempotency.
  id              TEXT         PRIMARY KEY,
  event_type      TEXT         NOT NULL,    -- 'invoice.paid', 'customer.subscription.created', etc.
  api_version     TEXT,                     -- Stripe API version that produced the event
  livemode        BOOLEAN      NOT NULL,
  -- Raw payload for replay/audit. Strip PII at retention sweep time.
  payload         JSONB        NOT NULL,
  -- The user/subscription this event affects (denormalised for queries).
  user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
  customer_id     TEXT,                     -- Stripe customer id
  subscription_id TEXT,                     -- Stripe subscription id (if applicable)
  -- Processing status — populated by the webhook handler.
  status          TEXT         NOT NULL DEFAULT 'received',  -- 'received' | 'processed' | 'failed' | 'replayed'
  processing_error TEXT,
  processed_at    TIMESTAMPTZ,
  retry_count     INTEGER      NOT NULL DEFAULT 0,
  signature       TEXT,                     -- Stripe-Signature header for audit
  received_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Common query paths.
CREATE INDEX IF NOT EXISTS idx_stripe_events_user
  ON stripe_events (user_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_customer
  ON stripe_events (customer_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_subscription
  ON stripe_events (subscription_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_events_type
  ON stripe_events (event_type, received_at DESC);

-- Unprocessed-event monitor — alerts if a webhook handler fails repeatedly.
CREATE INDEX IF NOT EXISTS idx_stripe_events_status
  ON stripe_events (status, received_at)
  WHERE status IN ('received', 'failed');
