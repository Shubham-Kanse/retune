-- Profiles v2: explicit columns for personal info + JSONB for structured sections
-- Destructive — no production data.

DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS profile_skills CASCADE;
DROP TABLE IF EXISTS profile_experiences CASCADE;
DROP TABLE IF EXISTS profile_education CASCADE;

CREATE TABLE profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Personal (must-have)
  full_name             TEXT NOT NULL DEFAULT '',
  email                 TEXT NOT NULL DEFAULT '',
  phone                 TEXT,
  city                  TEXT,
  country               TEXT,
  linkedin_url          TEXT,

  -- Personal (good-to-have)
  headline              TEXT,
  github_url            TEXT,
  portfolio_url         TEXT,
  website_url           TEXT,
  twitter_url           TEXT,

  -- Skills (must-have)
  technical_skills      TEXT[] NOT NULL DEFAULT '{}',
  professional_skills   TEXT[] NOT NULL DEFAULT '{}',

  -- Additional
  professional_summary  TEXT,
  nationality           TEXT,
  work_authorization    TEXT,

  -- Structured sections (JSONB)
  experience            JSONB NOT NULL DEFAULT '[]',
  education             JSONB NOT NULL DEFAULT '[]',
  certifications        JSONB NOT NULL DEFAULT '[]',
  projects              JSONB NOT NULL DEFAULT '[]',
  languages             JSONB NOT NULL DEFAULT '[]',
  volunteering          JSONB NOT NULL DEFAULT '[]',
  publications          JSONB NOT NULL DEFAULT '[]',
  awards                JSONB NOT NULL DEFAULT '[]',
  conferences           JSONB NOT NULL DEFAULT '[]',
  hobbies               TEXT[] DEFAULT '{}',
  "references"          JSONB NOT NULL DEFAULT '[]',

  -- Meta
  completeness_tier     TEXT NOT NULL DEFAULT 'incomplete',
  profile_markdown      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX profiles_user_ux ON profiles(user_id);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profiles" ON profiles FOR ALL USING (user_id = auth.uid());
