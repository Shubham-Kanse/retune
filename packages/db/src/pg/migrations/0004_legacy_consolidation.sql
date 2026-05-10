-- Legacy v1 consolidation: absorb the SQLite-only tables into Postgres.
-- See packages/db/src/pg/schema.ts and MIGRATION.md.
--
-- Idempotent (uses IF NOT EXISTS / IF EXISTS guards) so it can be applied
-- to a fresh DB or an existing one with the cognitive tables already in
-- place.

-- ─────────── users: auth fields + camelCase column defaults ───────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar(32) NOT NULL DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token text;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
-- Relax cognitive-only fields so signup doesn't have to provide them
ALTER TABLE users ALTER COLUMN persona_type SET DEFAULT 'experienced_ic';
ALTER TABLE users ALTER COLUMN market SET DEFAULT 'US';
ALTER TABLE users ALTER COLUMN locale SET DEFAULT 'en-US';

-- ─────────── applications: relax FK + absorb v1 columns ───────────

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_generation_id_generations_id_fk;
ALTER TABLE applications ALTER COLUMN generation_id DROP NOT NULL;
ALTER TABLE applications
  ADD CONSTRAINT applications_generation_id_generations_id_fk
  FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE SET NULL;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT 'Unknown';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS role_title text NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS job_description text NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS jd_url text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS market varchar(8) NOT NULL DEFAULT 'us';
ALTER TABLE applications ADD COLUMN IF NOT EXISTS current_step text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS steps_completed text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS pipeline_log text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS company_intel text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_content text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter_content text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_strategy text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ats_score double precision;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ats_report text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_docx_path text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_pdf_path text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter_docx_path text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter_pdf_path text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS refinement_history text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_version integer NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS generation_duration_ms integer;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS token_usage text;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS applications_user_created_ix
  ON applications (user_id, created_at);
CREATE INDEX IF NOT EXISTS applications_user_company_ix
  ON applications (user_id, company_name);

-- ─────────── profiles ───────────

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  linkedin text,
  location text NOT NULL,
  visa_status text,
  relocation_preferences text,
  target_roles text NOT NULL,
  experience_level text,
  current_title text,
  experience text NOT NULL,
  education text NOT NULL,
  certifications text,
  projects text,
  skills_tier1 text,
  skills_tier2 text,
  skills_tier3 text,
  voice_notes text,
  profile_markdown text NOT NULL,
  completeness_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── onboarding_conversations ───────────

CREATE TABLE IF NOT EXISTS onboarding_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  messages text NOT NULL,
  stage text NOT NULL DEFAULT 'upload',
  resume_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── subscriptions ───────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── password_reset_tokens ───────────

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── processor_consents ───────────

CREATE TABLE IF NOT EXISTS processor_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  processor text NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── contest_log ───────────

CREATE TABLE IF NOT EXISTS contest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────── ab_test_assignments ───────────

CREATE TABLE IF NOT EXISTS ab_test_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  experiment_id text NOT NULL,
  variant text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ab_user_experiment_ix
  ON ab_test_assignments (user_id, experiment_id);

-- ─────────── usage_records ───────────

CREATE TABLE IF NOT EXISTS usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  application_id uuid REFERENCES applications(id) ON DELETE SET NULL,
  token_usage text,
  cost_usd double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_type_created_ix
  ON usage_records (user_id, type, created_at);
CREATE INDEX IF NOT EXISTS usage_user_app_type_created_ix
  ON usage_records (user_id, application_id, type, created_at);
