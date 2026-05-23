-- 0015_security_audit_log.sql
-- Charter 01 Epic 07 — durable audit log of security-sensitive events.
--
-- Captures: auth events (login/logout/signup/reset/verify), admin
-- actions (service-role bypasses), data access through service role,
-- billing changes, RLS bypass, CSRF rejections, rate-limit exceedances,
-- SSRF guard rejections.
--
-- Distinct from `audit_entries` (which is per-orchestrator-tick).
-- This table is per-HTTP-request and per-administrative-action.

CREATE TABLE IF NOT EXISTS security_audit_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT         NOT NULL,
  -- Who: usually the authenticated user; null for anonymous + service-role.
  user_id         UUID         REFERENCES users(id) ON DELETE SET NULL,
  actor_kind      TEXT         NOT NULL,    -- 'user' | 'service_role' | 'anonymous' | 'system'
  -- What was acted on: optional — many security events are global.
  target_kind     TEXT,
  target_id       TEXT,
  -- Where the request came from.
  request_id      TEXT,                     -- joins to apps/api logger.requestId
  ip              TEXT,
  user_agent      TEXT,
  -- Outcome: did the action succeed or was it rejected?
  outcome         TEXT         NOT NULL DEFAULT 'success',  -- 'success' | 'denied' | 'error'
  -- Free-form structured data, redacted at write time (no secrets).
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Timestamp.
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Per-user audit queries (account → "show me my recent security events").
CREATE INDEX IF NOT EXISTS idx_sec_audit_user_time
  ON security_audit_log (user_id, created_at DESC);

-- Per-event-type aggregation (alerting / dashboards).
CREATE INDEX IF NOT EXISTS idx_sec_audit_type_time
  ON security_audit_log (event_type, created_at DESC);

-- Failed-auth detector (rate-limit anomaly + brute-force detection).
CREATE INDEX IF NOT EXISTS idx_sec_audit_outcome_time
  ON security_audit_log (outcome, created_at DESC)
  WHERE outcome IN ('denied', 'error');

-- IP-based sweep (block lists).
CREATE INDEX IF NOT EXISTS idx_sec_audit_ip_time
  ON security_audit_log (ip, created_at DESC)
  WHERE ip IS NOT NULL;
