-- SOTA Onboarding: clean slate for onboarding_sessions
-- Destructive — no production data exists.

DROP TABLE IF EXISTS onboarding_extraction_jobs;
DROP TABLE IF EXISTS onboarding_sessions;

CREATE TABLE onboarding_sessions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_chain_id        TEXT,
  target_role              TEXT,
  onboarding_state         TEXT NOT NULL DEFAULT 'greeting',
  messages                 JSONB NOT NULL DEFAULT '[]',
  profile_delta            JSONB NOT NULL DEFAULT '{}',
  evidence_readiness_score REAL NOT NULL DEFAULT 0,
  turn_count               INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX onboarding_sessions_user_ux ON onboarding_sessions(user_id);

ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sessions"
  ON onboarding_sessions FOR ALL
  USING (user_id = auth.uid());
