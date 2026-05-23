# Database migrations

This package owns the **Drizzle migration track** (`packages/db/src/pg/migrations/`).
Production schema is owned by **Supabase migrations** (`supabase/migrations/`)
per ADR-002. This track is mirrored from Supabase (run `pnpm db:diff` to refresh)
and is what local PGlite + dev Postgres apply.

## Conventions

### File naming

```
NNNN_descriptive_name.sql        ← up migration
NNNN_descriptive_name.down.sql   ← down migration (Charter 18 Epic 1)
```

`NNNN` is a 4-digit sequential index. The first migration is `0000_*`.

### Down migrations are required

Every new up migration MUST ship with a corresponding `.down.sql` file
that reverses its effects. CI enforces this via the
`db:audit:migrations` script (run by `pnpm typecheck` in CI).

A down migration:

- DROPs any tables / columns / indexes the up migration ADDed.
- DROPs any policies the up migration CREATEd.
- ALTERs back any column types the up migration changed.
- Does NOT need to restore back-filled data — backfill is one-way; if
  you need historical data after a rollback, restore from the most
  recent point-in-time backup.

If a migration is structurally irreversible (e.g. it dropped a table
whose data we no longer have), put a single comment in the `.down.sql`
file explaining why and exit successfully:

```sql
-- 0007_drop_legacy_table.down.sql
--
-- Irreversible: 0007_drop_legacy_table.sql dropped `legacy_x` whose
-- data was archived to S3 at s3://retune-archive/2026-05-22/legacy_x.
-- Restore from archive separately if needed.
SELECT 1;
```

### Idempotency

Every up migration MUST be idempotent: running it twice succeeds
without error. Use `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`
generously. Down migrations follow the same rule with `IF EXISTS`.

### Single source of truth

If a schema change must land in production, write it as a Supabase
migration FIRST. The Drizzle mirror is regenerated from the Supabase
schema. Don't add columns or tables in the Drizzle track that don't
exist in Supabase — that's how the schema-drift bug came back four
times in the `fix_*` migrations.

## Order matters

Migrations are applied in lexicographic order. NEVER renumber an
existing migration. If you need a fix, write a new migration with the
next available number.

## Testing

- Local: `pnpm db:up && pnpm db:migrate`
- Unit (PGlite): the test harness in `packages/db/src/__tests__/`
  applies all migrations from scratch on every test run.
- Pre-PR: `pnpm db:audit:schema` checks that the Drizzle schema export
  matches what the migrations produce.

## Reference

- Charter 18: `docs/charters/18-migrations/README.md`
- ADR-002 (persistence + dual-track): `docs/adr/ADR-002-persistence.md`
