-- 0013_generation_model_calls.sql
-- Charter 09 Epic 03 — per-call AI cost telemetry persistence.
--
-- Today `packages/agent/src/lib/provider-shared.ts` records a
-- `ModelCallTelemetry` object for every LLM call into a per-process
-- buffer. The buffer is dropped on process exit. This table gives that
-- buffer a permanent target so cost attribution survives restarts and
-- powers per-user daily limits.

CREATE TABLE IF NOT EXISTS generation_model_calls (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id    UUID         NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  tick_seq         INTEGER      NOT NULL,
  specialist       TEXT         NOT NULL,
  agent_name       TEXT         NOT NULL,
  provider         TEXT         NOT NULL,    -- 'openai' | 'anthropic'
  model            TEXT         NOT NULL,
  quality_mode     TEXT,                     -- 'fast' | 'balanced' | 'frontier'
  prompt_tokens    INTEGER      NOT NULL DEFAULT 0,
  completion_tokens INTEGER     NOT NULL DEFAULT 0,
  cached_tokens    INTEGER      NOT NULL DEFAULT 0,
  cost_usd         NUMERIC(12,6) NOT NULL DEFAULT 0,
  latency_ms       INTEGER      NOT NULL DEFAULT 0,
  cached           BOOLEAN      NOT NULL DEFAULT FALSE,
  error            TEXT,
  request_hash     TEXT,                     -- short sha256 prefix; for replay matching
  response_hash    TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Atomicity: every (generation_id, tick_seq, specialist, agent_name) is
-- a single LLM call site. Insert with onConflictDoNothing on this key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmc_call_site
  ON generation_model_calls (generation_id, tick_seq, specialist, agent_name);

-- Per-user daily cost gate query path:
-- SELECT SUM(cost_usd) FROM generation_model_calls JOIN generations ON gen_id
-- WHERE user_id = ? AND created_at > now() - interval '24h'.
CREATE INDEX IF NOT EXISTS idx_gmc_generation_created
  ON generation_model_calls (generation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmc_provider_model
  ON generation_model_calls (provider, model, created_at DESC);
