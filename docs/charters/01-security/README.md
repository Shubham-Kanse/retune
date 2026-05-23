# Charter 01 — Security

**Priority:** P0 — blocks launch
**Owner:** Staff Engineer (security lead) + Security Engineer + DevOps Engineer
**Authority:** Architect-revised (2026-05-22). Premise unchanged from intern version (which correctly diagnosed the catastrophic credential leakage). Structure expanded so README matches files on disk.

---

## Problem

Production secrets are committed in plaintext to the git working tree (and almost certainly to history). Verified via `read /Users/shubhamkanse/retune/.env.vercel`:

| Asset | Location | Status |
|-------|----------|--------|
| OpenAI key `sk-proj-MMlfjpZ9b03BW7…` | `.env.vercel` line 11 | Live, must be rotated |
| Anthropic key `sk-ant-api03-0qdvgfrvcR_4Yx…` | `.env.vercel` line 12 | Live, must be rotated |
| Supabase service role JWT | `.env.vercel` line 5 | Admin token, bypasses all RLS |
| `RETUNE_DATABASE_URL` with plaintext password `LuffyTaro@123` | `.env.vercel` line 8 | Live |
| `SMTP_PASS=LuffyTaro@123` (same password) | `.env.vercel` line 24 | Live |
| `JWT_SECRET=6agj5oy9f+vZjEKwzUdtHU7f3Jq+9kP+fml/3ip+4w8=` | `.env.vercel` line 27 | Live |
| Google service account RSA private key | `keys/retune-495722-8e3d69d74ce1.json` | Live (RSA private key in PEM) |

Beyond the leak, the API surface has weaknesses verified in code:

- `apps/api/src/main.ts` registers no global auth or rate-limit middleware. Per-route auth happens only inside route handlers (e.g. `routes/generate.ts` calls `resolveAuthenticatedIdentity` from `lib/internal-auth.ts:23`). Any new route is unauthenticated by default — wrong default.
- `apps/web/src/middleware.ts:42-49` sets a Content-Security-Policy that allows `'unsafe-eval'` and `'unsafe-inline'` for `script-src`. No `Strict-Transport-Security`.
- `apps/web/src/lib/csrf.ts` exists (598 B) but is not imported by `apps/web/src/lib/api-handler.ts` — only origin-checking guards state-mutating routes.
- Four duplicate rate-limiter implementations in `apps/web` (`lib/rate-limit.ts`, `lib/rate-limiter.ts`, `lib/career-understanding/rate-limit.ts`, `lib/onboarding-v2/llm/calls.ts`). No consistency.
- `apps/api/src/lib/internal-auth.ts:43` falls back to dev mode silently when `RETUNE_INTERNAL_API_KEY` is unset — must fail-closed in production.

---

## What "done" looks like

- Zero secrets in git history (`gitleaks detect --log-opts="--all"` exits 0).
- All credentials rotated, old credentials confirmed invalid.
- Secrets injected at deploy time only, never committed. Pre-commit hook + CI scan block future commits.
- `apps/api` global rate limit + per-route auth audit; production hard-fails on missing `RETUNE_INTERNAL_API_KEY`.
- CSP nonce-based (no `unsafe-eval`, no `unsafe-inline`); HSTS `max-age=63072000; includeSubDomains; preload`.
- All state-mutating web routes go through CSRF token validation in `lib/api-handler.ts`.
- Single rate limiter, used by every web API route.
- Dependency vulnerability scan blocks PRs on critical CVEs; Renovate keeps deps current.
- Auth events, admin actions, and security-sensitive operations are written to a durable audit log queryable by user.

---

## Success metrics

- 0 secrets in git, verified by `gitleaks` in CI on every commit.
- 0 unauthenticated API routes (audited by integration test against `apps/api/src/routes/`).
- Lighthouse production CSP audit: no `unsafe-eval`, no `unsafe-inline`.
- OWASP ZAP baseline scan: 0 high-severity findings.
- `npm audit --audit-level=critical` exits 0 in CI.
- Mean time to rotate a compromised credential: < 15 min (drilled quarterly via Epic 02).
- 100% of state-mutating web POST/PATCH/DELETE routes carry a verified CSRF token.

---

## Epics (canonical list, post-rewrite)

| # | Epic | Priority | File | Status |
|---|------|----------|------|--------|
| 1 | Secret rotation & git history remediation | P0 Day 1 | [epic-01-secret-rotation.md](./epic-01-secret-rotation.md) | Existed, reviewed |
| 2 | Secrets management infrastructure | P0 Wk 1 | [epic-02-secrets-management.md](./epic-02-secrets-management.md) | Created in rewrite |
| 3 | API auth + rate limiting + middleware audit | P0 Wk 1 | [epic-03-api-auth-rate-limiting.md](./epic-03-api-auth-rate-limiting.md) | Existed, needs polish (see notes below) |
| 4 | Web security headers (CSP nonces + HSTS) | P0 Wk 1 | [epic-04-csp-headers.md](./epic-04-csp-headers.md) | Existed, needs polish |
| 5 | CSRF protection (wire `csrf.ts` into `api-handler.ts`) | P0 Wk 2 | [epic-05-csrf.md](./epic-05-csrf.md) | Created in rewrite |
| 6 | Dependency vulnerability scanning + Renovate + SBOM | P1 Wk 2 | [epic-06-dependency-scanning.md](./epic-06-dependency-scanning.md) | Created in rewrite |
| 7 | Security audit logging | P1 Wk 3 | [epic-07-audit-logging.md](./epic-07-audit-logging.md) | Created in rewrite |
| 8 | Quarterly key-rotation drill (automated) | P1 Wk 12 | (covered by Epic 02 Story 2.4) | Folded into E2 |

The existing epic-03 and epic-04 files are good drafts but need the architect's polish:
- **Epic 03** must explicitly enumerate the *three distinct auth surfaces* (Supabase SSR / internal-key HMAC / SSE access token) with separate threat models. The intern's current draft conflates them.
- **Epic 03** must mandate consolidating the four duplicate rate limiters into one before adding new ones. New rate limiters with `setInterval` at module load (verified in `lib/rate-limiter.ts`) are a side-effect-on-import bug.
- **Epic 04** must specify nonce-based CSP for Next.js (replacing `'unsafe-inline'` with per-render nonces) plus HSTS. The intern's draft ships looser CSP than necessary because the author did not test nonce mode.

---

## Hard dependencies

- Epic 01 must complete before Epic 02 (rotation precedes infra; you can't put a control plane on top of a leak).
- Epic 02 must complete before Epic 03 (rate limiting needs env-var infrastructure that Epic 02 establishes).
- Charter 05 Epic 01 (structured logging) must exist before Epic 7 audit logging is useful (without request-id propagation, audit events can't be joined to request context).
- Charter 08 Epic 01 (RLS) must exist before Epic 7 audit log queries are tenant-safe.

---

## Cross-charter coordination notes

- The intern's `00-priority-execution-order.md` referenced Epics 5, 6, 7 as if they existed on disk. They didn't. The architect rewrite of `00-priority-execution-order.md` corrects every reference and creates the stub files where appropriate.
- `apps/web/src/lib/env.ts` rewrite is co-owned with Charter 20 Epic 02. Single PR.
- The Vercel + long-lived runtime host secret separation is co-owned with Charter 06 Epic 03 (CI secrets) and Epic 05 (runtime hosting decision).

---

## Out of scope (this charter)

- KMS-based at-rest encryption of the database — deferred to Charter 08 future epic.
- SOC 2 Type II preparation — strategic charter, not yet drafted.
- Penetration testing — operational rhythm, not a charter; book annually after Epic 1–7 close.
- IDS/IPS — production scaling concern, not blocking launch.
