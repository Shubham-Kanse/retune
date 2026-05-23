# Migration track unification runbook

Charter 08-Data-Integrity Epic 03 + Charter 18-Migrations Epic 03.

## The problem

Retune has two parallel migration timelines:

- `packages/db/src/pg/migrations/*.sql` — Drizzle ORM migrations,
  applied by `pnpm db:migrate`. Used by local dev (PGlite) + apps that
  speak Drizzle directly.
- `supabase/migrations/*.sql` — Supabase migrations, applied by the
  Supabase CLI (`supabase db push`). Owns auth, RLS, edge functions,
  and the production schema.

Whenever a schema change lands in only one track, the next deploy
produces drift — a column the API expects but the DB doesn't have, or
vice versa. The four `fix_*` Supabase migrations
(`20260510230000_fix_schema_issues.sql`, `230100_fix_architectural_issues.sql`,
`230200_fix_security_advisor.sql`, `230300_fix_security_warnings.sql`)
are historical evidence of repeated drift events.

## The decision (per ADR-002)

**Supabase is authoritative for production schema.** It owns auth,
RLS, edge functions, and runs against production Postgres on Supabase
infrastructure. Drizzle becomes a typed mirror generated from the
Supabase schema.

Concretely:

1. New schema changes land FIRST as a Supabase migration in
   `supabase/migrations/`.
2. The Drizzle schema (`packages/db/src/pg/schema.ts`) is regenerated
   via `supabase db diff` (or `pnpm db:diff` once we wire the script).
3. The Drizzle migrations directory (`packages/db/src/pg/migrations/`)
   is rebuilt from the regenerated schema.
4. PGlite tests apply the regenerated Drizzle migrations against an
   in-memory Postgres — same SQL dialect, same shape.

## Audit script

`tools/db/audit-migration-tracks.mjs` walks both directories, parses
out `CREATE TABLE` statements, and reports tables that exist in one
track but not the other.

Run locally:

```bash
node tools/db/audit-migration-tracks.mjs
```

Today it exits 0 even on drift (advisory). After the unification pass,
flip it to `process.exit(1)` and wire it into CI as a hard gate.

## Migration unification — playbook

When you're ready to unify (target: end of Q3):

### Step 1 — freeze new Drizzle migrations

In a single PR:

- Block the directory in `.github/workflows/cognitive-cycle.yml` —
  any PR adding a new `packages/db/src/pg/migrations/*.sql` file fails
  CI with "use a Supabase migration instead."
- Document the new flow in `packages/db/README.md`.

### Step 2 — write the diff tool

```bash
pnpm --filter @retune/db add -D supabase
```

Add `pnpm db:diff` script:

```json
"db:diff": "supabase db diff --schema public > packages/db/src/pg/migrations/diff-$(date +%s).sql"
```

### Step 3 — run the catch-up

For every Supabase table not in Drizzle:

1. Add the Drizzle schema declaration in `packages/db/src/pg/schema.ts`.
2. Generate the catch-up migration via `pnpm db:diff`.
3. Land both in one PR.

Run `node tools/db/audit-migration-tracks.mjs` until drift is empty.

### Step 4 — flip the audit to blocking

Change `process.exit(0)` to `process.exit(1)` at the end of
`audit-migration-tracks.mjs`. Add a CI step that runs it.

### Step 5 — delete the four fix_* Supabase migrations

Once everything is consistent, `git rm` the historical
`20260510230000_fix_*` files. They're noise; the unified schema is the
canonical state.

## What lands in the meantime

- Audit script: ✅ shipped (`tools/db/audit-migration-tracks.mjs`).
- Runbook: ✅ this doc.
- Drizzle migrations: still landing in PR-by-PR until the freeze.
- Supabase migrations: still landing for production-only changes
  (auth, RLS, edge functions) without catching up Drizzle — drift
  acknowledged.

## References

- ADR-002 (persistence + dual-track): `docs/adr/ADR-002-persistence.md`
- Charter 08-Data-Integrity Epic 03 (architect addendum)
- Charter 18-Migrations Epic 03 (NEW, parallel)
