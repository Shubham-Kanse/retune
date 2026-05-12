-- Onboarding v2: conversational session + background extraction jobs
-- Replaces the old onboarding_conversations table (kept for backward compat, not dropped here)

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Conversation state machine stage
  -- greeting | upload_pending | extracting | reviewing_experience |
  -- reviewing_skills | reviewing_education | inferring_roles |
  -- collecting_missing | complete
  stage               TEXT NOT NULL DEFAULT 'greeting',

  -- Full message history: [{ role, content, chips?, card?, ts }]
  messages            JSONB NOT NULL DEFAULT '[]',

  -- Live profile delta — patched after every confirmed turn
  profile_delta       JSONB NOT NULL DEFAULT '{}',

  -- Extraction job linkage
  extraction_status   TEXT DEFAULT NULL,   -- null | pending | done | failed
  extraction_result   JSONB DEFAULT NULL,

  -- Completeness tracking
  hard_minimum_met    BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_sections  TEXT[]  NOT NULL DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_extraction_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  filename        TEXT NOT NULL,
  content_hash    VARCHAR(64) NOT NULL,
  extracted_json  JSONB DEFAULT NULL,
  error_code      TEXT DEFAULT NULL,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_sessions_user_idx
  ON onboarding_sessions(user_id);

CREATE INDEX IF NOT EXISTS onboarding_extraction_jobs_session_idx
  ON onboarding_extraction_jobs(session_id);

CREATE INDEX IF NOT EXISTS onboarding_extraction_jobs_hash_idx
  ON onboarding_extraction_jobs(user_id, content_hash);

-- RLS
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_extraction_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_onboarding_sessions"
  ON onboarding_sessions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "users_own_extraction_jobs"
  ON onboarding_extraction_jobs FOR ALL
  USING (user_id = auth.uid());
