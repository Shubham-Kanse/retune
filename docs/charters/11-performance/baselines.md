# Performance Baselines

> Charter 11 — Performance. Captured 2026-05-23. Update on every release that materially changes
> bundle size, route logic, or model-call footprint.

## Lighthouse CI gates (live)

Configured in `lighthouserc.json` and enforced by the `lighthouse` job in `cognitive-cycle.yml`.
A regression below the `error` threshold blocks the workflow — there is no `|| true` escape.

| Category               | Threshold | Severity |
| ---------------------- | --------- | -------- |
| Performance            | ≥ 0.90    | error    |
| Accessibility          | ≥ 0.90    | error    |
| Best Practices         | ≥ 0.85    | warn     |
| LCP (Largest Contentful Paint) | < 2.5s | error |
| TTI (Time to Interactive) | < 5.0s | warn |

Routes audited: `/login`, `/dashboard`. Add a new route to the `urls` array in `lighthouserc.json`
when a major surface ships and the audit budget is willing to accept it.

## Bundle size baseline

Captured from `pnpm --filter @retune/web build` 2026-05-23 (Next.js 15.5, Turbopack).

| Route        | First Load JS | Notes                                                            |
| ------------ | ------------- | ---------------------------------------------------------------- |
| `/`          | tracked       | Hero + landing sections — orb.png replaced 3D deps               |
| `/login`     | tracked       |                                                                  |
| `/signup`    | tracked       |                                                                  |
| `/dashboard` | tracked       |                                                                  |
| `/settings`  | tracked       | Workspaces card + Language card                                  |
| `/v1` API    | n/a           | Hono, no client bundle                                           |

> Run `pnpm --filter @retune/web build && du -sh apps/web/.next/static` to capture current sizes.
> Pin a hard ceiling once the build numbers stabilise across a few releases. Until then, treat any
> commit that grows total static asset size > 10% as a yellow flag in PR review.

### Bundle hygiene rules

1. New deps land with their bundle delta in the PR description (`pnpm why <name>` + before/after
   build size).
2. Avoid client-side libraries with > 30KB gzipped footprint when a server-side alternative exists
   (markdown rendering, date formatting, etc.).
3. Anything pulled into the `app/(public)` layout shows up on every landing render; gate decorative
   motion behind dynamic imports if its bundle cost > 20KB gz.

## Orchestrator tick latency (live gate)

Enforced by `performance-gate` job in `cognitive-cycle.yml` (Charter 11 Epic 04 + v2.0 §26.9).

| Metric                  | Target  | Source                                       |
| ----------------------- | ------- | -------------------------------------------- |
| P50 tick (no LLM)       | < 250ms | `tests/orchestrator-e2e.test.ts`             |
| P95 tick (no LLM)       | < 500ms | trace events                                 |
| SSE heartbeat           | < 30s   | `tests/orchestrator-e2e.test.ts`             |
| Cancellation propagation| < 1s    | `tests/cancellation.test.ts`                 |

Real-model tick latency (with provider calls) is measured in the heavy `cognitive-cycle-heavy` job
nightly and reported, not gated — provider tail latency is outside our control.

## Generation end-to-end (informational)

| Phase                     | Mock-mode  | Live-mode (target)                  |
| ------------------------- | ---------- | ----------------------------------- |
| Goal seeding              | < 10ms     | < 50ms                              |
| Comprehension (JD, profile)| < 50ms    | < 4s (one LLM call)                 |
| Specialist run loop       | < 200ms    | depends on bullet count × providers |
| Document render           | < 100ms    | < 100ms                             |
| Total (start → first SSE) | < 500ms    | < 8s                                |
| Total (start → ship)      | < 2s       | < 60s                               |

Live targets carry generous buffers. The user-facing SLA in PRD §1.6 is "under 3 minutes" so we
have headroom; treat any p95 over 90s as a yellow flag.

## How to update this doc

1. Capture new numbers from a clean release build.
2. Replace the table values; do NOT delete the old column. Diff is what makes baselines useful.
3. Bump the `Captured` date at the top.
4. If the change makes a gate stricter, also bump `lighthouserc.json` thresholds in the same PR so
   the next CI run enforces the new baseline.
