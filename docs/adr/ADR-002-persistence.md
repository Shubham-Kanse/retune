# ADR-002 — Persistence: Postgres + Drizzle, with PGlite for Dev/Tests

**Status**: Accepted
**Date**: 2026-05-23
**Owner**: Platform engineering
**Charter**: 08-Data-Integrity, 11-Performance

## Context

Retune needs durable, queryable, transactional storage for: user profiles, generation runs, blackboard snapshots per tick, audit entries, conflicts, GDPR packets, billing subscriptions, security audit log. Reads are skewed toward "show me my latest generation's audit trail" (heavy joins, scoped to user). Writes are skewed toward "append a tick row every 200ms during an active generation."

Three sub-decisions:

1. Database engine.
2. ORM.
3. Local-dev / test database.

## Decision

1. **Postgres** as production database. Run on Supabase (managed, EU-hosted to match GDPR posture, included Row-Level Security and `pgcrypto`).
2. **Drizzle ORM** for schema definition + queries from Node services. Drizzle is lightweight (no global query builder, no opaque proxies), produces strongly-typed query results, and ships SQL we can read.
3. **PGlite** (`@electric-sql/pglite`) for local dev and unit tests. PGlite is an in-process WebAssembly Postgres that boots in ~50ms with the same SQL semantics as production. Tests don't need Docker.

The same Drizzle client wraps both adapters via the `PgDb` union type in `packages/db/src/pg/client.ts`. Production code never has to know which adapter is in play.

## Consequences

**Positive**:

- Single SQL dialect across local, CI, and production. No SQLite-vs-Postgres divergence.
- Tests run without Docker (CI cycle stays under 5 min).
- Drizzle's typed schema lets specialists and routes share `@retune/db` exports without runtime overhead.
- Supabase RLS provides defense-in-depth: even a service-role-bypass bug in our code can't leak cross-tenant data when policies are enforced.

**Negative**:

- Dual migration tracks (Drizzle + Supabase) require discipline to avoid drift. **Tracked under 18-Migrations Epic 03 / 08-Data Epic 03 (single owner: Supabase migrations are authoritative; Drizzle schema regenerated via `supabase db diff`).**
- PGlite doesn't perfectly emulate connection-pool behaviour, so production-only bugs in pooled-connection edge cases (prepared-statement reuse) need integration tests against real Postgres in CI.
- Drizzle 0.38.x had a known issue with `@opentelemetry/api` peer-dep duplication; we pin via `pnpm.overrides`. (See ADR-005.)

## Alternatives Considered

- **Prisma**: rejected for runtime overhead, opaque migration model, and proxy ergonomics that hide what SQL ships.
- **Kysely**: closer competitor to Drizzle. Rejected because Drizzle's schema-as-data-with-types matches our specialist+blackboard architecture better.
- **SQLite for local**: rejected because dialect drift bites every quarter; the team would lose hours debugging "works locally, breaks in prod."
- **Postgres-in-Docker for local**: rejected as a *primary* path because it adds 30-60s to every test run and requires Docker on every contributor's machine. Still available via `infra/compose/dev.yml` for those who want it.

## References

- `packages/db/src/pg/client.ts` (`postgres_drizzle`, `pglite_drizzle`)
- `packages/db/src/pg/schema.ts`
- `supabase/migrations/`
- `packages/db/src/pg/migrations/`
- `docs/charters/08-data-integrity/README.md`
