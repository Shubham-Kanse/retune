-- Retune Postgres bootstrap migration (commit #3).
--
-- Hand-rolled from packages/db/src/pg/schema.ts. Subsequent migrations
-- will be drizzle-kit generated; this initial one is authored explicitly
-- so commit #3 can land without introducing drizzle-kit as a runtime
-- dependency of the test suite.
--
-- Compatible with real Postgres 15+ AND pglite (which ships with
-- pgcrypto but NOT uuid-ossp; we rely on pgcrypto's gen_random_uuid).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────── users ───────────────

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  persona_type varchar(32) NOT NULL,
  market varchar(8) NOT NULL,
  locale varchar(16) NOT NULL,
  kms_key_id text,
  onboarding_completed_at timestamptz,
  data_residency_region varchar(8) NOT NULL DEFAULT 'us',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ux ON users (email) WHERE deleted_at IS NULL;

-- ─────────────── jds + clusters ───────────────

CREATE TABLE IF NOT EXISTS jd_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_hash varchar(64) NOT NULL UNIQUE,
  analysis_blob jsonb,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source varchar(32) NOT NULL,
  url text,
  content_hash varchar(64) NOT NULL,
  raw_text text NOT NULL,
  parsed_at timestamptz,
  cluster_id uuid REFERENCES jd_clusters(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jds_content_hash_ix ON jds (content_hash);
CREATE INDEX IF NOT EXISTS jds_cluster_ix ON jds (cluster_id);

-- ─────────────── generations ───────────────

CREATE TABLE IF NOT EXISTS generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jd_id uuid REFERENCES jds(id) ON DELETE SET NULL,
  ontology_version varchar(32) NOT NULL,
  termination varchar(32),
  ticks_executed integer NOT NULL DEFAULT 0,
  total_cost_usd double precision NOT NULL DEFAULT 0,
  total_latency_ms integer NOT NULL DEFAULT 0,
  current_blackboard jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS generations_user_ix ON generations (user_id);
CREATE INDEX IF NOT EXISTS generations_jd_ix ON generations (jd_id);

CREATE TABLE IF NOT EXISTS blackboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blackboard_snapshots_gen_seq_ux
  ON blackboard_snapshots (generation_id, seq);

CREATE TABLE IF NOT EXISTS audit_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  specialist varchar(128) NOT NULL,
  micro_stage varchar(128),
  inputs_hash varchar(64) NOT NULL,
  output_hash varchar(64) NOT NULL,
  justification text,
  model_version varchar(128),
  latency_ms integer NOT NULL,
  cost_usd double precision NOT NULL,
  writes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_entries_gen_seq_ux
  ON audit_entries (generation_id, seq);
CREATE INDEX IF NOT EXISTS audit_entries_specialist_ix
  ON audit_entries (specialist);

CREATE TABLE IF NOT EXISTS conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  monitor varchar(128) NOT NULL,
  severity varchar(16) NOT NULL,
  kind varchar(128) NOT NULL,
  payload jsonb,
  resolved_by_specialist varchar(128),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conflicts_gen_ix ON conflicts (generation_id);

CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY,
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  kind varchar(64) NOT NULL,
  priority integer NOT NULL,
  emitted_by varchar(128) NOT NULL,
  status varchar(32) NOT NULL,
  payload jsonb,
  parent_goal_id uuid,
  satisfied_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_gen_ix ON goals (generation_id);
CREATE INDEX IF NOT EXISTS goals_status_ix ON goals (status);

CREATE TABLE IF NOT EXISTS active_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  question text NOT NULL,
  target_field varchar(256) NOT NULL,
  answered_at timestamptz,
  answer_text text,
  asked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS active_questions_user_ix ON active_questions (user_id);
CREATE INDEX IF NOT EXISTS active_questions_goal_ux ON active_questions (goal_id);

-- ─────────────── evidence + calibration ───────────────

CREATE TABLE IF NOT EXISTS evidence_spans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_document_id uuid,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  text_snippet text NOT NULL,
  span_type varchar(32) NOT NULL,
  confidence double precision NOT NULL,
  provenance varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS evidence_spans_user_ix ON evidence_spans (user_id);
CREATE INDEX IF NOT EXISTS evidence_spans_type_ix ON evidence_spans (span_type);

CREATE TABLE IF NOT EXISTS voice_centroids (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vector jsonb NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS honesty_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_type varchar(64) NOT NULL,
  trust_factor double precision NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS honesty_user_claim_ux
  ON honesty_calibrations (user_id, claim_type);

-- ─────────────── applications + outcomes + documents ───────────────

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  content jsonb NOT NULL,
  rendered_html text,
  rendered_pdf_url text,
  watermark_tag varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS documents_gen_kind_ux
  ON documents (generation_id, kind);

CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jd_id uuid REFERENCES jds(id) ON DELETE SET NULL,
  generation_id uuid NOT NULL REFERENCES generations(id),
  submitted_at timestamptz,
  status varchar(32) NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_user_status_ix
  ON applications (user_id, status);

CREATE TABLE IF NOT EXISTS outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  source varchar(32) NOT NULL,
  feedback_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outcomes_app_ix ON outcomes (application_id);

-- ─────────────── case base + ontology ───────────────

CREATE TABLE IF NOT EXISTS case_base_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jd_embedding jsonb NOT NULL,
  profile_embedding jsonb NOT NULL,
  document_embeddings jsonb NOT NULL,
  outcome_kind varchar(32) NOT NULL,
  opt_in boolean NOT NULL DEFAULT false,
  user_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_base_optin_ix ON case_base_entries (opt_in);

CREATE TABLE IF NOT EXISTS ontology_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semver varchar(32) NOT NULL UNIQUE,
  content_hash varchar(64) NOT NULL,
  migration_path jsonb,
  deployed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
