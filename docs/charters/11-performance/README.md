# Charter 11 — Performance & Scalability

## Purpose

Establish measurable performance baselines and enforce budgets across the Retune stack — database queries, API response times, frontend bundle size, and page load metrics. Every change in this charter must produce a quantifiable improvement with automated regression gates.

## Current State

| Area | Problem | Impact |
|------|---------|--------|
| Database | `packages/db/src/pg/client.ts` uses default pool settings (no `max`, no timeouts) | Connection exhaustion under load; no PgBouncer compatibility |
| Prompt caching | `packages/agent/src/caching/prompt-cache.ts` exists but is not wired into any provider | Duplicate LLM calls waste tokens and add latency |
| Frontend bundle | `three`, `@react-three/fiber`, `@react-three/drei`, `@paper-design/shaders-react` loaded statically | ~500KB+ JS shipped to every visitor on first load |
| Images | `apps/web/public/images/orb.png` is 907KB unoptimised PNG | Blocks LCP on landing page |
| CI gates | Lighthouse CI step is non-blocking (`\|\| true`); no bundle size budget | Regressions ship undetected |

## Epics

| # | Epic | Scope |
|---|------|-------|
| 01 | Database Performance | Connection pooling, prompt caching, query-level improvements |
| 02 | Frontend Bundle | Dynamic imports, image optimisation, bundle budgets, Lighthouse gate |

## Success Metrics

- P95 API response time for `/generate` preflight < 200ms (from ~450ms today)
- Initial JS bundle (gzipped) < 200KB
- Lighthouse Performance score ≥ 85 on landing page
- Zero duplicate LLM calls for identical prompts within 1-hour window
- Connection pool saturation alerts at 80% utilisation

## Dependencies

- Charter 03 Epic 01 (billing query optimisation) — addresses `atomicCheckGeneration` full table scan separately
- Supabase transaction pooler requires `prepare: false` in postgres.js config

## Risks

| Risk | Mitigation |
|------|-----------|
| Prompt cache serves stale results after system prompt changes | Cache key includes full prompt hash; 1-hour TTL limits staleness |
| Dynamic imports cause layout shift on landing page | Skeleton placeholder with fixed dimensions matches final render |
| Bundle analyzer adds CI time | Run only on PRs touching `apps/web`; cache `.next` between runs |

## Timeline

- Epic 01: 1 sprint (5 working days)
- Epic 02: 1 sprint (5 working days)
- Total: 2 sprints, parallelisable


## Architect addenda (2026-05-22)

- **`prepare: false` flag is required for Supabase pooler** — `packages/db/src/pg/client.ts` `postgres_drizzle()` instantiates `postgres(url)` with default options. The Supabase transaction pooler (port 6543) does NOT support prepared statements; production will hit `prepared statement … already exists` errors under load. Single-line fix: `postgres(url, { prepare: false })`. Epic 01 must include this as a Story 1.0 (smallest, highest-value change in the entire performance charter).
- **`orb.png` is 907 KB** at `apps/web/public/images/orb.png` (verified). LCP-blocker on the landing page. Epic 02 must replace with AVIF + responsive sizes; intern's draft mentions image optimisation but doesn't pin the specific file.
- **Make Lighthouse blocking** — `.github/workflows/cognitive-cycle.yml` lighthouse job has `|| true` on the `lhci autorun` line, making the entire gate non-functional. New Epic 03 (or fold into Epic 02) — remove `|| true`, keep the existing thresholds (perf 0.9, a11y 0.9, LCP < 2.5s) which are already in `lighthouserc.json`.
- **`prompt-cache.ts` wiring debt** — see Charter 09 architect addendum. Same finding from a perf angle: every duplicate LLM call wastes both money and time-to-first-token.

See [`_VALIDATION-MATRIX.md`](../_VALIDATION-MATRIX.md) §1 row 11.
