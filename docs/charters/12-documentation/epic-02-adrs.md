# Epic 02 — Architecture Decision Records (ADRs)

## Goal

Establish a structured ADR practice and document the 5 most important architectural decisions so that new contributors understand why the system is built the way it is, and future decisions have a consistent format to follow.

---

## Story 1: Create ADR Directory and Template

### User Story

As a **contributor**, I want a standardised ADR template in `docs/adr/` so that all architectural decisions follow a consistent, reviewable format.

### Acceptance Criteria

- [ ] `docs/adr/` directory exists
- [ ] `docs/adr/0000-template.md` exists with the standard ADR format
- [ ] Template includes sections: Status, Context, Decision, Consequences, Alternatives Considered

### Tasks

#### Task 1.1: Create ADR directory and template

**File:** `docs/adr/0000-template.md`

```markdown
# ADR-NNNN: [Title]

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-NNNN]

## Context

[What is the issue that we're seeing that is motivating this decision or change?]

## Decision

[What is the change that we're proposing and/or doing?]

## Consequences

### Positive
- [What becomes easier or possible as a result of this change?]

### Negative
- [What becomes harder or impossible as a result of this change?]

### Neutral
- [What other effects does this change have?]

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|--------------|
| [Option A] | ... | ... | ... |
| [Option B] | ... | ... | ... |
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Create `docs/adr/` directory | 1 min |
| 1.1.2 | Write `0000-template.md` | 5 min |

### Tests

```bash
# Verify template exists and has required sections
test -f docs/adr/0000-template.md
grep -q "## Status" docs/adr/0000-template.md
grep -q "## Context" docs/adr/0000-template.md
grep -q "## Decision" docs/adr/0000-template.md
grep -q "## Consequences" docs/adr/0000-template.md
grep -q "## Alternatives Considered" docs/adr/0000-template.md
# Expected: all commands exit 0
```

---

## Story 2: ADR-0001 — Hono Over Express

### User Story

As a **contributor**, I want to understand why Hono was chosen over Express for `apps/api` so that I don't propose migrating to Express or question the choice without context.

### Acceptance Criteria

- [ ] `docs/adr/0001-hono-over-express.md` exists
- [ ] Status is "Accepted"
- [ ] Context explains the API requirements (edge-ready, typed, lightweight)
- [ ] Decision states Hono was chosen
- [ ] Consequences list performance, ecosystem, and learning curve tradeoffs
- [ ] Alternatives include Express, Fastify, and tRPC with rejection reasons

### Tasks

#### Task 2.1: Write ADR-0001

**File:** `docs/adr/0001-hono-over-express.md`

```markdown
# ADR-0001: Hono Over Express for API Layer

## Status

Accepted

## Context

Retune's API layer (`apps/api`) needs to:
- Serve cognitive generation endpoints with SSE streaming
- Run in Node.js for development and potentially edge runtimes for production
- Provide type-safe request/response handling
- Support middleware composition (auth, CORS, rate limiting)
- Remain lightweight — the API is a thin orchestration layer, not a monolith

Express is the Node.js default but lacks native TypeScript support, has no edge runtime compatibility, and its middleware model predates modern async patterns.

## Decision

Use Hono as the HTTP framework for `apps/api`.

Hono provides:
- First-class TypeScript with inferred request/response types
- Web Standards API compatibility (Request/Response)
- Edge runtime support (Cloudflare Workers, Vercel Edge, Deno)
- Built-in middleware for CORS, auth, compression
- `@hono/zod-openapi` for typed OpenAPI generation
- Sub-millisecond routing via RegExpRouter

## Consequences

### Positive
- Type-safe route handlers without manual casting
- SSE streaming works naturally with Web Streams API
- Can deploy to edge without framework change
- OpenAPI spec generation is a first-class integration
- Smaller bundle than Express (no `node_modules` bloat)

### Negative
- Smaller ecosystem than Express (fewer third-party middleware)
- Team members familiar with Express need to learn Hono patterns
- Some Node.js-specific libraries assume `req`/`res` from `http` module

### Neutral
- Testing uses `app.request()` instead of supertest
- Middleware signature differs from Express (`c.next()` vs `next()`)

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|--------------|
| Express | Massive ecosystem, team familiarity | No native TS, no edge support, callback-based middleware | Legacy patterns, no edge path |
| Fastify | Fast, schema validation, good TS | Node-only, heavier than needed, plugin system complexity | No edge support, over-engineered for thin API |
| tRPC | End-to-end type safety | Requires shared client/server types, no REST, no OpenAPI | Not suitable for external consumers or SSE streaming |
| Elysia (Bun) | Very fast, good DX | Bun-only, immature ecosystem | Runtime lock-in, production readiness concerns |
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Write Context section | 5 min |
| 2.1.2 | Write Decision section | 5 min |
| 2.1.3 | Write Consequences section | 5 min |
| 2.1.4 | Write Alternatives table | 10 min |

### Tests

```bash
test -f docs/adr/0001-hono-over-express.md
grep -q "## Status" docs/adr/0001-hono-over-express.md
grep -q "Accepted" docs/adr/0001-hono-over-express.md
grep -q "## Alternatives Considered" docs/adr/0001-hono-over-express.md
```

---

## Story 3: ADR-0002 — Temporal for Durable Workflows

### User Story

As a **contributor**, I want to understand why Temporal was chosen for durable workflow execution so that I understand the generation pipeline's reliability guarantees.

### Acceptance Criteria

- [ ] `docs/adr/0002-temporal-for-durable-workflows.md` exists
- [ ] Status is "Accepted"
- [ ] Context explains the need for durable, retryable, observable generation pipelines
- [ ] Decision states Temporal was chosen with in-memory fallback for local dev
- [ ] Consequences list operational complexity vs reliability tradeoffs
- [ ] Alternatives include BullMQ, Inngest, and custom state machine with rejection reasons

### Tasks

#### Task 3.1: Write ADR-0002

**File:** `docs/adr/0002-temporal-for-durable-workflows.md`

```markdown
# ADR-0002: Temporal for Durable Workflows

## Status

Accepted

## Context

Resume generation in Retune is a multi-step cognitive pipeline:
1. Goal seeding from job description
2. Sequential specialist execution (5-8 specialists)
3. Blackboard reads/writes between steps
4. Final assembly and PDF generation

This pipeline takes 30-120 seconds, involves multiple LLM calls, and must:
- Survive process restarts without losing progress
- Retry individual specialist failures without restarting the entire pipeline
- Provide visibility into which step is currently executing
- Support cancellation mid-flight
- Handle concurrent generation limits per user

A simple queue (Redis/BullMQ) cannot express the sequential-with-branching logic, and in-process execution loses state on deploy.

## Decision

Use Temporal as the durable workflow engine for generation pipelines.

- `apps/worker` hosts Temporal workers that execute workflow and activity code
- `apps/api` starts workflows via the Temporal client
- Activities wrap individual specialist executions
- Workflow code defines the orchestration order and retry policies
- An in-memory workbench runtime exists as fallback when Temporal is not configured (`RETUNE_TEMPORAL=false`)

## Consequences

### Positive
- Generation survives deploys and crashes — Temporal replays from last checkpoint
- Per-activity retry with exponential backoff — one LLM timeout doesn't kill the pipeline
- Built-in observability via Temporal UI (workflow history, pending activities)
- Cancellation is first-class (`workflow.cancel()`)
- Concurrency limits enforced via task queue configuration

### Negative
- Operational complexity — requires running Temporal server (or Temporal Cloud)
- Local development requires Docker for Temporal or falls back to in-memory mode
- Debugging workflow replays requires understanding Temporal's determinism constraints
- Additional latency from Temporal server round-trips (~50ms per activity dispatch)

### Neutral
- Activity code is plain TypeScript functions — portable if we ever leave Temporal
- In-memory fallback means the system works without Temporal for simple testing

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|--------------|
| BullMQ (Redis) | Simple, well-known, low ops | No workflow orchestration, manual state management, no replay | Cannot express multi-step pipelines with branching |
| Inngest | Serverless-friendly, good DX | Vendor lock-in, limited self-host, less mature | Not self-hostable at the time, limited observability |
| Custom state machine | Full control, no dependencies | Must build retry, replay, observability, cancellation from scratch | Engineering cost too high for equivalent reliability |
| AWS Step Functions | Managed, durable | AWS-only, JSON-based workflow definition, cold starts | Vendor lock-in, poor local dev story, verbose |
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Write Context section | 5 min |
| 3.1.2 | Write Decision section | 5 min |
| 3.1.3 | Write Consequences section | 5 min |
| 3.1.4 | Write Alternatives table | 10 min |

### Tests

```bash
test -f docs/adr/0002-temporal-for-durable-workflows.md
grep -q "Accepted" docs/adr/0002-temporal-for-durable-workflows.md
grep -q "## Alternatives Considered" docs/adr/0002-temporal-for-durable-workflows.md
```

---

## Story 4: ADR-0003 — PGlite for Local Development

### User Story

As a **contributor**, I want to understand why PGlite is used for local development so that I know when to use it vs a real Postgres instance.

### Acceptance Criteria

- [ ] `docs/adr/0003-pglite-for-local-dev.md` exists
- [ ] Status is "Accepted"
- [ ] Context explains the need for zero-dependency local database
- [ ] Decision states PGlite for local dev, Postgres for production
- [ ] Consequences list compatibility limitations
- [ ] Alternatives include SQLite, Docker Postgres, and in-memory stores

### Tasks

#### Task 4.1: Write ADR-0003

**File:** `docs/adr/0003-pglite-for-local-dev.md`

```markdown
# ADR-0003: PGlite for Local Development

## Status

Accepted

## Context

Retune uses PostgreSQL in production (via Supabase). Local development requires a database that:
- Requires zero setup (no Docker, no install)
- Is compatible with Drizzle ORM and our schema
- Supports the same SQL dialect as production Postgres
- Can be reset/seeded instantly for testing
- Works in CI without service containers

Docker Postgres works but adds friction: developers must have Docker running, port conflicts occur, and CI needs service containers that add startup time.

## Decision

Use PGlite (WASM-compiled Postgres) for local development and testing.

- `RETUNE_PERSIST=pglite` activates PGlite mode
- `RETUNE_PERSIST=postgres` uses real Postgres (production, staging)
- `packages/db` abstracts the connection so consumers don't know which backend is active
- PGlite databases are ephemeral (in-memory) or file-backed (`.pglite/` directory)

## Consequences

### Positive
- Zero-install local development — `pnpm dev` works immediately
- Tests run without Docker — faster CI, simpler developer onboarding
- Same SQL dialect as production — no ORM abstraction leaks
- Instant database reset for test isolation

### Negative
- PGlite doesn't support all Postgres extensions (e.g., no `pg_trgm`, no `pgvector`)
- Performance characteristics differ from real Postgres (no query planner optimization)
- Some edge cases in transaction isolation may behave differently
- Must test against real Postgres before production deploys

### Neutral
- Drizzle ORM abstracts most differences
- Migration files work identically on both backends
- `RETUNE_PERSIST` env var makes switching explicit

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|--------------|
| Docker Postgres | Identical to production | Requires Docker, slow startup, port conflicts | Too much friction for quick dev loops |
| SQLite (via better-sqlite3) | Zero-install, fast | Different SQL dialect, no Postgres features, migration divergence | Schema incompatibility with production |
| In-memory Map/Object | Fastest, simplest | No SQL, no schema validation, diverges completely from production | Not a real database, hides bugs |
| Supabase local (supabase start) | Full Supabase stack | Requires Docker, 30s+ startup, heavy resource usage | Overkill for unit tests and quick iteration |
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 4.1.1 | Write Context section | 5 min |
| 4.1.2 | Write Decision section | 5 min |
| 4.1.3 | Write Consequences section | 5 min |
| 4.1.4 | Write Alternatives table | 10 min |

### Tests

```bash
test -f docs/adr/0003-pglite-for-local-dev.md
grep -q "Accepted" docs/adr/0003-pglite-for-local-dev.md
grep -q "## Alternatives Considered" docs/adr/0003-pglite-for-local-dev.md
```

---

## Story 5: ADR-0004 — Supabase Auth

### User Story

As a **contributor**, I want to understand why Supabase Auth was chosen over alternatives so that I understand the auth boundaries and session management approach.

### Acceptance Criteria

- [ ] `docs/adr/0004-supabase-auth.md` exists
- [ ] Status is "Accepted"
- [ ] Context explains auth requirements (email/password, OAuth, session management, RLS)
- [ ] Decision states Supabase Auth was chosen
- [ ] Consequences list vendor coupling and flexibility tradeoffs
- [ ] Alternatives include NextAuth, Clerk, and custom JWT with rejection reasons

### Tasks

#### Task 5.1: Write ADR-0004

**File:** `docs/adr/0004-supabase-auth.md`

```markdown
# ADR-0004: Supabase Auth

## Status

Accepted

## Context

Retune needs authentication that supports:
- Email/password registration and login
- Password reset via email
- Session management with JWT tokens
- Row-Level Security (RLS) in Postgres for data isolation
- Future OAuth providers (Google, GitHub)
- Server-side session validation in Next.js middleware and API routes

The database is already hosted on Supabase, so auth integration with the same platform reduces operational surface.

## Decision

Use Supabase Auth as the authentication provider.

- `@supabase/ssr` handles cookie-based sessions in Next.js (server components, middleware, API routes)
- `@supabase/supabase-js` client for browser-side auth flows
- JWTs issued by Supabase are validated in `apps/api` middleware
- RLS policies in Postgres use `auth.uid()` for row-level data isolation
- Email verification and password reset use Supabase's built-in email templates (with custom SMTP via Namecheap Private Email)

## Consequences

### Positive
- Zero auth infrastructure to maintain — Supabase handles token issuance, refresh, and revocation
- RLS integration means database queries are automatically scoped to the authenticated user
- Built-in email flows (verification, password reset) with custom SMTP support
- SSR-compatible session management via `@supabase/ssr`
- OAuth providers can be added via Supabase dashboard without code changes

### Negative
- Vendor coupling — migrating away from Supabase Auth requires rewriting session management
- Limited customisation of auth flows (e.g., custom MFA, passwordless magic links require Supabase support)
- JWT validation in `apps/api` requires Supabase's JWKS endpoint or shared secret
- Rate limiting on auth endpoints is controlled by Supabase, not us

### Neutral
- Auth state is stored in Supabase's `auth.users` table, separate from our application tables
- Session cookies are httpOnly, secure, and managed by `@supabase/ssr`

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|--------------|
| NextAuth (Auth.js) | Framework-native, many providers | No RLS integration, session storage complexity, no built-in email flows | Doesn't integrate with Supabase RLS |
| Clerk | Excellent DX, pre-built components | Expensive at scale, vendor lock-in, no RLS integration | Cost and no Postgres RLS support |
| Custom JWT (jose + bcrypt) | Full control, no vendor | Must build everything: registration, reset, refresh, revocation | Engineering cost too high, security risk |
| Firebase Auth | Google-backed, free tier | No Postgres RLS, requires Firebase SDK, different ecosystem | Doesn't integrate with Supabase database |
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 5.1.1 | Write Context section | 5 min |
| 5.1.2 | Write Decision section | 5 min |
| 5.1.3 | Write Consequences section | 5 min |
| 5.1.4 | Write Alternatives table | 10 min |

### Tests

```bash
test -f docs/adr/0004-supabase-auth.md
grep -q "Accepted" docs/adr/0004-supabase-auth.md
grep -q "## Alternatives Considered" docs/adr/0004-supabase-auth.md
```

---

## Story 6: ADR-0005 — Credit-Based Billing

### User Story

As a **contributor**, I want to understand why Retune uses credits instead of direct USD billing so that I understand the billing model's design rationale.

### Acceptance Criteria

- [ ] `docs/adr/0005-credit-based-billing.md` exists
- [ ] Status is "Accepted"
- [ ] Context explains why direct per-generation pricing is problematic
- [ ] Decision states credit-based billing with plan tiers
- [ ] Consequences list flexibility vs complexity tradeoffs
- [ ] Alternatives include per-generation USD, subscription-only, and usage-based billing

### Tasks

#### Task 6.1: Write ADR-0005

**File:** `docs/adr/0005-credit-based-billing.md`

```markdown
# ADR-0005: Credit-Based Billing

## Status

Accepted

## Context

Retune's generation pipeline has variable cost:
- A full generation (resume + cover letter + tailoring) costs ~$0.15-0.40 in LLM tokens
- A refinement (single specialist re-run) costs ~$0.02-0.05
- Costs vary by model, input length, and number of specialists invoked

Direct USD billing per generation creates problems:
- Users don't know the cost before generating (variable token usage)
- Micro-transactions ($0.15) have high payment processing overhead
- Price changes require updating payment flows, not just configuration
- No way to offer "included generations" in subscription tiers

## Decision

Use an internal credit system as the billing abstraction.

- Each plan tier grants a monthly credit allowance:
  - Free: 30 credits
  - Pro: 500 credits
  - Max: 1500 credits
- Operations consume fixed credit amounts:
  - Full generation: 10 credits
  - Refinement: 1 credit
- Credits reset monthly on billing cycle
- Credit costs are configurable via environment variables (`CREDIT_COST_GENERATION`, `CREDIT_COST_REFINEMENT`)
- `packages/billing` tracks credit balance and enforces limits

## Consequences

### Positive
- Predictable user experience — users know exactly how many generations they have
- Price changes don't require code changes — adjust credit costs or plan allowances
- Subscription tiers map cleanly to credit budgets
- Can offer bonus credits for promotions without payment system changes
- Refinements are cheap (1 credit) encouraging iteration

### Negative
- Additional abstraction layer between cost and billing
- Users must learn what "credits" mean (onboarding friction)
- Credit-to-USD mapping must be communicated clearly in pricing page
- Unused credits expire monthly (potential user frustration)

### Neutral
- Credit balance is stored in the database, not in a payment provider
- Stripe (future) would handle plan subscriptions; credits are internal accounting

## Alternatives Considered

| Alternative | Pros | Cons | Why rejected |
|-------------|------|------|--------------|
| Per-generation USD (pay-as-you-go) | Transparent pricing | Micro-transaction overhead, variable costs confuse users, no "included" tier | Payment processing cost exceeds generation cost at low prices |
| Flat subscription (unlimited) | Simple to understand | Unsustainable with LLM costs, heavy users subsidised by light users | LLM costs scale linearly with usage, can't offer unlimited |
| Token-based (pass-through LLM costs) | Most accurate | Unpredictable for users, complex metering, exposes internal cost structure | Too complex, users don't understand tokens |
| Hybrid (subscription + overage) | Flexible | Complex billing logic, surprise charges | Overage charges create negative user experience |
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 6.1.1 | Write Context section | 5 min |
| 6.1.2 | Write Decision section | 5 min |
| 6.1.3 | Write Consequences section | 5 min |
| 6.1.4 | Write Alternatives table | 10 min |

### Tests

```bash
test -f docs/adr/0005-credit-based-billing.md
grep -q "Accepted" docs/adr/0005-credit-based-billing.md
grep -q "## Alternatives Considered" docs/adr/0005-credit-based-billing.md
```

---

## Total Effort Estimate

| Story | Estimate |
|-------|----------|
| Story 1: ADR directory + template | 10 min |
| Story 2: ADR-0001 Hono over Express | 25 min |
| Story 3: ADR-0002 Temporal | 25 min |
| Story 4: ADR-0003 PGlite | 25 min |
| Story 5: ADR-0004 Supabase Auth | 25 min |
| Story 6: ADR-0005 Credit-based billing | 25 min |
| **Total** | **~2.25 hr** |
