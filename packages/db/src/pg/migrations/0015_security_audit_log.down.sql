-- 0015_security_audit_log.down.sql
-- Charter 18-Migrations Epic 01 — reversible migration for the
-- security_audit_log table introduced in 0015.

DROP INDEX IF EXISTS idx_sec_audit_user_time;
DROP INDEX IF EXISTS idx_sec_audit_type_time;
DROP INDEX IF EXISTS idx_sec_audit_outcome_time;
DROP INDEX IF EXISTS idx_sec_audit_ip_time;

DROP TABLE IF EXISTS security_audit_log;
