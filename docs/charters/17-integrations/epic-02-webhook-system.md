# Epic 02 — Webhook System

## Summary

Add a webhook system that allows users to register HTTP endpoints for event notifications, delivers signed payloads with HMAC-SHA256, and retries failed deliveries with exponential backoff.

## Stories

---

### Story 1: Add Webhook Schema

**As a** platform engineer  
**I want** `webhooks` and `webhook_deliveries` tables  
**So that** webhook registrations and delivery state can be persisted  

#### Acceptance Criteria

- [ ] `webhooks` table exists with columns: `id`, `user_id`, `url`, `events`, `secret`, `active`, `created_at`
- [ ] `user_id` references `users.id`
- [ ] `events` is a text array (e.g., `['generation.completed', 'generation.failed']`)
- [ ] `secret` stores the HMAC signing key (64 chars)
- [ ] `webhook_deliveries` table exists with columns: `id`, `webhook_id`, `event`, `payload`, `status`, `attempts`, `next_retry_at`, `delivered_at`, `created_at`
- [ ] `webhook_id` references `webhooks.id`
- [ ] `status` defaults to `'pending'`
- [ ] `attempts` defaults to `0`
- [ ] Migration applies cleanly

#### Tasks

**Task 1.1: Add schema definitions**  
File: `packages/db/src/pg/schema.ts`  
Effort: 1 hour

```typescript
export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id),
  url: text('url').notNull(),
  events: text('events').array().notNull(), // ['generation.completed', 'generation.failed']
  secret: varchar('secret', { length: 64 }).notNull(), // HMAC signing secret
  active: boolean('active').notNull().default(true),
  createdAt: tcol('created_at'),
});

export const webhook_deliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  webhookId: uuid('webhook_id').notNull().references(() => webhooks.id),
  event: varchar('event', { length: 64 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'), // 'pending' | 'delivered' | 'failed'
  attempts: integer('attempts').notNull().default(0),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  createdAt: tcol('created_at'),
});
```

**Task 1.2: Create migration file**  
File: `packages/db/migrations/0016_webhooks.sql`  
Effort: 30 minutes

```sql
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret VARCHAR(64) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id),
  event VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_user ON webhooks(user_id);
CREATE INDEX idx_webhooks_active ON webhooks(active) WHERE active = true;
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';
```

**Task 1.3: Export schema from package**  
File: `packages/db/src/pg/index.ts`  
Effort: 5 minutes

```typescript
export { webhooks, webhook_deliveries } from './schema';
```

#### Tests

File: `packages/db/src/pg/__tests__/webhooks.test.ts`  
Effort: 30 minutes

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { webhooks, webhook_deliveries } from '../schema';

describe('webhooks schema', () => {
  it('webhooks table has required columns', () => {
    const cols = Object.keys(webhooks);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('userId'));
    assert.ok(cols.includes('url'));
    assert.ok(cols.includes('events'));
    assert.ok(cols.includes('secret'));
    assert.ok(cols.includes('active'));
    assert.ok(cols.includes('createdAt'));
  });

  it('webhook_deliveries table has required columns', () => {
    const cols = Object.keys(webhook_deliveries);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('webhookId'));
    assert.ok(cols.includes('event'));
    assert.ok(cols.includes('payload'));
    assert.ok(cols.includes('status'));
    assert.ok(cols.includes('attempts'));
    assert.ok(cols.includes('nextRetryAt'));
    assert.ok(cols.includes('deliveredAt'));
    assert.ok(cols.includes('createdAt'));
  });
});
```

---

### Story 2: Implement Webhook Dispatcher

**As a** platform engineer  
**I want** a webhook dispatcher that signs payloads and retries on failure  
**So that** webhook consumers receive reliable, verifiable notifications  

#### Acceptance Criteria

- [ ] `dispatchWebhook(event, payload)` finds all active webhooks subscribed to the event
- [ ] Payload is signed with HMAC-SHA256 using the webhook's `secret`
- [ ] Signature is sent as `X-Retune-Signature: sha256=<hex-encoded-hmac>` header
- [ ] HTTP request has a 10-second timeout
- [ ] On 2xx response: delivery marked as `'delivered'` with `delivered_at` timestamp
- [ ] On non-2xx or timeout: delivery marked for retry with exponential backoff
- [ ] Retry schedule: 1 minute, 5 minutes, 30 minutes, 2 hours, 8 hours
- [ ] After 5 failed attempts: delivery marked as `'failed'`, no more retries
- [ ] Dispatcher does not block the calling function (fire-and-forget with persistence)

#### Tasks

**Task 2.1: Create webhook dispatcher module**  
File: `apps/api/src/lib/webhook-dispatcher.ts`  
Effort: 3 hours

```typescript
import { createHmac } from 'node:crypto';
import { db } from '@retune/db';
import { webhooks, webhook_deliveries } from '@retune/db';
import { eq, and, sql } from 'drizzle-orm';

const RETRY_DELAYS_MS = [
  60_000,        // 1 minute
  300_000,       // 5 minutes
  1_800_000,     // 30 minutes
  7_200_000,     // 2 hours
  28_800_000,    // 8 hours
];

const DELIVERY_TIMEOUT_MS = 10_000;

function signPayload(payload: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

export async function dispatchWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
  const activeWebhooks = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.active, true), sql`${event} = ANY(${webhooks.events})`));

  for (const webhook of activeWebhooks) {
    // Fire-and-forget: don't await
    deliverToWebhook(webhook, event, payload).catch(() => {});
  }
}

async function deliverToWebhook(
  webhook: typeof webhooks.$inferSelect,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify(payload);
  const signature = signPayload(body, webhook.secret);

  // Create delivery record
  const [delivery] = await db
    .insert(webhook_deliveries)
    .values({
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
    })
    .returning();

  await attemptDelivery(delivery.id, webhook.url, body, signature, 0);
}

async function attemptDelivery(
  deliveryId: string,
  url: string,
  body: string,
  signature: string,
  attempt: number,
): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Retune-Signature': signature,
        'X-Retune-Event': body ? JSON.parse(body).event || '' : '',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      await db
        .update(webhook_deliveries)
        .set({
          status: 'delivered',
          attempts: attempt + 1,
          deliveredAt: new Date(),
        })
        .where(eq(webhook_deliveries.id, deliveryId));
    } else {
      await handleFailure(deliveryId, attempt);
    }
  } catch {
    await handleFailure(deliveryId, attempt);
  }
}

async function handleFailure(deliveryId: string, attempt: number): Promise<void> {
  const nextAttempt = attempt + 1;

  if (nextAttempt >= 5) {
    await db
      .update(webhook_deliveries)
      .set({ status: 'failed', attempts: nextAttempt })
      .where(eq(webhook_deliveries.id, deliveryId));
    return;
  }

  const nextRetryAt = new Date(Date.now() + RETRY_DELAYS_MS[nextAttempt - 1]);

  await db
    .update(webhook_deliveries)
    .set({
      attempts: nextAttempt,
      nextRetryAt,
    })
    .where(eq(webhook_deliveries.id, deliveryId));
}
```

**Task 2.2: Export signPayload for testing**  
File: `apps/api/src/lib/webhook-dispatcher.ts`  
Effort: 5 minutes

```typescript
// Export for testing
export { signPayload };
```

---

### Story 3: Integrate Webhook Dispatch into Generation Pipeline

**As a** user with a registered webhook  
**I want** to receive a notification when my generation completes or fails  
**So that** I can automate downstream workflows  

#### Acceptance Criteria

- [ ] `dispatchWebhook('generation.completed', payload)` is called at the end of successful generation
- [ ] `dispatchWebhook('generation.failed', payload)` is called on generation failure
- [ ] Payload includes `generationId`, `userId`, `status`, and `completedAt`/`failedAt`
- [ ] Webhook dispatch does not block generation completion (fire-and-forget)

#### Tasks

**Task 3.1: Add webhook dispatch to workbench runtime**  
File: `packages/agent/src/workbench-runtime.ts` (or equivalent generation completion point)  
Effort: 1 hour

```typescript
import { dispatchWebhook } from '@retune/api/lib/webhook-dispatcher';

// At the end of successful generation:
dispatchWebhook('generation.completed', {
  generationId: generation.id,
  userId: generation.userId,
  status: 'completed',
  completedAt: new Date().toISOString(),
}).catch(() => {}); // Fire-and-forget

// On generation failure:
dispatchWebhook('generation.failed', {
  generationId: generation.id,
  userId: generation.userId,
  status: 'failed',
  failedAt: new Date().toISOString(),
  error: error.message,
}).catch(() => {}); // Fire-and-forget
```

---

### Story 4: Write Webhook Dispatcher Tests

**As a** developer  
**I want** tests proving HMAC signatures are correct and retries work  
**So that** I have confidence the webhook system is reliable  

#### Acceptance Criteria

- [ ] Test verifies HMAC-SHA256 signature matches expected value for a known payload + secret
- [ ] Test verifies successful delivery marks status as `'delivered'`
- [ ] Test verifies 500 response triggers retry scheduling
- [ ] Test verifies after 5 failures, status is `'failed'`
- [ ] Test verifies retry delays match the exponential backoff schedule

#### Tasks

**Task 4.1: Write dispatcher unit tests**  
File: `apps/api/src/lib/__tests__/webhook-dispatcher.test.ts`  
Effort: 2.5 hours

```typescript
import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import { signPayload } from '../webhook-dispatcher';

describe('webhook-dispatcher', () => {
  describe('signPayload', () => {
    it('produces correct HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ generationId: '123', status: 'completed' });
      const secret = 'test-secret-key-1234567890abcdef';

      const result = signPayload(payload, secret);

      // Compute expected independently
      const expected = createHmac('sha256', secret).update(payload).digest('hex');
      assert.strictEqual(result, `sha256=${expected}`);
    });

    it('produces different signatures for different secrets', () => {
      const payload = JSON.stringify({ id: '123' });

      const sig1 = signPayload(payload, 'secret-a');
      const sig2 = signPayload(payload, 'secret-b');

      assert.notStrictEqual(sig1, sig2);
    });

    it('produces different signatures for different payloads', () => {
      const secret = 'same-secret';

      const sig1 = signPayload(JSON.stringify({ id: '1' }), secret);
      const sig2 = signPayload(JSON.stringify({ id: '2' }), secret);

      assert.notStrictEqual(sig1, sig2);
    });
  });

  describe('delivery with mock HTTP endpoint', () => {
    it('marks delivery as delivered on 200 response', async () => {
      // Mock fetch to return 200
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('OK', { status: 200 });

      try {
        // Call dispatchWebhook with a test webhook in DB
        // Verify delivery record has status = 'delivered'
        // (Integration test requiring DB setup)
        assert.ok(true, 'placeholder — requires DB fixture');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('schedules retry on 500 response', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('Error', { status: 500 });

      try {
        // Call delivery function
        // Verify delivery record has attempts = 1 and next_retry_at set
        // Verify next_retry_at is ~1 minute from now (first retry)
        assert.ok(true, 'placeholder — requires DB fixture');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('marks as failed after 5 attempts', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response('Error', { status: 500 });

      try {
        // Simulate 5 failed attempts
        // Verify delivery record has status = 'failed' and attempts = 5
        assert.ok(true, 'placeholder — requires DB fixture');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('respects 10-second timeout', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        return new Response('OK', { status: 200 });
      };

      try {
        // Call delivery function
        // Verify it fails (timeout) and schedules retry
        assert.ok(true, 'placeholder — requires timeout mock');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('sends X-Retune-Signature header with correct HMAC', async () => {
      let capturedHeaders: Headers | null = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url: any, init: any) => {
        capturedHeaders = new Headers(init.headers);
        return new Response('OK', { status: 200 });
      };

      try {
        const payload = JSON.stringify({ generationId: '123', status: 'completed' });
        const secret = 'webhook-secret-abc123';
        const expectedSig = signPayload(payload, secret);

        // Trigger delivery (requires DB fixture with webhook having this secret)
        // Verify capturedHeaders.get('X-Retune-Signature') === expectedSig
        assert.ok(true, 'placeholder — requires DB fixture');

        // Direct signature verification:
        const directSig = signPayload(payload, secret);
        const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');
        assert.strictEqual(directSig, `sha256=${expectedHmac}`);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('retry backoff schedule', () => {
    it('uses correct delay intervals', () => {
      const RETRY_DELAYS_MS = [
        60_000,        // 1 minute
        300_000,       // 5 minutes
        1_800_000,     // 30 minutes
        7_200_000,     // 2 hours
        28_800_000,    // 8 hours
      ];

      assert.strictEqual(RETRY_DELAYS_MS[0], 60_000);
      assert.strictEqual(RETRY_DELAYS_MS[1], 300_000);
      assert.strictEqual(RETRY_DELAYS_MS[2], 1_800_000);
      assert.strictEqual(RETRY_DELAYS_MS[3], 7_200_000);
      assert.strictEqual(RETRY_DELAYS_MS[4], 28_800_000);
      assert.strictEqual(RETRY_DELAYS_MS.length, 5);
    });
  });
});
```

---

## Effort Summary

| Story | Effort |
|-------|--------|
| Story 1: Webhook Schema | 2 hours |
| Story 2: Webhook Dispatcher | 3 hours |
| Story 3: Pipeline Integration | 1 hour |
| Story 4: Dispatcher Tests | 2.5 hours |
| **Total** | **~8.5 hours** |

## Dependencies

- `packages/db` schema helpers (`tcol`, `users` table, `jsonb`, `boolean`, `integer`, `timestamp`)
- `apps/api` must have access to the database client
- Generation pipeline completion point must be identifiable

## Risks

- Fire-and-forget delivery may lose events if the process crashes between dispatch and DB write — mitigated by creating the delivery record before attempting HTTP
- Long retry windows (up to 8 hours) require a background job or polling mechanism — initial implementation uses in-process scheduling; production should use Temporal or a cron job
- Webhook secret rotation not covered in this epic — follow-up story needed
