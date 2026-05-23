# Charter 17 — Integrations & API Platform

## Vision

Transform Retune's API into a developer-friendly platform with versioned endpoints, webhook notifications, API key management, and comprehensive documentation — enabling third-party integrations and programmatic access to generation capabilities.

## Current State

| Area | Status |
|------|--------|
| API versioning | No version prefix on routes |
| Webhooks | None |
| API documentation | None |
| API key management | None |

## Target State

- All API routes versioned under `/v1/` with deprecation headers on legacy paths
- Webhook system delivering signed payloads with retry logic
- OpenAPI documentation auto-generated from route schemas
- API key management for programmatic access (future epic)

## Epics

| # | Epic | Status |
|---|------|--------|
| 01 | [API Versioning](./epic-01-api-versioning.md) | planned |
| 02 | [Webhook System](./epic-02-webhook-system.md) | planned |
| 03 | OpenAPI Documentation | planned |
| 04 | API Key Management | planned |
| 05 | Rate Limiting & Throttling | planned |

## Dependencies

- Charter 08 (RLS) — webhook payloads must respect data isolation
- Charter 19 (Enterprise) — API keys may be scoped to organisations

## Success Metrics

- 100% of generation routes accessible under `/v1/`
- Webhook delivery success rate > 99% within 5 retries
- API documentation covers all public endpoints
- P95 webhook delivery latency < 5 seconds


## Architect addenda (2026-05-22)

- **Idempotency-key is already a v1 contract requirement** — `apps/api/src/routes/generate.ts` already accepts `idempotency_key` and persists to `generation_requests` table with a unique `(user_id, idempotency_key)` constraint. Epic 01 (API versioning) must mandate it for ALL v1 mutating endpoints, not just `/generate`.
- **Webhook events table mirrors Stripe pattern** — Epic 02 (Webhook System) must specify a `webhook_events` table keyed by external event id (`event.id` for Stripe, similar for outbound). Coordinate with Charter 03 Epic 03 (which introduces `stripe_events`); the same table can serve outbound webhooks if generalised.
- **Webhook signing** — HMAC over `(timestamp, body)` with rotating signing keys. Document key-rotation cadence (quarterly, drilled per Charter 01 Epic 02 Story 2.4).
- **API key management (planned Epic 04)** — must scope keys to (user, organisation) once Charter 19 lands. Pre-org era keys auto-migrate to the user's first organisation.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 17.
