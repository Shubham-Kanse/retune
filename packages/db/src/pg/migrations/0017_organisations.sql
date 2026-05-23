-- 0017_organisations.sql
-- Charter 19 — multi-tenant scaffolding.
--
-- Adds the minimum schema to support organisations + role-based
-- membership. The product/UI layer for org management is deferred;
-- this migration is the data-model anchor so subsequent migrations
-- (per-org billing, per-org RLS) have a stable target.
--
-- Roles (initial set, can grow):
--   - owner    : full admin; can delete the org; cannot be removed.
--   - admin    : invite/remove members, change billing, change settings.
--   - member   : standard user; can generate, profile, etc.
--   - viewer   : read-only access for auditors / observers.
--
-- Migration strategy for existing users:
--   - On Charter 19 Epic 01 ship: every existing user auto-creates a
--     "personal" org with `kind='personal'` and themselves as `owner`.
--     Backfill is run AFTER this migration in a separate one-time job
--     so we keep schema and data migrations distinct.
--
-- RLS:
--   - organisations: members can SELECT their own orgs.
--   - organisation_memberships: a user can SELECT their own memberships.
--   - Cross-org reads are blocked by default; admin tools use the
--     service-role key to bypass RLS when needed.

CREATE TABLE IF NOT EXISTS organisations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT         NOT NULL,
  slug            TEXT         NOT NULL UNIQUE,
  -- 'personal' for the auto-created per-user org; 'team' for explicit
  -- team orgs created via Charter 19 Epic 01 UI.
  kind            TEXT         NOT NULL DEFAULT 'team',
  -- Free-form metadata (logo, primary contact, etc.). Subset of
  -- columns may be promoted to top-level fields as the product grows.
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  -- Soft-delete: keep rows for 30 days then sweep (Charter 08 GDPR).
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organisations_kind
  ON organisations (kind)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS organisation_memberships (
  organisation_id UUID         NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role            TEXT         NOT NULL DEFAULT 'member',
  invited_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
  invited_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id),
  CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user
  ON organisation_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_org_memberships_role
  ON organisation_memberships (organisation_id, role);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE organisations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_memberships   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organisations_membership_isolation ON organisations;
DROP POLICY IF EXISTS organisation_memberships_self ON organisation_memberships;

-- Members see organisations they belong to (via the join through
-- organisation_memberships).
CREATE POLICY organisations_membership_isolation ON organisations
  USING (
    id IN (
      SELECT organisation_id FROM organisation_memberships
      WHERE user_id = public.current_user_id()
    )
    AND deleted_at IS NULL
  );

-- A user can read their own membership rows (so they know which orgs
-- they belong to). Cross-user reads within an org are admin-only;
-- those queries go through the service-role key.
CREATE POLICY organisation_memberships_self ON organisation_memberships
  USING (user_id = public.current_user_id());
