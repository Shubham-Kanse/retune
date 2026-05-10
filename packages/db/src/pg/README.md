# @retune/db/pg

Postgres schema for the cognitive workbench. Additive — lives alongside
the SQLite schema in `@retune/db` (which continues to own `apps/web`).

## Status (commit #4)

Schema + runtime client + migration pipeline wired. Hand-rolled
migrations (`0000_init.sql`, `0001_active_question_parent_field.sql`)
are the source of truth, bundled at build time and applied by
`run_migrations()`.

`drizzle.config.pg.ts` + `pnpm db:pg:generate` is wired for future
migrations — the expected flow from commit #5 onwards is:

```sh
# 1. Edit packages/db/src/pg/schema.ts
# 2. Generate a new numbered migration
RETUNE_DATABASE_URL=postgres://localhost:5432/retune \
  pnpm --filter @retune/db db:pg:generate
# 3. Review the generated SQL and rename/edit as needed
# 4. Register it in migrations/index.ts MIGRATIONS array
```

## Tables

- **users** — persona, market, locale, kms_key_id, data_residency_region
- **jds, jd_clusters** — parsed JDs + MinHash-LSH dedupe groups
- **generations** — one per cognitive cycle; current blackboard snapshot
- **blackboard_snapshots** — append-only JSONB per seq (replay store)
- **audit_entries** — one row per orchestrator tick; cost attribution
- **conflicts** — ACC monitor output
- **goals** — per-generation goal stack (durable mirror)
- **active_questions** — user-blocking questions surfaced by specialists
- **evidence_spans** — typed spans with offsets + confidence + provenance
- **voice_centroids** — per-user stylometric fingerprints
- **honesty_calibrations** — per-user × claim-type trust factors
- **documents, applications, outcomes** — downstream pipeline
- **case_base_entries** — cross-user RAG corpus (pgvector in commit #4)
- **ontology_versions** — semver'd ontology content hashes

## DB extensions required (commit #3 migration)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector; wired in commit #4
```

## Why a separate namespace, not a replacement

The existing SQLite schema is the source of truth for the shipped product.
Hot-swapping databases is a multi-week migration with data-loss risk. This
namespace gives commit #3 a place to land the cognitive-cycle mirror
without touching production tables or migrating user data.
