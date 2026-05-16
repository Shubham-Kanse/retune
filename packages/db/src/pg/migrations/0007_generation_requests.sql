-- 003 SOTA upgrade: durable generation request envelope.
--
-- This table mirrors the API-side StartGenerationCommand so the system
-- can:
--   1. Idempotency — duplicate POST /generate with the same
--      (user_id, idempotency_key) returns the existing generation_id
--      instead of creating a new one.
--   2. Audit — every generation request is captured before any
--      cognitive work happens.
--   3. Resume — a Temporal workflow that crashes mid-flight can
--      reconstruct its full input payload by joining on this table.
--
-- The hash and idempotency key are bounded; the JD text is referenced
-- by a separate jd row to keep this table small.
CREATE TABLE IF NOT EXISTS generation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  application_id uuid,
  jd_id uuid REFERENCES jds(id) ON DELETE SET NULL,
  jd_hash varchar(128) NOT NULL,
  idempotency_key varchar(256) NOT NULL,
  command jsonb NOT NULL,
  market varchar(8) NOT NULL DEFAULT 'US',
  quality_mode varchar(16) NOT NULL DEFAULT 'balanced',
  output_suite jsonb NOT NULL DEFAULT '["resume"]'::jsonb,
  preflight_id uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency uniqueness is per-user — different users may legitimately
-- choose the same key.
CREATE UNIQUE INDEX IF NOT EXISTS generation_requests_user_idem_ux
  ON generation_requests (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS generation_requests_jd_hash_ix
  ON generation_requests (jd_hash);

CREATE INDEX IF NOT EXISTS generation_requests_generation_ix
  ON generation_requests (generation_id);
