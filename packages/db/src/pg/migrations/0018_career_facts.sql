-- 0018_career_facts.sql
-- Evidence ledger — the compounding asset behind every generation.
--
-- One row = one career fact with provenance. Facts accrue from drift-check
-- answers, resume extraction, and generation-time evidence solving; each
-- application makes the next one better. Claims are unique per (user, kind)
-- so re-asserting a fact updates its confidence/evidence instead of
-- duplicating it.
--
-- kind:   skill | achievement | scope | credential
-- source: drift_check | resume_extraction | generation | user_edit

CREATE TABLE IF NOT EXISTS career_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  claim TEXT NOT NULL,
  evidence TEXT,
  source VARCHAR(48) NOT NULL,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  verified_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_from_generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT career_facts_user_kind_claim_uniq UNIQUE (user_id, kind, claim)
);

CREATE INDEX IF NOT EXISTS career_facts_user_ix ON career_facts (user_id);
CREATE INDEX IF NOT EXISTS career_facts_kind_ix ON career_facts (kind);
CREATE INDEX IF NOT EXISTS career_facts_source_ix ON career_facts (source);
