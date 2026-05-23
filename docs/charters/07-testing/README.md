# Charter 07 — Testing & Quality Assurance

## Mission

Establish enforceable coverage gates, contract tests, and critical-path test coverage across the Retune monorepo so that regressions are caught before merge and inter-service contracts are verified automatically.

## Current State

| Surface | Runner | Files | CI Status |
|---------|--------|-------|-----------|
| `packages/agent/tests/` | `tsx --test` (Node native) | 45 | ✅ Runs in `test-ts` job |
| `apps/api/tests/` | `tsx --test` | 6 | ✅ Partial (smoke only) |
| `apps/web/__tests__/` | vitest + jsdom | ~30 | ✅ Runs in `ci-cd.yml` |
| `apps/web/e2e/` | Playwright | 13 | ❌ Not in CI |
| `packages/eval/` | `tsx --test` | 14 | ✅ Runs in `test-ts` job |

### Gaps

- No coverage thresholds enforced anywhere — regressions in coverage go unnoticed.
- No contract tests between `apps/web` (consumer) and `apps/api` (provider). The existing `schema-contract.test.ts` only validates DB column presence, not HTTP request/response shapes.
- No visual regression tests.
- No test for billing double-spend race condition (`atomicCheckGeneration` concurrent deduction).
- No test for SSE reconnection behaviour.
- Critical security paths (`ssrf-guard`, `internal-auth`) have zero test coverage.

## Epics

| # | Epic | Outcome |
|---|------|---------|
| 01 | [Coverage Gates](./epic-01-coverage-gates.md) | CI fails when line coverage drops below 80% for agent/api/web; 5 critical untested paths gain full coverage |
| 02 | [Contract Testing](./epic-02-contract-testing.md) | HTTP contract between web and api is verified on every PR; request validation and response shape assertions for all generation routes |

## Success Metrics

- `packages/agent` line coverage ≥ 80% (enforced in CI)
- `apps/api` line coverage ≥ 80% (enforced in CI)
- `apps/web` line coverage ≥ 80%, branch coverage ≥ 70% (enforced in CI)
- Contract tests cover all 4 generation API routes
- Zero undetected breaking changes between web and api for 30 days post-implementation

## Dependencies

- Node.js 22+ (`--experimental-test-coverage` flag)
- `@vitest/coverage-v8` for web coverage
- PGlite for contract test persistence (already used in existing tests)

## Out of Scope (This Charter)

- Playwright E2E in CI (separate charter)
- Visual regression testing
- Load/performance testing
- ML service (`apps/ml`) coverage gates (covered by `test-python` job)


## Architect addenda (2026-05-22)

- **Web vitest is currently RED:** 107/136 passing — **29 failing** at time of charter rewrite. Epic 01 must include a "fix-the-29-failing-tests" sub-task BEFORE raising the coverage gate. Raising a gate over a red suite is a foot-gun. Failing tests verified during code review of `apps/web/__tests__/`, `apps/web/src/lib/__tests__/`, `apps/web/src/lib/onboarding/__tests__/`, `apps/web/src/lib/onboarding-v2/__tests__/`.
- **Add Epic 03 — Critical-path coverage:** explicit tests for `apps/api/src/lib/internal-auth.ts`, `apps/api/src/lib/ssrf-guard.ts`, `apps/api/src/lib/generation-access-token.ts`, `apps/web/src/lib/drift-preflight-token.ts`, and `apps/web/src/lib/csrf.ts` once Epic 5 of Charter 01 wires it. These are HMAC primitives. Untested HMAC is a CVE waiting to happen.
- **Contract testing strategy** (Epic 02): use `@hono/zod-openapi` so the existing Zod schemas in `apps/api/src/routes/*.ts` (`GenerateRequestSchema` etc.) become the contract, and the web client validates against the same schema. Pact is overkill for a monorepo where the consumer ships in the same PR as the provider.

For the cross-charter context and the readiness scoring, see [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 7.
