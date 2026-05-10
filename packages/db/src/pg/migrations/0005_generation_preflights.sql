CREATE TABLE IF NOT EXISTS generation_preflights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jd_hash varchar(64) NOT NULL,
  severity varchar(16) NOT NULL DEFAULT 'none',
  missing_must_have jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_good_to_have jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_preflights_user_hash_ix
  ON generation_preflights (user_id, jd_hash);

CREATE INDEX IF NOT EXISTS generation_preflights_expires_ix
  ON generation_preflights (expires_at);
