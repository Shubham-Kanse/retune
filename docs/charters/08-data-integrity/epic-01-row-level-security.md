# Epic 01 — Row-Level Security

## Overview

Enable Postgres Row-Level Security on all tenant-scoped tables and enforce per-request user isolation via `SET LOCAL app.current_user_id`. The application role `retune_app` will be subject to RLS policies; the Supabase service role bypasses RLS by default.

## Current State

- `packages/db/src/pg/schema.ts` line 19: `"per-tenant row-level security policies (Postgres RLS definitions) Unimplemented in schema (commit #4+)"`
- 12 migration files (0000–0011): zero contain `ENABLE ROW LEVEL SECURITY` or `CREATE POLICY`
- `packages/db/src/pg/client.ts`: `postgres_drizzle()` creates a connection with no session-level user context
- `apps/api/src/runtime/persistence-factory.ts`: `acquire_durability()` returns a shared `PgDb` with no per-request user scoping

---

## Story 1: Create RLS Migration

### User Story

As a **platform engineer**, I want RLS policies enforced at the database level so that even if application code has a bug, one user's data cannot leak to another user.

### Acceptance Criteria

- [ ] Migration file `packages/db/src/pg/migrations/0014_rls_policies.sql` exists and applies cleanly on a fresh DB after all prior migrations
- [ ] RLS is enabled on all 16 specified tables
- [ ] Each table has a `user_isolation` policy using `current_setting('app.current_user_id')::uuid`
- [ ] Application role `retune_app` is created with LOGIN and restricted privileges
- [ ] Service role (Supabase `postgres` / `service_role`) bypasses RLS
- [ ] Migration is idempotent (re-running does not error)

### Tasks

#### Task 1.1: Create migration file

**File:** `packages/db/src/pg/migrations/0014_rls_policies.sql`

```sql
-- Migration 0014: Enable Row-Level Security on all tenant-scoped tables.
-- Depends on: 0011_onboarding_v2_commit_rpc.sql

BEGIN;

-- ─── Application role ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'retune_app') THEN
    CREATE ROLE retune_app LOGIN PASSWORD 'retune_app_password';
  END IF;
END
$$;

-- Grant connect and usage
GRANT CONNECT ON DATABASE postgres TO retune_app;
GRANT USAGE ON SCHEMA public TO retune_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO retune_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO retune_app;

-- ─── Enable RLS on tenant-scoped tables ─────────────────────────────────────

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_centroids ENABLE ROW LEVEL SECURITY;
ALTER TABLE honesty_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE jds ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies ───────────────────────────────────────────────────────────

-- users: user can only see their own row
CREATE POLICY user_isolation ON users
  USING (id = current_setting('app.current_user_id')::uuid);

-- generations: scoped by user_id
CREATE POLICY user_isolation ON generations
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- blackboard_snapshots: scoped via generation_id → generations.user_id
CREATE POLICY user_isolation ON blackboard_snapshots
  USING (generation_id IN (
    SELECT id FROM generations WHERE user_id = current_setting('app.current_user_id')::uuid
  ));

-- audit_entries: scoped via generation_id → generations.user_id
CREATE POLICY user_isolation ON audit_entries
  USING (generation_id IN (
    SELECT id FROM generations WHERE user_id = current_setting('app.current_user_id')::uuid
  ));

-- conflicts: scoped via generation_id → generations.user_id
CREATE POLICY user_isolation ON conflicts
  USING (generation_id IN (
    SELECT id FROM generations WHERE user_id = current_setting('app.current_user_id')::uuid
  ));

-- goals: scoped via generation_id → generations.user_id
CREATE POLICY user_isolation ON goals
  USING (generation_id IN (
    SELECT id FROM generations WHERE user_id = current_setting('app.current_user_id')::uuid
  ));

-- active_questions: scoped by user_id
CREATE POLICY user_isolation ON active_questions
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- evidence_spans: scoped by user_id
CREATE POLICY user_isolation ON evidence_spans
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- voice_centroids: scoped by user_id (PK is user_id)
CREATE POLICY user_isolation ON voice_centroids
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- honesty_calibrations: scoped by user_id
CREATE POLICY user_isolation ON honesty_calibrations
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- gdpr_packets: scoped by user_id
CREATE POLICY user_isolation ON gdpr_packets
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- jds: shared resource, allow all authenticated users to read
CREATE POLICY user_isolation ON jds
  USING (current_setting('app.current_user_id', true) IS NOT NULL);

-- applications: scoped by user_id
CREATE POLICY user_isolation ON applications
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- outcomes: scoped via application_id → applications.user_id
CREATE POLICY user_isolation ON outcomes
  USING (application_id IN (
    SELECT id FROM applications WHERE user_id = current_setting('app.current_user_id')::uuid
  ));

-- billing_subscriptions: scoped by user_id
CREATE POLICY user_isolation ON billing_subscriptions
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- usage_records: scoped by user_id
CREATE POLICY user_isolation ON usage_records
  USING (user_id = current_setting('app.current_user_id')::uuid);

COMMIT;
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.1.1 | Write the SQL migration file | 2h |
| 1.1.2 | Register migration in `packages/db/src/pg/migrations/index.ts` | 15m |
| 1.1.3 | Test migration applies on fresh PGlite instance | 1h |
| 1.1.4 | Test migration applies on Docker Postgres 15 | 30m |
| 1.1.5 | Verify idempotency (run twice, no errors) | 30m |

#### Task 1.2: Register migration in index

**File:** `packages/db/src/pg/migrations/index.ts`

Add the import for the new migration file following the existing pattern in the index file.

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 1.2.1 | Add `0014_rls_policies.sql` to the migrations array | 15m |

### Tests

**File:** `packages/db/src/pg/__tests__/rls-migration.test.ts`

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { create_pglite, pglite_drizzle, run_migrations } from "../index";

describe("0014_rls_policies migration", () => {
  let client: Awaited<ReturnType<typeof create_pglite>>;

  before(async () => {
    client = await create_pglite();
    await run_migrations({ kind: "pglite", client });
  });

  after(async () => {
    await client.close();
  });

  it("enables RLS on users table", async () => {
    const result = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE relname = 'users'"
    );
    assert.equal(result.rows[0]?.relrowsecurity, true);
  });

  it("enables RLS on generations table", async () => {
    const result = await client.query(
      "SELECT relrowsecurity FROM pg_class WHERE relname = 'generations'"
    );
    assert.equal(result.rows[0]?.relrowsecurity, true);
  });

  it("creates user_isolation policy on users", async () => {
    const result = await client.query(
      "SELECT polname FROM pg_policy WHERE polrelid = 'users'::regclass"
    );
    assert.equal(result.rows[0]?.polname, "user_isolation");
  });

  it("creates user_isolation policy on all 16 tables", async () => {
    const tables = [
      "users", "generations", "blackboard_snapshots", "audit_entries",
      "conflicts", "goals", "active_questions", "evidence_spans",
      "voice_centroids", "honesty_calibrations", "gdpr_packets", "jds",
      "applications", "outcomes", "billing_subscriptions", "usage_records"
    ];
    for (const table of tables) {
      const result = await client.query(
        "SELECT polname FROM pg_policy WHERE polrelid = $1::regclass",
        [table]
      );
      assert.ok(
        result.rows.some((r: { polname: string }) => r.polname === "user_isolation"),
        `Missing user_isolation policy on ${table}`
      );
    }
  });
});
```

---

## Story 2: Set User Context on Each Request

### User Story

As a **backend developer**, I want the database connection to automatically scope queries to the authenticated user so that RLS policies are enforced transparently.

### Acceptance Criteria

- [ ] `packages/db/src/pg/client.ts` exports a `withUserContext(db, userId, fn)` helper that wraps `fn` in a transaction with `SET LOCAL app.current_user_id`
- [ ] `apps/api/src/runtime/persistence-factory.ts` exposes a method to create a user-scoped DB handle
- [ ] All generation queries go through the user-scoped path
- [ ] Queries without a user context fail with a clear error (RLS denies access)

### Tasks

#### Task 2.1: Add `withUserContext` helper to client.ts

**File:** `packages/db/src/pg/client.ts`

```typescript
import { sql } from "drizzle-orm";

/**
 * Execute a callback within a transaction that sets the RLS user context.
 * All queries inside `fn` will be scoped to the given userId via RLS policies.
 */
export async function withUserContext<T>(
  db: PgDb,
  userId: string,
  fn: (tx: PgDb) => Promise<T>
): Promise<T> {
  return await (db as any).transaction(async (tx: any) => {
    await tx.execute(sql`SET LOCAL app.current_user_id = ${userId}`);
    return fn(tx as PgDb);
  });
}
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.1.1 | Implement `withUserContext` in `packages/db/src/pg/client.ts` | 1h |
| 2.1.2 | Export from package barrel (`packages/db/src/pg/index.ts`) | 15m |
| 2.1.3 | Add JSDoc with usage example | 15m |

#### Task 2.2: Update persistence factory to support user-scoped access

**File:** `apps/api/src/runtime/persistence-factory.ts`

```typescript
import { withUserContext } from "@retune/db/pg";

export interface Durability {
  persistence: TickPersistence & GenerationReplayLoader;
  default_user_id: string;
  db: PgDb;
  /** Execute a callback with RLS scoped to the given user. */
  withUser<T>(userId: string, fn: (db: PgDb) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Inside acquire_durability, add to the returned object:
// withUser: <T>(userId: string, fn: (db: PgDb) => Promise<T>) => withUserContext(db, userId, fn),
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.2.1 | Add `withUser` method to `Durability` interface | 30m |
| 2.2.2 | Implement in both pglite and postgres branches of `acquire_durability` | 1h |
| 2.2.3 | Update all callers in `apps/api/src/` that access `durability.db` directly | 2h |

#### Task 2.3: Wire user context in API request handlers

**File:** `apps/api/src/routes/generate.ts` (and other route files)

At the start of each authenticated request handler, use `durability.withUser(userId, ...)` instead of `durability.db` directly.

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 2.3.1 | Audit all route handlers that access `durability.db` | 1h |
| 2.3.2 | Wrap each in `durability.withUser(userId, ...)` | 2h |
| 2.3.3 | Verify no direct `durability.db` access remains in request paths | 30m |

### Tests

**File:** `packages/db/src/pg/__tests__/with-user-context.test.ts`

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { create_pglite, pglite_drizzle, run_migrations, withUserContext } from "../index";
import { users, generations } from "../schema";
import { eq } from "drizzle-orm";

describe("withUserContext", () => {
  let client: Awaited<ReturnType<typeof create_pglite>>;
  let db: ReturnType<typeof pglite_drizzle>;

  before(async () => {
    client = await create_pglite();
    await run_migrations({ kind: "pglite", client });
    db = pglite_drizzle(client);
  });

  after(async () => {
    await client.close();
  });

  it("sets app.current_user_id within the transaction", async () => {
    const userId = "a961e9e4-8b0c-413d-b502-76c91acce4ee";
    await withUserContext(db, userId, async (tx) => {
      const result = await (tx as any).execute(
        `SELECT current_setting('app.current_user_id') as uid`
      );
      assert.equal(result.rows[0].uid, userId);
    });
  });

  it("resets context after transaction completes", async () => {
    const userId = "a961e9e4-8b0c-413d-b502-76c91acce4ee";
    await withUserContext(db, userId, async () => {});
    // Outside the transaction, the setting should not persist
    try {
      await (db as any).execute(
        `SELECT current_setting('app.current_user_id') as uid`
      );
      assert.fail("Should have thrown — setting not available outside transaction");
    } catch (e: any) {
      assert.ok(e.message.includes("unrecognized") || e.message.includes("not found"));
    }
  });
});
```

---

## Story 3: Integration Tests for Cross-Tenant Isolation

### User Story

As a **security engineer**, I want automated tests proving that user A cannot access user B's data even with direct SQL queries, so that we have regression protection for tenant isolation.

### Acceptance Criteria

- [ ] Test creates two users (A and B) with generations
- [ ] Querying as user A returns only user A's generations
- [ ] Querying as user A returns zero rows for user B's generations
- [ ] Direct `SELECT * FROM generations WHERE id = <B's generation id>` returns empty when connected as user A
- [ ] Tests run in CI via `pnpm test`

### Tasks

#### Task 3.1: Write cross-tenant isolation integration tests

**File:** `packages/db/src/pg/__tests__/rls-isolation.test.ts`

```typescript
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { create_pglite, pglite_drizzle, run_migrations, withUserContext } from "../index";
import { users, generations } from "../schema";
import { eq, sql } from "drizzle-orm";

describe("RLS cross-tenant isolation", () => {
  let client: Awaited<ReturnType<typeof create_pglite>>;
  let db: ReturnType<typeof pglite_drizzle>;
  let userAId: string;
  let userBId: string;
  let genAId: string;
  let genBId: string;

  before(async () => {
    client = await create_pglite();
    await run_migrations({ kind: "pglite", client });
    db = pglite_drizzle(client);

    // Create two users
    const [userA] = await db.insert(users).values({
      email: "alice@test.com",
      personaType: "experienced_ic",
      market: "US",
      locale: "en-US",
    }).returning();
    const [userB] = await db.insert(users).values({
      email: "bob@test.com",
      personaType: "experienced_ic",
      market: "US",
      locale: "en-US",
    }).returning();

    userAId = userA.id;
    userBId = userB.id;

    // Create generations for each user
    const [genA] = await db.insert(generations).values({
      user_id: userAId,
      ontology_version: "1.0.0",
    }).returning();
    const [genB] = await db.insert(generations).values({
      user_id: userBId,
      ontology_version: "1.0.0",
    }).returning();

    genAId = genA.id;
    genBId = genB.id;
  });

  after(async () => {
    await client.close();
  });

  it("user A can read their own generations", async () => {
    await withUserContext(db, userAId, async (tx) => {
      const rows = await tx.select().from(generations).where(eq(generations.user_id, userAId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, genAId);
    });
  });

  it("user A cannot read user B's generations", async () => {
    await withUserContext(db, userAId, async (tx) => {
      const rows = await tx.select().from(generations).where(eq(generations.user_id, userBId));
      assert.equal(rows.length, 0);
    });
  });

  it("user A cannot read user B's generation by direct ID lookup", async () => {
    await withUserContext(db, userAId, async (tx) => {
      const rows = await tx.select().from(generations).where(eq(generations.id, genBId));
      assert.equal(rows.length, 0);
    });
  });

  it("user B can read their own generations", async () => {
    await withUserContext(db, userBId, async (tx) => {
      const rows = await tx.select().from(generations).where(eq(generations.user_id, userBId));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, genBId);
    });
  });

  it("user B cannot read user A's generations", async () => {
    await withUserContext(db, userBId, async (tx) => {
      const rows = await tx.select().from(generations).where(eq(generations.user_id, userAId));
      assert.equal(rows.length, 0);
    });
  });

  it("user A can only see their own row in users table", async () => {
    await withUserContext(db, userAId, async (tx) => {
      const rows = await tx.select().from(users);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].id, userAId);
    });
  });

  it("SELECT * FROM generations returns only own rows", async () => {
    await withUserContext(db, userAId, async (tx) => {
      const rows = await tx.select().from(generations);
      assert.equal(rows.length, 1);
      assert.ok(rows.every(r => r.user_id === userAId));
    });
  });
});
```

**Subtasks:**

| # | Subtask | Effort |
|---|---------|--------|
| 3.1.1 | Write test file with setup/teardown | 1h |
| 3.1.2 | Add 7 isolation assertions | 1h |
| 3.1.3 | Verify tests pass in CI (PGlite) | 30m |
| 3.1.4 | Verify tests pass against Docker Postgres | 30m |

---

## Total Effort Estimate

| Story | Effort |
|-------|--------|
| Story 1: RLS Migration | 4h 15m |
| Story 2: User Context Wiring | 7h 30m |
| Story 3: Integration Tests | 3h |
| **Total** | **~15h** |

## Dependencies

- None (this epic is a prerequisite for other data-layer work)

## Rollback Plan

1. Drop all policies: `DROP POLICY user_isolation ON <table>` for each table
2. Disable RLS: `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY`
3. Drop role: `DROP ROLE retune_app`
4. Revert `client.ts` and `persistence-factory.ts` changes
