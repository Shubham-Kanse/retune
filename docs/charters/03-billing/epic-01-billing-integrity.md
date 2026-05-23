# Epic 01: Billing Integrity Fixes

**Charter:** Billing & Monetisation  
**Priority:** P0 — Week 1 (must complete before Stripe integration)  
**Complexity:** M  
**Owner:** Backend Engineer

---

## Goal

Fix two billing bugs that exist today: (1) the N+1 SUM query on every generation, and (2) the in-memory cache that allows credit double-spending across serverless instances.

## Definition of Done

- [ ] `atomicCheckGeneration` no longer runs `SUM(usageRecords.costUsd)` — it reads from `subscriptions.creditsUsed` counter column
- [ ] Credit deduction is a single atomic `UPDATE subscriptions SET credits_used = credits_used + $cost WHERE user_id = $uid AND credits_used + $cost <= credits_limit` — returns 0 rows if over limit
- [ ] The in-memory `_cache` Map is replaced with a short-lived database read (or Redis if available)
- [ ] `creditsUsed` counter on `subscriptions` table is kept in sync with actual usage via a migration that backfills from `usageRecords`
- [ ] All existing billing tests pass
- [ ] New tests cover: concurrent deduction (two simultaneous requests, only one succeeds if at limit), counter backfill correctness

---

## Context: Current Bugs

### Bug 1: N+1 SUM Query

**File: `packages/billing/src/index.ts` lines 130–165 (`atomicCheckGeneration`)**

```typescript
// CURRENT — runs a full table scan on every generation:
const usageRows = await tx
  .select({ total: sql<number>`COALESCE(SUM(${usageRecords.costUsd}), 0)` })
  .from(usageRecords)
  .where(and(eq(usageRecords.userId, userId), sql`${usageRecords.costUsd} IS NOT NULL`));
const creditsUsed = Math.round(Number(usageRows[0]?.total ?? 0));
```

As `usageRecords` grows (500+ rows per user), this query takes 50–200ms. It runs inside a transaction on every generation request.

### Bug 2: In-Memory Cache Double-Spend

**File: `packages/billing/src/index.ts` lines 35–50**

```typescript
// CURRENT — module-level Map, not shared across serverless instances:
const _cache = new Map<string, { value: unknown; expiresAt: number }>();
```

On Vercel, each function invocation may be a different instance. Two concurrent generation requests can both read `creditsRemaining = 1`, both pass the check, and both deduct — resulting in -1 credits.

### Bug 3: Column Name Semantic Confusion

**File: `packages/db/src/pg/schema.ts` (usageRecords table)**

The column `costUsd` stores integer credits (10 for generation, 1 for refinement), not USD. This is documented in a comment but causes confusion for anyone reading the schema or writing queries.

---

## Story 1.1: Add creditsUsed Counter Column to subscriptions Table

**As a** backend engineer,  
**I want** a `credits_used` counter column on the `subscriptions` table,  
**so that** credit balance checks are a single indexed read instead of a full table scan.

**Acceptance Criteria:**
- [ ] Migration `0012_credits_used_counter.sql` adds `credits_used INTEGER NOT NULL DEFAULT 0` to `subscriptions`
- [ ] Migration backfills `credits_used` from `SUM(usage_records.cost_usd)` for all existing users
- [ ] Migration is zero-downtime: the column has a default, so existing rows are valid immediately
- [ ] `getSubscription()` in `packages/billing/src/index.ts` reads `sub.creditsUsed` (already does this — verify it's correct after migration)
- [ ] `atomicCheckGeneration()` uses `UPDATE subscriptions SET credits_used = credits_used + $cost WHERE user_id = $uid AND credits_used + $cost <= $limit RETURNING credits_used` instead of SUM query
- [ ] Unit test: `atomicCheckGeneration` called 10 times concurrently for a user with 10 credits remaining — exactly 1 succeeds, 9 return `allowed: false`

### Task 1.1.1: Write migration to add creditsUsed counter
**Owner:** Backend Engineer  
**Deliverable:** `packages/db/src/pg/migrations/0012_credits_used_counter.sql`  
**Dependencies:** None

##### Subtask: Create migration file
Create `packages/db/src/pg/migrations/0012_credits_used_counter.sql`:

```sql
-- Migration: Add credits_used counter to subscriptions
-- Zero-downtime: column has DEFAULT 0, existing rows are valid immediately

-- Step 1: Add column with default
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0;

-- Step 2: Backfill from usage_records
-- cost_usd column stores integer credits (10 per generation, 1 per refinement)
-- Exclude refinement_attempt type (rate limiting records, not actual credit deductions)
UPDATE subscriptions s
SET credits_used = COALESCE((
  SELECT SUM(ur.cost_usd)
  FROM usage_records ur
  WHERE ur.user_id = s.user_id
    AND ur.type IN ('generation', 'refinement')
    AND ur.cost_usd IS NOT NULL
), 0);

-- Step 3: Add index for the counter column (used in UPDATE WHERE clause)
CREATE INDEX IF NOT EXISTS subscriptions_user_id_ix ON subscriptions(user_id);
```
**Output:** Migration file created  
**Effort:** half day

##### Subtask: Update Drizzle schema to include creditsUsed
Open `packages/db/src/pg/schema.ts`. Find the `subscriptions` table definition. Add the `creditsUsed` column:

```typescript
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plan: varchar("plan", { length: 32 }).notNull().default("free"),
  status: varchar("status", { length: 32 }).notNull().default("active"),
  // ADD THIS:
  creditsUsed: integer("credits_used").notNull().default(0),
  // existing fields...
  createdAt: tcol("created_at"),
  updatedAt: updated(),
});
```
**Output:** Drizzle schema updated with `creditsUsed` column  
**Effort:** < 2 hours

##### Subtask: Run migration against local pglite and verify backfill
```bash
pnpm --filter @retune/db db:migrate
# Then verify:
pnpm --filter @retune/db db:studio
# Check subscriptions table — credits_used should match SUM of usage_records
```
**Output:** Migration runs successfully, `credits_used` populated correctly  
**Effort:** < 2 hours

### Task 1.1.2: Rewrite atomicCheckGeneration to use counter
**Owner:** Backend Engineer  
**Deliverable:** `atomicCheckGeneration` uses atomic UPDATE instead of SUM query  
**Dependencies:** Task 1.1.1 (migration must exist)

##### Subtask: Rewrite atomicCheckGeneration in packages/billing/src/index.ts
Open `packages/billing/src/index.ts`. Replace the entire `atomicCheckGeneration` function:

```typescript
export async function atomicCheckGeneration(
  userId: string,
  _applicationId: string,
): Promise<UsageCheck> {
  // Invalidate cache so next getSubscription() reads fresh data
  cacheDel(`subscription:${userId}`);

  const cost = getActionCost("generation");

  // Atomic: increment credits_used only if it won't exceed the plan limit.
  // Returns the updated row if successful, empty array if over limit.
  // This is a single round-trip — no SUM query, no race condition.
  const updated = await db.execute(sql`
    UPDATE subscriptions
    SET
      credits_used = credits_used + ${cost},
      updated_at = NOW()
    WHERE
      user_id = ${userId}
      AND credits_used + ${cost} <= (
        CASE plan
          WHEN 'free' THEN ${PLAN_CREDITS.free}
          WHEN 'pro'  THEN ${PLAN_CREDITS.pro}
          WHEN 'max'  THEN ${PLAN_CREDITS.max}
          ELSE ${PLAN_CREDITS.free}
        END
      )
    RETURNING credits_used, plan
  `);

  if (!updated.rows || updated.rows.length === 0) {
    // Over limit — read current state for the response
    const sub = await getSubscription(userId);
    return {
      allowed: false,
      reason: "insufficient_credits",
      creditsRemaining: sub.creditsRemaining,
      creditsCost: cost,
      remainingCreditsUsd: sub.creditsRemainingUsd,
      costUsd: cost / 10,
    };
  }

  const row = updated.rows[0] as { credits_used: number; plan: string };
  const plan = row.plan as PlanTier;
  const creditsUsed = row.credits_used;
  const creditsLimit = getPlanCredits(plan);
  const creditsRemaining = Math.max(creditsLimit - creditsUsed, 0);

  // Also insert usage record for audit trail
  await db.insert(usageRecords).values({
    userId,
    type: "generation",
    applicationId: _applicationId ?? null,
    costUsd: cost,
  });

  cacheDel(`subscription:${userId}`);

  return {
    allowed: true,
    creditsRemaining,
    creditsCost: cost,
    remainingCreditsUsd: creditsRemaining / 10,
    costUsd: cost / 10,
  };
}
```

**Important:** The `db.execute(sql`...`)` call uses the raw Drizzle SQL executor. Verify the import: `import { db } from "@retune/db"` and `import { sql } from "drizzle-orm"` are both present.  
**Output:** `atomicCheckGeneration` uses atomic UPDATE  
**Effort:** full day

##### Subtask: Write concurrent deduction test
Create `packages/billing/src/__tests__/atomic-deduction.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { atomicCheckGeneration, recordUsage } from "../index";
import { db, subscriptions, usageRecords } from "@retune/db";
import { eq } from "drizzle-orm";

// This test requires a real database (pglite harness)
// Run with: pnpm --filter @retune/billing test

const TEST_USER_ID = "00000000-0000-4000-8000-000000000099";

describe("atomicCheckGeneration concurrent deduction", () => {
  beforeEach(async () => {
    // Reset test user subscription to exactly 10 credits remaining
    await db.delete(usageRecords).where(eq(usageRecords.userId, TEST_USER_ID));
    await db
      .update(subscriptions)
      .set({ creditsUsed: 20, plan: "free" }) // free = 30 credits, 20 used = 10 remaining
      .where(eq(subscriptions.userId, TEST_USER_ID));
  });

  it("exactly 1 of 10 concurrent requests succeeds when 10 credits remain and cost is 10", async () => {
    // Fire 10 concurrent requests — each costs 10 credits, only 1 should succeed
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        atomicCheckGeneration(TEST_USER_ID, `app-${i}`)
      )
    );

    const allowed = results.filter((r) => r.allowed);
    const denied = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(1);
    expect(denied).toHaveLength(9);
    denied.forEach((r) => expect(r.reason).toBe("insufficient_credits"));
  });

  it("credits_used counter is exactly 30 after 1 successful deduction from 20", async () => {
    await atomicCheckGeneration(TEST_USER_ID, "app-test");
    const sub = await db
      .select({ creditsUsed: subscriptions.creditsUsed })
      .from(subscriptions)
      .where(eq(subscriptions.userId, TEST_USER_ID))
      .limit(1);
    expect(sub[0]?.creditsUsed).toBe(30); // 20 + 10 = 30 (at limit)
  });
});
```
**Output:** Concurrent deduction test passing  
**Effort:** full day

---

## Story 1.2: Remove In-Memory Billing Cache

**As a** backend engineer,  
**I want** the billing cache to be removed or replaced with a short-lived database read,  
**so that** credit balance is always accurate across multiple serverless instances.

**Acceptance Criteria:**
- [ ] The `_cache` Map in `packages/billing/src/index.ts` is removed
- [ ] `getSubscription()` reads directly from the database (with a 30-second Redis cache if Redis is available, no cache if not)
- [ ] `atomicCheckGeneration()` does not use the cache at all — it uses the atomic UPDATE from Story 1.1
- [ ] No double-spend is possible: two concurrent `atomicCheckGeneration` calls for a user at their credit limit result in exactly one success

### Task 1.2.1: Remove in-memory cache from billing module
**Owner:** Backend Engineer  
**Deliverable:** `_cache` Map removed, `getSubscription` reads from DB  
**Dependencies:** Task 1.1.1 (creditsUsed counter must exist)

##### Subtask: Remove _cache Map and cacheGet/cacheSet/cacheDel functions
Open `packages/billing/src/index.ts`. Delete lines 35–50 (the `_cache` Map and helper functions). Update `getSubscription` to read directly from the database:

```typescript
export async function getSubscription(userId: string): Promise<SubscriptionInfo> {
  // Direct DB read — no in-memory cache
  // If Redis is available (Charter 05), add a 30-second Redis cache here
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const sub = subRows[0];
  const plan = (sub?.plan ?? "free") as PlanTier;
  const creditsLimit = getPlanCredits(plan);
  const creditsUsed = sub?.creditsUsed ?? 0; // Read from counter column
  const creditsRemaining = Math.max(creditsLimit - creditsUsed, 0);

  return {
    plan,
    status: sub?.status ?? "active",
    creditsUsed,
    creditsLimit,
    creditsRemaining,
    creditsUsedUsd: creditsUsed / 10,
    creditsLimitUsd: creditsLimit / 10,
    creditsRemainingUsd: creditsRemaining / 10,
    generationsUsed: Math.floor(creditsUsed / CREDIT_COSTS.generation),
    generationsLimit: Math.floor(creditsLimit / CREDIT_COSTS.generation),
  };
}
```

Also remove all `cacheDel(...)` calls from `atomicCheckGeneration`, `recordUsage`, `upgradeToPro`, `upgradeToMax`.  
**Output:** In-memory cache removed; `getSubscription` reads from DB  
**Effort:** half day

##### Subtask: Update existing billing tests
Run `pnpm --filter @retune/billing test`. Fix any tests that relied on cache behaviour.  
**Output:** All existing billing tests pass  
**Effort:** half day
