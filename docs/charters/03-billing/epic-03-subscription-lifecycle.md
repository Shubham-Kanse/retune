# Epic 03 — Subscription Lifecycle Management

**Charter:** 03-Billing
**Priority:** P0 — Week 3 (after Stripe Checkout lands)
**Complexity:** XL
**Owner:** Backend Engineer + DevOps Engineer
**Status:** Created in architect rewrite (2026-05-22). No webhook handler or idempotency layer exists today.

---

## Goal

Implement the complete Stripe subscription lifecycle — webhook idempotency, dunning (failed-payment recovery), and plan-change proration. Today `packages/billing/src/index.ts` exposes `upgradeToPro()` and `upgradeToMax()` as raw DB writes with no Stripe verification, no idempotency guarantees, and no dunning flow. This epic makes subscription state changes durable, auditable, and resilient to duplicate delivery.

## Definition of Done

- [ ] A `stripe_events` table exists in `packages/db/src/pg/schema.ts` keyed by Stripe `event.id`, preventing duplicate processing.
- [ ] Webhook handler at `apps/web/src/app/api/billing/webhooks/stripe/route.ts` processes: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.trial_will_end`.
- [ ] Webhook verifies signature using environment-specific `STRIPE_WEBHOOK_SECRET` via `stripe.webhooks.constructEvent`.
- [ ] Every event is persisted to `stripe_events` before dispatch — if the row already exists, handler returns 200 immediately (idempotent).
- [ ] Dunning flow sends 3 retry emails (T+0, T+3d, T+7d) before downgrading to free plan.
- [ ] Plan-change proration uses Stripe's `proration_behavior: "create_prorations"` — no custom proration math.
- [ ] All Stripe API calls wrapped with circuit breaker (Charter 04 Epic 03).
- [ ] Integration tests cover idempotent replay, dunning sequence, and proration scenarios.

---

## Code grounding (verified)

- `packages/billing/src/index.ts:upgradeToPro()` (line ~218) and `upgradeToMax()` (line ~224) perform raw `db.update(subscriptions).set({ plan: "pro" | "max" })` — no Stripe verification, no webhook correlation.
- `packages/db/src/pg/schema.ts` (line 684) defines `subscriptions = pgTable("billing_subscriptions", {...})` with `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodEnd`, `cancelAtPeriodEnd` columns. No `stripe_events` table exists.
- `apps/web/src/lib/email.ts` provides `sendEmail({ to, subject, html })` via nodemailer/SMTP — available for dunning emails.
- `apps/web/src/lib/email-templates.ts` contains HTML template helpers — extend for dunning templates.
- No file exists at `apps/web/src/app/api/billing/webhooks/` — the directory must be created.
- `apps/worker/src/main.ts` boots a Temporal worker with `build_worker()` from `@retune/agent` — scheduled workflows can be registered here for dunning timers.

---

## Story 3.1 — Stripe Events Idempotency Table

**As a** backend engineer,
**I want** a `stripe_events` table that records every processed Stripe event by its `event.id`,
**so that** duplicate webhook deliveries are safely ignored.

### Acceptance criteria

- [ ] Migration `0014_stripe_events.sql` creates `stripe_events` with columns: `id UUID PK`, `stripe_event_id VARCHAR(64) UNIQUE NOT NULL`, `event_type VARCHAR(128) NOT NULL`, `payload JSONB NOT NULL`, `processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- [ ] Drizzle schema in `packages/db/src/pg/schema.ts` exports `stripeEvents` table.
- [ ] Unique constraint on `stripe_event_id` ensures INSERT fails on duplicate.
- [ ] Migration is zero-downtime (new table, no ALTER on existing tables).

### Tasks

- **3.1.1** Create `packages/db/src/pg/migrations/0014_stripe_events.sql`:
```sql
CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(64) UNIQUE NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX idx_stripe_events_created ON stripe_events(created_at);
```
**Output:** Migration file created
**Effort:** < 2 hours

- **3.1.2** Add Drizzle schema definition to `packages/db/src/pg/schema.ts`:
```typescript
export const stripeEvents = pgTable("stripe_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  stripeEventId: varchar("stripe_event_id", { length: 64 }).notNull().unique(),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: tcol("created_at"),
});
```
**Output:** Schema exported from `packages/db`
**Effort:** < 2 hours

- **3.1.3** Export from `packages/db/src/index.ts` barrel.
**Output:** `stripeEvents` importable as `import { stripeEvents } from "@retune/db"`
**Effort:** < 1 hour

---

## Story 3.2 — Idempotent Webhook Handler

**As a** backend engineer,
**I want** a webhook endpoint that persists the event to `stripe_events` before dispatching,
**so that** retried deliveries from Stripe are safely deduplicated.

### Acceptance criteria

- [ ] `POST /api/billing/webhooks/stripe` verifies signature with `STRIPE_WEBHOOK_SECRET`.
- [ ] Returns 400 if signature verification fails.
- [ ] On valid signature: attempts INSERT into `stripe_events`. If unique constraint violation → return 200 immediately (already processed).
- [ ] On successful INSERT: dispatches to event-specific handler.
- [ ] Handles `customer.subscription.created`: sets `plan`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd`, resets `creditsUsed`.
- [ ] Handles `customer.subscription.updated`: updates `plan`, `currentPeriodEnd`, `cancelAtPeriodEnd`. Detects plan-change (metadata diff) and logs proration event.
- [ ] Handles `customer.subscription.deleted`: downgrades to `free`, clears Stripe fields.
- [ ] Handles `invoice.paid`: sets `status = "active"`, updates `currentPeriodEnd` from invoice period.
- [ ] Handles `invoice.payment_failed`: sets `status = "past_due"`, triggers dunning (Story 3.3).
- [ ] Handles `customer.subscription.trial_will_end`: sends trial-ending reminder email.
- [ ] Responds with 200 within 5 seconds.
- [ ] Unit tests cover all 6 event types + idempotent replay.

### Tasks

- **3.2.1** Create `apps/web/src/app/api/billing/webhooks/stripe/route.ts`:
```typescript
import { stripe } from "@/lib/stripe";
import { db, stripeEvents, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Idempotency: attempt insert, skip if already processed
  try {
    await db.insert(stripeEvents).values({
      stripeEventId: event.id,
      eventType: event.type,
      payload: event.data.object,
    });
  } catch (err: any) {
    if (err?.code === "23505") return NextResponse.json({ received: true, deduplicated: true });
    throw err;
  }

  await dispatchEvent(event);
  return NextResponse.json({ received: true });
}
```
**Output:** Webhook route with idempotency gate
**Effort:** full day

- **3.2.2** Implement `dispatchEvent()` switch for all 6 event types in the same file.
**Output:** Complete event dispatch logic
**Effort:** full day

- **3.2.3** Write unit tests at `apps/web/src/app/api/billing/webhooks/stripe/__tests__/route.test.ts` covering: signature failure, idempotent replay (duplicate event.id), each event type handler.
**Output:** 8+ passing tests
**Effort:** full day

---

## Story 3.3 — Dunning Flow (Failed Payment Recovery)

**As a** user with a failed payment,
**I want** to receive reminder emails before my account is downgraded,
**so that** I have time to update my payment method.

### Acceptance criteria

- [ ] On `invoice.payment_failed`: immediately send "Payment failed — update your card" email (T+0).
- [ ] At T+3 days: send second reminder "Your Pro access will be removed in 4 days".
- [ ] At T+7 days: send final warning "Last chance — downgrading to Free tomorrow".
- [ ] At T+8 days: if still `past_due`, downgrade to `free` plan, clear `stripeSubscriptionId`, send "Account downgraded" email.
- [ ] Email templates created in `apps/web/src/lib/email-templates/` directory (4 new templates).
- [ ] Dunning state tracked via `subscriptions.status` transitions: `active` → `past_due` → `free`.
- [ ] If payment succeeds during dunning window (`invoice.paid` event), cancel remaining dunning steps.

### Tasks

- **3.3.1** Create 4 email templates in `apps/web/src/lib/email-templates/`:
  - `dunning-immediate.html` (T+0)
  - `dunning-reminder.html` (T+3d)
  - `dunning-final-warning.html` (T+7d)
  - `dunning-downgraded.html` (T+8d)
**Output:** 4 HTML email templates
**Effort:** half day

- **3.3.2** Create dunning scheduler. Two options depending on runtime:
  - **Temporal path** (preferred): Scheduled workflow in `apps/worker/` that sleeps between steps and checks `subscriptions.status` before each email. Cancellable via workflow signal on `invoice.paid`.
  - **Fallback path**: Cron-based check in `apps/web/src/app/api/cron/dunning/route.ts` (Vercel Cron) that queries `subscriptions WHERE status = 'past_due'` and sends appropriate email based on `updatedAt` age.
**Output:** Dunning orchestration logic
**Effort:** 2 days

- **3.3.3** Wire `invoice.payment_failed` handler (Story 3.2) to trigger dunning workflow start.
**Output:** Webhook → dunning integration
**Effort:** half day

- **3.3.4** Wire `invoice.paid` handler to cancel active dunning workflow (Temporal signal or status flag).
**Output:** Payment recovery cancels dunning
**Effort:** half day

- **3.3.5** Integration test: simulate payment failure → verify 3 emails sent at correct intervals → verify downgrade at T+8d. Simulate mid-dunning recovery → verify no further emails.
**Output:** Dunning integration test passing
**Effort:** full day

---

## Out of scope

- Custom proration math — Stripe handles proration natively via `proration_behavior`.
- Refund automation — manual via Stripe Dashboard for now.
- Multi-currency support — single currency (USD) for launch.
- Webhook event replay UI — use Stripe Dashboard's "Resend" button.

---

## Hard dependencies

| Dependency | Reason |
|-----------|--------|
| 03-billing/epic-02 (Stripe Checkout) | Checkout creates the subscription that this epic manages lifecycle for |
| 06-cicd/epic-01 (staging environment) | Webhook testing requires a publicly-routable staging URL for Stripe to POST to |
| 04-resilience/epic-03 (circuit breakers) | All Stripe API calls (`subscriptions.retrieve`, `subscriptions.update`) must be wrapped in circuit breaker |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Stripe delivers events out of order (e.g., `updated` before `created`) | Idempotency table + handler checks `stripeSubscriptionId` existence before update; re-queues if missing |
| Dunning emails marked as spam | Use verified domain (`retuned.cv`), SPF/DKIM configured in Namecheap Private Email; monitor deliverability |
| Webhook endpoint goes down during Stripe retry window (72h) | Stripe retries with exponential backoff for 72h; idempotency table ensures safe replay on recovery |
| Duplicate charges on plan change | Stripe's native proration handles this; no custom billing math |
| Temporal worker down during dunning window | Temporal durably persists workflow state; resumes on worker restart |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Idempotent event processing | Send same `event.id` twice → second returns 200 with `deduplicated: true`, no DB side effects | Unit + integration |
| Signature verification | Invalid signature → 400, valid → 200 | Unit |
| Dunning email sequence | Mock clock: T+0, T+3d, T+7d emails sent; T+8d downgrade executes | Integration |
| Dunning cancellation | `invoice.paid` during dunning → no further emails, status back to `active` | Integration |
| Plan-change proration | Upgrade mid-cycle → Stripe invoice shows prorated amount (Stripe test mode) | Manual + Stripe Dashboard |
| Circuit breaker wraps Stripe calls | Simulate Stripe 500 → circuit opens after threshold → fallback returns cached state | Unit |
