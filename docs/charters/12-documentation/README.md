# Charter 12 — Documentation

## Vision

Establish comprehensive, machine-readable API documentation and a living Architecture Decision Record (ADR) trail so that contributors, integrators, and future maintainers can understand the system without reading source code.

## Current State

- No OpenAPI/Swagger spec for `apps/api`
- No Architecture Decision Records
- `apps/api/README.md` is minimal (1463 bytes)
- No CONTRIBUTING.md or runbooks
- `docs/` contains technical-2.0.md, prd-2.0.md, REPO_EXHAUSTIVE_MAP.md, VERIFIED_RUNTIME_TRUTH.md

## Epics

| # | Epic | Description |
|---|------|-------------|
| 01 | [API Documentation](./epic-01-api-docs.md) | OpenAPI spec generation, Swagger UI, route documentation |
| 02 | [Architecture Decision Records](./epic-02-adrs.md) | ADR template and initial 5 foundational ADRs |

## Success Metrics

- `GET /openapi.json` returns valid OpenAPI 3.0 spec with all routes documented
- `GET /docs` serves interactive Swagger UI
- 5 ADRs written covering all foundational technology choices
- CI validates OpenAPI spec on every PR

## Dependencies

- None (standalone charter)

## Risks

- Route refactoring to `@hono/zod-openapi` may introduce regressions if not tested thoroughly
- ADRs require historical context that may need team input for accuracy


## Architect addenda (2026-05-22)

- **Epic 01 (API docs):** `apps/api/src/routes/*.ts` already use Zod schemas (`GenerateRequestSchema`, etc.). Use `@hono/zod-openapi` so OpenAPI generation is mechanical from existing code, not a parallel effort. Don't introduce a new schema language.
- **Epic 02 (ADRs) must add ADR-006 — Dual-runtime selection rule.** Production must hard-require `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres`; in-memory runtime is dev-only. Code already enforces partially (`apps/api/src/runtime/generation-lifecycle.ts:101` throws when Temporal is on without persistence). Generalise the guard. ADR documents the policy.
- **Suggested ADR set (6 total):** ADR-001 Cognitive substrate (blackboard + specialists pattern), ADR-002 Supabase as auth+DB source of truth (and `packages/auth/` deletion), ADR-003 Migration track unification (Supabase wins), ADR-004 AI provider strategy (primary + fallback), ADR-005 ML stub vs real-model production gating, ADR-006 Dual-runtime selection rule.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 12 and §4 (hard architectural decisions).
