-- Migration 0003 — emotional state, mood fingerprint, motivation modulator tables
-- These were defined in schema.ts but missing from the initial migration.

CREATE TABLE IF NOT EXISTS emotional_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id uuid REFERENCES generations(id) ON DELETE CASCADE,
  valence double precision NOT NULL,
  arousal double precision NOT NULL,
  dominance double precision NOT NULL,
  primary_emotion varchar(32) NOT NULL,
  confidence double precision NOT NULL,
  source_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emotional_states_user_ix ON emotional_states (user_id, created_at);
CREATE INDEX IF NOT EXISTS emotional_states_gen_ix ON emotional_states (generation_id);

CREATE TABLE IF NOT EXISTS emotional_state_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emotional_state_id uuid NOT NULL REFERENCES emotional_states(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  corrected_emotion varchar(32) NOT NULL,
  feedback_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mood_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  valence_avg double precision NOT NULL,
  arousal_avg double precision NOT NULL,
  dominance_avg double precision NOT NULL,
  stability double precision NOT NULL,
  sample_window_hours integer NOT NULL DEFAULT 168,
  sample_count integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mood_fingerprints_user_ix ON mood_fingerprints (user_id, computed_at);

CREATE TABLE IF NOT EXISTS motivation_modulators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_type varchar(64) NOT NULL,
  drive_level double precision NOT NULL,
  reward_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_reward_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS motivation_user_claim_ux ON motivation_modulators (user_id, claim_type);
