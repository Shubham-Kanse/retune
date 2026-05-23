-- 0017_organisations.down.sql
-- Charter 18-Migrations Epic 01 — reversible migration for the
-- organisations + organisation_memberships scaffolding.

DROP POLICY IF EXISTS organisations_membership_isolation ON organisations;
DROP POLICY IF EXISTS organisation_memberships_self ON organisation_memberships;

ALTER TABLE organisations              DISABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_memberships   DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS idx_org_memberships_role;
DROP INDEX IF EXISTS idx_org_memberships_user;
DROP INDEX IF EXISTS idx_organisations_kind;

DROP TABLE IF EXISTS organisation_memberships;
DROP TABLE IF EXISTS organisations;
