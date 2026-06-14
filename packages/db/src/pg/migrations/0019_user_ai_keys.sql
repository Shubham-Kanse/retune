-- 0019_user_ai_keys.sql
-- BYOK (bring-your-own-key): per-user LLM provider API keys.
--
-- Keys are AES-256-GCM encrypted at the application layer
-- (RETUNE_BYOK_ENCRYPTION_KEY) before they reach this table; the column
-- never holds plaintext. `key_last4` exists solely for masked display.
-- One key per (user, provider); re-adding replaces.

CREATE TABLE IF NOT EXISTS user_ai_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(16) NOT NULL,
  encrypted_key TEXT NOT NULL,
  key_last4 VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_ai_keys_user_provider_uniq UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS user_ai_keys_user_ix ON user_ai_keys (user_id);
