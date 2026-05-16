-- P0.6: Resume extraction audit log (OWASP A09)
-- Tracks every upload attempt for security monitoring and incident response.

CREATE TABLE IF NOT EXISTS resume_extraction_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingestion_id    uuid,
  content_hash    varchar(64) NOT NULL,
  detected_type   varchar(32),
  classification_confidence double precision,
  safety_flags    jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_extraction  jsonb,
  validation_violations jsonb NOT NULL DEFAULT '[]'::jsonb,
  was_rejected    boolean NOT NULL DEFAULT false,
  reject_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resume_audit_user_ix ON resume_extraction_audit(user_id, created_at DESC);
