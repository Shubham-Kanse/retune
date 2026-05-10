-- Migration 0002 — GDPR audit packets (technical-2.0 §10.2)
--
-- Persistent home for the Article 22 audit packet emitted by every
-- shipped or refused generation. Replayable; FK-cascades on user delete
-- to support the right to erasure (PRD 2.0 §11.1).

CREATE TABLE IF NOT EXISTS gdpr_packets (
  generation_id uuid PRIMARY KEY REFERENCES generations(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verdict       varchar(16) NOT NULL,
  packet        jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gdpr_packets_user_ix
  ON gdpr_packets(user_id, created_at DESC);
