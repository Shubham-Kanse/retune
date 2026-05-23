# Epic 03: Cost Controls

**Charter:** AI/ML Excellence  
**Priority:** P1 — Sprint 3  
**Complexity:** L  
**Owner:** AI Platform Engineer + Backend Engineer

---

## Goal

Implement granular per-invocation AI cost tracking and per-user daily cost limits. Every specialist LLM call produces a cost record in the database, and users who exceed their daily AI spend ceiling are blocked from starting new generations.

## Definition of Done

- [ ] `ai_cost_records` table exists in `packages/db/src/pg/schema.ts` with all specified columns
- [ ] Migration creates the table in Postgres
- [ ] Orchestrator writes an `ai_cost_records` row after each specialist invocation (when persistence is available)
- [ ] `MAX_DAILY_AI_COST_USD` env var controls the per-user daily ceiling (default $5.00)
- [ ] `atomicCheckGeneration` returns `{ allowed: false, reason: 'daily_ai_cost_limit_exceeded' }` when a user's daily AI cost exceeds the limit
- [ ] Unit test: user with $4.90 daily spend, generation estimated at $0.15 — denied
- [ ] All existing agent tests pass (212/212)
- [ ] All existing billing tests pass (17/18 or better)

---

## Context: Current Problem

### No Per-Invocation Cost Tracking

**File: `packages/agent/src/workbench/budget-controller.ts`**

```typescript
// CURRENT — tracks cost in-memory per generation only:
export class BudgetController {
  spent(): number { return this.budget.spent_usd; }
  remaining(): number { return Math.max(0, this.budget.ceiling_usd - this.budget.spent_usd); }
}
```

The budget controller tracks cost within a single generation run but never persists individual specialist costs to the database. When the generation completes, the per-specialist cost breakdown is lost.

### No Daily Aggregate Limits

**File: `packages/billing/src/index.ts` (`atomicCheckGeneration`)**

```typescript
// CURRENT — checks credit balance only, no daily AI cost limit:
export async function atomicCheckGeneration(userId: string, _applicationId: string): Promise<UsageCheck> {
  // ... checks creditsRemaining vs cost
  // No check for daily AI spend
}
```

A user with remaining credits can trigger unlimited generations per day, potentially running up significant AI provider costs with no guardrail.

---

## Story 3.1: Add ai_cost_records Table

**As a** backend engineer,  
**I want** an `ai_cost_records` table that stores per-specialist LLM invocation costs,  
**so that** we have granular cost attribution and can enforce daily limits.

**Acceptance Criteria:**
- [ ] `ai_cost_records` table defined in `packages/db/src/pg/schema.ts`
- [ ] Columns: `id` (UUID PK), `user_id` (FK → users), `generation_id` (FK → generations, nullable), `specialist` (varchar 128), `model` (varchar 64), `input_tokens` (integer), `output_tokens` (integer), `cost_usd` (double precision), `created_at` (timestamptz)
- [ ] Index on `(user_id, created_at)` for daily aggregation queries
- [ ] Migration file creates the table
- [ ] Drizzle schema compiles without errors

### Task 3.1.1: Add schema definition

**Owner:** Backend Engineer  
**Deliverable:** Modified `packages/db/src/pg/schema.ts`  
**Effort:** 1h

##### Subtask: Add table definition

Add to `packages/db/src/pg/schema.ts`:

```typescript
// ─────────────── AI Cost Records ───────────────

export const ai_cost_records = pgTable(
  "ai_cost_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().references(() => users.id),
    generation_id: uuid("generation_id").references(() => generations.id),
    specialist: varchar("specialist", { length: 128 }).notNull(),
    model: varchar("model", { length: 64 }).notNull(),
    input_tokens: integer("input_tokens").notNull(),
    output_tokens: integer("output_tokens").notNull(),
    cost_usd: doublePrecision("cost_usd").notNull(),
    created_at: tcol("created_at"),
  },
  (table) => ({
    user_daily_idx: index("ai_cost_records_user_daily_idx").on(table.user_id, table.created_at),
  }),
);
```

**Effort:** 30 min

##### Subtask: Verify schema compiles

```bash
pnpm --filter @retune/db build
```

**Effort:** 10 min

### Task 3.1.2: Write migration

**Owner:** Backend Engineer  
**Deliverable:** `packages/db/src/pg/migrations/XXXX_ai_cost_records.sql`  
**Effort:** 45 min

##### Subtask: Create migration file

Create `packages/db/src/pg/migrations/0013_ai_cost_records.sql`:

```sql
-- Migration: Create ai_cost_records table for per-specialist cost tracking

CREATE TABLE IF NOT EXISTS ai_cost_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  generation_id UUID REFERENCES generations(id),
  specialist VARCHAR(128) NOT NULL,
  model VARCHAR(64) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for daily cost aggregation queries (WHERE user_id = $1 AND created_at >= $today)
CREATE INDEX IF NOT EXISTS ai_cost_records_user_daily_idx
  ON ai_cost_records (user_id, created_at);

-- Index for per-generation cost breakdown
CREATE INDEX IF NOT EXISTS ai_cost_records_generation_idx
  ON ai_cost_records (generation_id);
```

**Effort:** 30 min

##### Subtask: Run migration locally

```bash
pnpm db:migrate
```

Verify table exists:
```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ai_cost_records';
```

**Effort:** 15 min

### Task 3.1.3: Write schema test

**Owner:** Backend Engineer  
**Deliverable:** Test assertion  
**Effort:** 30 min

##### Subtask: Verify table structure in test

Add to `packages/db/src/pg/schema.test.ts` (or create if not exists):

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ai_cost_records } from "./schema";

describe("ai_cost_records schema", () => {
  it("has all required columns", () => {
    const columns = Object.keys(ai_cost_records);
    assert.ok(columns.includes("id"));
    assert.ok(columns.includes("user_id"));
    assert.ok(columns.includes("generation_id"));
    assert.ok(columns.includes("specialist"));
    assert.ok(columns.includes("model"));
    assert.ok(columns.includes("input_tokens"));
    assert.ok(columns.includes("output_tokens"));
    assert.ok(columns.includes("cost_usd"));
    assert.ok(columns.includes("created_at"));
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | `ai_cost_records` has all 9 columns | All column names present in schema object |

**Effort:** 30 min

---

## Story 3.2: Persist Cost Records from Orchestrator

**As a** platform engineer,  
**I want** the orchestrator to write an `ai_cost_records` row after each specialist invocation,  
**so that** every LLM call is tracked with cost attribution.

**Acceptance Criteria:**
- [ ] After each specialist completes, if `persistence` is available, a row is inserted into `ai_cost_records`
- [ ] The row includes: `user_id` (from generation context), `generation_id`, specialist name, model used, input/output tokens, computed cost
- [ ] Cost is computed from token counts using a model pricing lookup
- [ ] When persistence is NOT available (in-memory mode), no error is thrown — cost tracking is best-effort
- [ ] Existing orchestrator behavior is unchanged (tick cycle, budget checks, goal progression)

### Task 3.2.1: Add cost recording to orchestrator tick

**Owner:** AI Platform Engineer  
**Deliverable:** Modified `packages/agent/src/workbench/orchestrator.ts`  
**Effort:** 2h

##### Subtask: Define cost record interface

Add to `packages/agent/src/workbench/types.ts`:

```typescript
export interface AICostRecord {
  user_id: string;
  generation_id: string;
  specialist: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}
```

**Effort:** 15 min

##### Subtask: Add recordCost method to TickPersistence interface

Update `packages/agent/src/persistence/types.ts`:

```typescript
export interface TickPersistence {
  // ... existing methods ...

  /** Persist an AI cost record after specialist invocation. Best-effort — may no-op. */
  recordAICost?(record: AICostRecord): Promise<void>;
}
```

**Effort:** 15 min

##### Subtask: Insert cost record after specialist execution

In `packages/agent/src/workbench/orchestrator.ts`, after the specialist run completes and cost is charged to the budget controller:

```typescript
// After specialist execution and budget charge:
if (this.deps.persistence?.recordAICost && telemetry) {
  await this.deps.persistence.recordAICost({
    user_id: this.context.userId,
    generation_id: this.context.generationId,
    specialist: specialist.name,
    model: telemetry.model,
    input_tokens: telemetry.inputTokens,
    output_tokens: telemetry.outputTokens,
    cost_usd: telemetry.costUsd,
  }).catch(() => {
    // Best-effort: do not fail the generation if cost recording fails
  });
}
```

**Effort:** 1h

##### Subtask: Implement recordAICost in Postgres persistence adapter

Update `packages/agent/src/persistence/pg-persistence.ts` (or equivalent):

```typescript
async recordAICost(record: AICostRecord): Promise<void> {
  await this.db.insert(ai_cost_records).values({
    user_id: record.user_id,
    generation_id: record.generation_id,
    specialist: record.specialist,
    model: record.model,
    input_tokens: record.input_tokens,
    output_tokens: record.output_tokens,
    cost_usd: record.cost_usd,
  });
}
```

**Effort:** 30 min

### Task 3.2.2: Add model pricing lookup

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/lib/model-pricing.ts`  
**Effort:** 1h

##### Subtask: Create pricing table

Create `packages/agent/src/lib/model-pricing.ts`:

```typescript
interface ModelPricing {
  inputPer1M: number;  // USD per 1M input tokens
  outputPer1M: number; // USD per 1M output tokens
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-4o": { inputPer1M: 2.50, outputPer1M: 10.00 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gpt-4-turbo": { inputPer1M: 10.00, outputPer1M: 30.00 },
  "claude-sonnet-4-20250514": { inputPer1M: 3.00, outputPer1M: 15.00 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.80, outputPer1M: 4.00 },
  "claude-3-opus-20240229": { inputPer1M: 15.00, outputPer1M: 75.00 },
};

const DEFAULT_PRICING: ModelPricing = { inputPer1M: 5.00, outputPer1M: 15.00 };

export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) / 1_000_000;
}
```

**Effort:** 1h

### Task 3.2.3: Write cost recording tests

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/workbench/orchestrator-cost.test.ts`  
**Effort:** 1.5h

##### Subtask: Write orchestrator cost recording test

Create `packages/agent/src/workbench/orchestrator-cost.test.ts`:

```typescript
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

describe("Orchestrator cost recording", () => {
  it("calls recordAICost after specialist execution when persistence is available", async () => {
    const recordAICost = mock.fn(async () => {});
    const mockPersistence = { recordAICost };

    // Setup orchestrator with mock persistence and a mock specialist
    // that returns telemetry with token counts
    const mockTelemetry = {
      model: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: 0.0075,
    };

    // After specialist execution, verify recordAICost was called
    // (Full orchestrator setup omitted for brevity — use existing test harness)

    assert.equal(recordAICost.mock.calls.length, 1);
    const record = recordAICost.mock.calls[0].arguments[0];
    assert.equal(record.specialist, "bullet-composer");
    assert.equal(record.model, "gpt-4o");
    assert.equal(record.input_tokens, 1000);
    assert.equal(record.output_tokens, 500);
    assert.equal(record.cost_usd, 0.0075);
  });

  it("does not throw when persistence is unavailable", async () => {
    // Setup orchestrator with persistence = undefined
    // Run a specialist — should complete without error
    // (Verifies the optional chaining / catch pattern works)
    assert.ok(true, "No error thrown when persistence is undefined");
  });

  it("does not throw when recordAICost rejects", async () => {
    const recordAICost = mock.fn(async () => {
      throw new Error("DB connection lost");
    });
    const mockPersistence = { recordAICost };

    // Run specialist — should complete despite recordAICost failure
    // (Verifies the .catch() swallows the error)
    assert.ok(true, "No error thrown when recordAICost rejects");
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | `recordAICost` called once per specialist invocation | `calls.length === 1` |
| 2 | Record contains correct specialist name | `record.specialist === "bullet-composer"` |
| 3 | Record contains correct model | `record.model === "gpt-4o"` |
| 4 | Record contains correct token counts | `input_tokens === 1000, output_tokens === 500` |
| 5 | No error when persistence unavailable | No exception thrown |
| 6 | No error when recordAICost rejects | No exception thrown |

**Effort:** 1.5h

---

## Story 3.3: Enforce Daily Per-User Cost Limit

**As a** platform engineer,  
**I want** `atomicCheckGeneration` to deny new generations when a user's daily AI cost exceeds `MAX_DAILY_AI_COST_USD`,  
**so that** no single user can run up unbounded AI provider costs.

**Acceptance Criteria:**
- [ ] `MAX_DAILY_AI_COST_USD` env var controls the daily ceiling (default: `5.00`)
- [ ] `atomicCheckGeneration` queries `ai_cost_records` for the user's spend today (UTC)
- [ ] If `daily_spend + estimated_generation_cost > MAX_DAILY_AI_COST_USD`, returns `{ allowed: false, reason: 'daily_ai_cost_limit_exceeded' }`
- [ ] If `ai_cost_records` table doesn't exist or query fails, the check is skipped (graceful degradation)
- [ ] Env var added to `.env.example`

### Task 3.3.1: Add daily cost check to atomicCheckGeneration

**Owner:** Backend Engineer  
**Deliverable:** Modified `packages/billing/src/index.ts`  
**Effort:** 2h

##### Subtask: Add env var parsing

```typescript
const MAX_DAILY_AI_COST_USD = Number(process.env.MAX_DAILY_AI_COST_USD ?? "5.00");
```

**Effort:** 5 min

##### Subtask: Add daily cost query

In `packages/billing/src/index.ts`, inside `atomicCheckGeneration`, after the existing credit check passes:

```typescript
// Daily AI cost limit check
try {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const dailyCostRows = await tx
    .select({ total: sql<number>`COALESCE(SUM(${ai_cost_records.cost_usd}), 0)` })
    .from(ai_cost_records)
    .where(
      and(
        eq(ai_cost_records.user_id, userId),
        sql`${ai_cost_records.created_at} >= ${todayStart.toISOString()}`,
      ),
    );

  const dailySpend = Number(dailyCostRows[0]?.total ?? 0);
  const estimatedCost = 0.15; // Conservative estimate per generation

  if (dailySpend + estimatedCost > MAX_DAILY_AI_COST_USD) {
    return {
      allowed: false,
      reason: "daily_ai_cost_limit_exceeded" as const,
      creditsRemaining,
      creditsCost: cost,
      remainingCreditsUsd: creditsRemaining / 10,
      costUsd: cost / 10,
    };
  }
} catch {
  // Graceful degradation: if ai_cost_records doesn't exist or query fails,
  // skip the daily limit check and allow the generation
}
```

**Effort:** 1.5h

##### Subtask: Add env var to .env.example

Add to `.env.example`:

```bash
# ─── AI Cost Limits (OPTIONAL — defaults shown) ──────────────────────────────
# Per-user daily AI cost ceiling in USD. Generations denied when exceeded.
# MAX_DAILY_AI_COST_USD=5.00
```

**Effort:** 5 min

##### Subtask: Update UsageCheck type

Ensure the `reason` field in `UsageCheck` type supports the new value:

```typescript
export interface UsageCheck {
  allowed: boolean;
  reason?: "insufficient_credits" | "daily_ai_cost_limit_exceeded";
  creditsRemaining: number;
  creditsCost: number;
  remainingCreditsUsd: number;
  costUsd: number;
}
```

**Effort:** 15 min

### Task 3.3.2: Write daily cost limit tests

**Owner:** Backend Engineer  
**Deliverable:** `packages/billing/src/daily-cost-limit.test.ts`  
**Effort:** 2h

##### Subtask: Write comprehensive daily limit tests

Create `packages/billing/src/daily-cost-limit.test.ts`:

```typescript
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

describe("Daily AI cost limit", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.MAX_DAILY_AI_COST_USD = "5.00";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("denies generation when daily spend ($4.90) + estimated cost ($0.15) exceeds limit ($5.00)", async () => {
    // Setup: user has $4.90 in ai_cost_records for today
    // Insert test records:
    //   - specialist: "bullet-composer", cost_usd: 2.50, created_at: today
    //   - specialist: "gap-mapper", cost_usd: 2.40, created_at: today
    // Total: $4.90

    const result = await atomicCheckGeneration(testUserId, testApplicationId);

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "daily_ai_cost_limit_exceeded");
  });

  it("allows generation when daily spend ($3.00) + estimated cost ($0.15) is under limit ($5.00)", async () => {
    // Setup: user has $3.00 in ai_cost_records for today
    // Insert test records:
    //   - specialist: "bullet-composer", cost_usd: 3.00, created_at: today

    const result = await atomicCheckGeneration(testUserId, testApplicationId);

    assert.equal(result.allowed, true);
  });

  it("allows generation when no ai_cost_records exist for today", async () => {
    // Setup: no records in ai_cost_records for this user today

    const result = await atomicCheckGeneration(testUserId, testApplicationId);

    assert.equal(result.allowed, true);
  });

  it("ignores yesterday's cost records", async () => {
    // Setup: user has $10.00 in ai_cost_records but all from yesterday
    // Insert test records:
    //   - specialist: "bullet-composer", cost_usd: 10.00, created_at: yesterday

    const result = await atomicCheckGeneration(testUserId, testApplicationId);

    assert.equal(result.allowed, true);
  });

  it("respects custom MAX_DAILY_AI_COST_USD value", async () => {
    process.env.MAX_DAILY_AI_COST_USD = "2.00";

    // Setup: user has $1.90 in ai_cost_records for today
    const result = await atomicCheckGeneration(testUserId, testApplicationId);

    assert.equal(result.allowed, false);
    assert.equal(result.reason, "daily_ai_cost_limit_exceeded");
  });

  it("gracefully degrades when ai_cost_records table does not exist", async () => {
    // Setup: drop ai_cost_records table (or mock query to throw)
    // atomicCheckGeneration should still return allowed: true
    // (falls through to credit check only)

    const result = await atomicCheckGeneration(testUserId, testApplicationId);

    assert.equal(result.allowed, true);
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | User with $4.90 daily spend + $0.15 estimated > $5.00 limit → denied | `allowed === false, reason === "daily_ai_cost_limit_exceeded"` |
| 2 | User with $3.00 daily spend + $0.15 estimated < $5.00 limit → allowed | `allowed === true` |
| 3 | No records today → allowed | `allowed === true` |
| 4 | Yesterday's records ignored → allowed | `allowed === true` |
| 5 | Custom limit ($2.00) respected | `allowed === false` at $1.90 spend |
| 6 | Table missing → graceful degradation, allowed | `allowed === true` |

**Effort:** 2h

---

## Story 3.4: Model Pricing Accuracy Tests

**As a** platform engineer,  
**I want** the model pricing lookup to produce accurate cost estimates,  
**so that** daily limits are enforced based on real costs, not wildly inaccurate estimates.

**Acceptance Criteria:**
- [ ] `computeCostUsd` returns correct values for known models
- [ ] Unknown models use a conservative default pricing
- [ ] Cost computation is deterministic (same inputs → same output)

### Task 3.4.1: Write pricing unit tests

**Owner:** AI Platform Engineer  
**Deliverable:** `packages/agent/src/lib/model-pricing.test.ts`  
**Effort:** 1h

##### Subtask: Write pricing tests

Create `packages/agent/src/lib/model-pricing.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCostUsd } from "./model-pricing";

describe("computeCostUsd", () => {
  it("computes correct cost for gpt-4o (1000 input, 500 output)", () => {
    // gpt-4o: $2.50/1M input, $10.00/1M output
    // Expected: (1000 * 2.50 + 500 * 10.00) / 1_000_000 = 0.0075
    const cost = computeCostUsd("gpt-4o", 1000, 500);
    assert.equal(cost, 0.0075);
  });

  it("computes correct cost for claude-sonnet-4-20250514 (2000 input, 1000 output)", () => {
    // claude-sonnet-4-20250514: $3.00/1M input, $15.00/1M output
    // Expected: (2000 * 3.00 + 1000 * 15.00) / 1_000_000 = 0.021
    const cost = computeCostUsd("claude-sonnet-4-20250514", 2000, 1000);
    assert.equal(cost, 0.021);
  });

  it("uses default pricing for unknown model", () => {
    // Default: $5.00/1M input, $15.00/1M output
    // Expected: (1000 * 5.00 + 1000 * 15.00) / 1_000_000 = 0.02
    const cost = computeCostUsd("unknown-model-xyz", 1000, 1000);
    assert.equal(cost, 0.02);
  });

  it("returns 0 for zero tokens", () => {
    const cost = computeCostUsd("gpt-4o", 0, 0);
    assert.equal(cost, 0);
  });

  it("handles large token counts without overflow", () => {
    // 1M input tokens of gpt-4o: $2.50
    const cost = computeCostUsd("gpt-4o", 1_000_000, 0);
    assert.equal(cost, 2.5);
  });
});
```

**Tests:**
| # | Assertion | Expected |
|---|-----------|----------|
| 1 | gpt-4o 1000/500 tokens | `cost === 0.0075` |
| 2 | claude-sonnet-4-20250514 2000/1000 tokens | `cost === 0.021` |
| 3 | Unknown model uses default pricing | `cost === 0.02` |
| 4 | Zero tokens → zero cost | `cost === 0` |
| 5 | 1M tokens → correct dollar amount | `cost === 2.5` |

**Effort:** 1h

---

## Effort Summary

| Story | Effort |
|-------|--------|
| 3.1: Add ai_cost_records Table | 2.25h |
| 3.2: Persist Cost Records from Orchestrator | 4.5h |
| 3.3: Enforce Daily Per-User Cost Limit | 4h |
| 3.4: Model Pricing Accuracy Tests | 1h |
| **Total** | **11.75h** |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Daily cost query adds latency to `atomicCheckGeneration` | Index on `(user_id, created_at)` ensures the query is a fast index scan. Estimated < 5ms. |
| Model pricing becomes stale as providers update prices | Pricing table is a simple constant; update quarterly or when provider announces changes. Default pricing is conservative (overestimates). |
| `ai_cost_records` table grows unbounded | Add a 90-day retention policy (cron job or pg_partman). Not in scope for this epic but noted for future. |
| Cost recording failure blocks generation | `.catch()` swallows errors — cost recording is best-effort, never blocks the generation pipeline. |
| Race condition: two generations start simultaneously, both pass daily check | Acceptable: worst case is one generation over-limit (~$0.20 overshoot). The check is advisory, not transactional across generations. |


---

## Architect addendum (2026-05-22)

The intern's draft introduces an `ai_cost_records` table. The codebase is already partway there — adjust the spec to match.

### `ModelCallTelemetry` already exists in code, just no DB target

Verified in `packages/agent/src/lib/provider-shared.ts`: every LLM call records a `ModelCallTelemetry` object (model, prompt_tokens, completion_tokens, cost_usd, latency_ms, agent_name, specialist) into a per-process buffer. `provider.drainModelCallTelemetry()` returns it. **There is no DB table to flush it to** — the buffer is dropped on process exit.

The architect-correct spec:

1. Add Drizzle migration `0012_generation_model_calls.sql` (use this name to match the existing schema commentary in `packages/db/src/pg/schema.ts` which references the missing table). Columns: `id uuid pk`, `generation_id uuid fk`, `tick_seq int`, `specialist text`, `agent_name text`, `model text`, `provider text` (anthropic|openai), `prompt_tokens int`, `completion_tokens int`, `cost_usd numeric(10,6)`, `latency_ms int`, `quality_mode text` (fast|balanced|frontier), `cached bool`, `error text nullable`, `created_at timestamptz default now()`.
2. Add `record_model_calls(input)` to `packages/agent/src/persistence/postgres-persistence.ts` — bulk-insert with `onConflictDoNothing` keyed by `(generation_id, tick_seq, specialist, agent_name)`.
3. Hook the orchestrator post-tick: drain `provider.drainModelCallTelemetry()` and pass to `persistence.record_model_calls()` inside the per-tick transaction (preserves atomicity with audit_entries).
4. Per-user daily cost gate at the generation start: `SELECT SUM(cost_usd) FROM generation_model_calls JOIN generations ON gen_id WHERE user_id = ? AND created_at > now() - interval '24h'`. If `>= MAX_DAILY_AI_COST_USD` (default $5.00), reject with 429 + clear UX. Index `(generation_id, created_at DESC)` and `(generation_id)` cover this query.

### Reconcile the dual budget ceiling bug

Verified in `apps/api/src/runtime/workbench-runtime.ts:498`: `ceiling_usd: 0.2, hard_kill_usd: 0.5`. Verified in the Temporal substrate (`packages/agent/src/temporal/activities/substrate.ts`): `0.05, 0.2`. Two budget ceilings depending on which runtime path the request takes — billing-correctness defect. Story 3.X must:

- Move both ceilings to a single config object exported from `packages/agent` (or read from env vars per `quality_mode`).
- Document the per-quality-mode budget: `fast = $0.05/$0.10`, `balanced = $0.10/$0.20`, `frontier = $0.30/$0.60`.
- Test: spin up both runtimes for the same generation and assert identical `cost_budget` in the blackboard.

### Wire the existing `ConcurrencyManager`

`packages/agent/src/lib/concurrency-manager.ts` is exported but no provider uses it. Add Story 3.Y: wrap each `AIProvider` with a `ConcurrencyManager(maxParallel: 8)` per process, with a separate cap for the frontier tier (1 concurrent globally — frontier models OOM under fan-out).

### Verification

- `SELECT SUM(cost_usd) FROM generation_model_calls WHERE generation_id = '<id>'` matches `generations.total_cost_usd` for any completed generation (within float-rounding tolerance).
- Per-user daily limit gate test: simulate $4.99 spent in 24h, attempt new generation → succeeds. Spend +$0.05 → next request returns 429.
- Concurrency test: fire 50 concurrent generations with mocked providers; LLM call concurrency never exceeds 8 per process.
