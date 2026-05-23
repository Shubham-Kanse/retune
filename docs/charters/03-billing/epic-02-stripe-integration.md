# Epic 02: Stripe Integration

**Charter:** Billing & Monetisation  
**Priority:** P0 — Week 2  
**Complexity:** XL  
**Owner:** Backend Engineer

---

## Goal

Replace the `mailto:` upgrade link with a real Stripe Checkout flow. Users can subscribe to Pro ($20/month) or Max ($50/month). Stripe manages payment, the webhook updates the `subscriptions` table.

## Definition of Done

- [ ] Clicking "Upgrade to Pro" in `UpgradeButton` redirects to Stripe Checkout (not `mailto:`)
- [ ] Successful payment redirects back to `/dashboard?upgraded=true`
- [ ] Failed payment redirects back to `/dashboard?upgrade_failed=true`
- [ ] `subscriptions.plan` is updated to `pro` or `max` within 30 seconds of Stripe confirming payment
- [ ] `subscriptions.stripeCustomerId` and `subscriptions.stripeSubscriptionId` are stored
- [ ] Stripe webhook endpoint at `POST /api/billing/webhook` handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] Webhook signature is verified using `stripe.webhooks.constructEvent`
- [ ] All Stripe API calls use idempotency keys
- [ ] Integration tests cover the full checkout → webhook → subscription update flow using Stripe test mode

---

## Context: Current State

**File: `apps/web/src/components/layout/upgrade-button.tsx` lines 130–140**

The CTA currently sends an email:
```typescript
<a
  href={`mailto:hello@retuned.cv?subject=Upgrade to ${plan.name}`}
  className="..."
>
  {plan.cta}
</a>
```

**File: `packages/billing/src/index.ts`**

`upgradeToPro()` and `upgradeToMax()` directly update the DB without payment:
```typescript
export async function upgradeToPro(userId: string): Promise<void> {
  await db.update(subscriptions).set({ plan: "pro", status: "active", updatedAt: new Date() })
    .where(eq(subscriptions.userId, userId));
}
```

**File: `packages/db/src/pg/schema.ts` (subscriptions table)**

Missing Stripe-specific columns: `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodEnd`, `cancelAtPeriodEnd`.

---

## Story 2.1: Add Stripe Columns to subscriptions Table

**As a** backend engineer,  
**I want** the `subscriptions` table to store Stripe customer and subscription IDs,  
**so that** we can look up and manage subscriptions via the Stripe API.

**Acceptance Criteria:**
- [ ] Migration `0013_stripe_columns.sql` adds: `stripe_customer_id VARCHAR(64)`, `stripe_subscription_id VARCHAR(64)`, `current_period_end TIMESTAMPTZ`, `cancel_at_period_end BOOLEAN DEFAULT FALSE`
- [ ] Drizzle schema updated with these columns
- [ ] Unique index on `stripe_customer_id` (one customer per user)
- [ ] Unique index on `stripe_subscription_id`
- [ ] Migration is zero-downtime (all columns nullable or with defaults)

### Task 2.1.1: Write migration
**Owner:** Backend Engineer  
**Deliverable:** `packages/db/src/pg/migrations/0013_stripe_columns.sql`  
**Dependencies:** Migration 0012 (creditsUsed counter) must be applied first

##### Subtask: Create migration file
Create `packages/db/src/pg/migrations/0013_stripe_columns.sql`:
```sql
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_ux
  ON subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_ux
  ON subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
```
**Output:** Migration file created  
**Effort:** < 2 hours

##### Subtask: Update Drizzle schema
Open `packages/db/src/pg/schema.ts`. Find the `subscriptions` table. Add:
```typescript
stripeCustomerId: varchar("stripe_customer_id", { length: 64 }),
stripeSubscriptionId: varchar("stripe_subscription_id", { length: 64 }),
currentPeriodEnd: tcol_nullable("current_period_end"),
cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
trialEnd: tcol_nullable("trial_end"),
```
**Output:** Drizzle schema updated  
**Effort:** < 2 hours

---

## Story 2.2: Create Stripe Checkout Session API Route

**As a** user,  
**I want** clicking "Upgrade to Pro" to redirect me to Stripe Checkout,  
**so that** I can pay with my credit card and get immediate access to Pro features.

**Acceptance Criteria:**
- [ ] `POST /api/billing/checkout` accepts `{ plan: "pro" | "max" }` and returns `{ url: string }` — the Stripe Checkout URL
- [ ] The route requires an authenticated session (returns 401 if not logged in)
- [ ] If the user already has a `stripeCustomerId`, it is reused (not a new customer created)
- [ ] The Checkout session has `success_url: /dashboard?upgraded=true` and `cancel_url: /dashboard`
- [ ] The Checkout session has `client_reference_id: userId` so the webhook can identify the user
- [ ] The Checkout session uses `mode: "subscription"` with the correct Stripe Price ID for the plan
- [ ] Idempotency key is set on the Stripe API call: `stripe-idempotency-key: checkout-${userId}-${plan}-${Date.now()}`
- [ ] Unit test: mocked Stripe client, verifies correct Price ID is used for each plan

### Task 2.2.1: Install Stripe SDK
**Owner:** Backend Engineer  
**Deliverable:** `stripe` package installed in `apps/web`  
**Dependencies:** None

##### Subtask: Install stripe
```bash
pnpm --filter @retune/web add stripe
```
**Output:** `stripe` in `apps/web/package.json`  
**Effort:** < 2 hours

##### Subtask: Create Stripe client module
Create `apps/web/src/lib/stripe.ts`:
```typescript
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});

export const STRIPE_PRICE_IDS = {
  pro: process.env.STRIPE_PRICE_PRO ?? "",
  max: process.env.STRIPE_PRICE_MAX ?? "",
} as const;

export type BillingPlan = keyof typeof STRIPE_PRICE_IDS;
```
**Output:** `apps/web/src/lib/stripe.ts` created  
**Effort:** < 2 hours

##### Subtask: Add Stripe env vars to .env.example
```
# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_MAX=price_...
```
**Output:** `.env.example` updated  
**Effort:** < 2 hours

### Task 2.2.2: Create checkout API route
**Owner:** Backend Engineer  
**Deliverable:** `apps/web/src/app/api/billing/checkout/route.ts`  
**Dependencies:** Task 2.2.1

##### Subtask: Create the route
Create `apps/web/src/app/api/billing/checkout/route.ts`:
```typescript
import { withErrorHandling } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { createIdentityModule } from "@/lib/identity";
import { stripe, STRIPE_PRICE_IDS, type BillingPlan } from "@/lib/stripe";
import { db, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  plan: z.enum(["pro", "max"]),
});

export const POST = withErrorHandling(async (request) => {
  const identity = createIdentityModule();
  const session = await identity.resolveSessionState();
  if (!session) throw new ValidationError("Unauthorized");

  const body = await request.json().catch(() => { throw new ValidationError("Invalid JSON"); });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid plan");

  const plan = parsed.data.plan as BillingPlan;
  const priceId = STRIPE_PRICE_IDS[plan];
  if (!priceId) throw new ValidationError(`Stripe price not configured for plan: ${plan}`);

  // Get or create Stripe customer
  const subRows = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.userId))
    .limit(1);

  let customerId = subRows[0]?.stripeCustomerId ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create(
      { email: session.email, metadata: { retune_user_id: session.userId } },
      { idempotencyKey: `customer-${session.userId}` },
    );
    customerId = customer.id;
    await db
      .update(subscriptions)
      .set({ stripeCustomerId: customerId })
      .where(eq(subscriptions.userId, session.userId));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const checkoutSession = await stripe.checkout.sessions.create(
    {
      customer: customerId,
      client_reference_id: session.userId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/dashboard`,
      subscription_data: {
        trial_period_days: 14, // 14-day free trial
        metadata: { retune_user_id: session.userId, plan },
      },
      allow_promotion_codes: true,
    },
    { idempotencyKey: `checkout-${session.userId}-${plan}-${Math.floor(Date.now() / 60000)}` },
  );

  return NextResponse.json({ url: checkoutSession.url });
});
```
**Output:** `POST /api/billing/checkout` route created  
**Effort:** full day

##### Subtask: Write unit test for checkout route
Create `apps/web/src/app/api/billing/__tests__/checkout.route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCreate = vi.fn();
const mockCustomerCreate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: mockCreate } },
    customers: { create: mockCustomerCreate },
  },
  STRIPE_PRICE_IDS: { pro: "price_pro_test", max: "price_max_test" },
}));

vi.mock("@/lib/identity", () => ({
  createIdentityModule: () => ({
    resolveSessionState: vi.fn().mockResolvedValue({
      userId: "user-123",
      email: "test@example.com",
    }),
  }),
}));

vi.mock("@retune/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ stripeCustomerId: "cus_existing" }]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn() }) }),
  },
  subscriptions: {},
}));

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  });

  it("returns Stripe Checkout URL for pro plan", async () => {
    const { POST } = await import("../checkout/route");
    const req = new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe("https://checkout.stripe.com/test");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        line_items: [{ price: "price_pro_test", quantity: 1 }],
        mode: "subscription",
      }),
      expect.any(Object),
    );
  });

  it("returns 400 for invalid plan", async () => {
    const { POST } = await import("../checkout/route");
    const req = new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "enterprise" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(
      (await import("@/lib/identity")).createIdentityModule
    ).mockReturnValue({
      resolveSessionState: vi.fn().mockResolvedValue(null),
    } as ReturnType<typeof import("@/lib/identity").createIdentityModule>);

    const { POST } = await import("../checkout/route");
    const req = new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: "pro" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});
```
**Output:** 3 passing tests  
**Effort:** full day

### Task 2.2.3: Update UpgradeButton to call checkout API
**Owner:** Frontend Engineer  
**Deliverable:** Clicking "Upgrade to Pro" redirects to Stripe Checkout  
**Dependencies:** Task 2.2.2

##### Subtask: Replace mailto link with checkout API call
Open `apps/web/src/components/layout/upgrade-button.tsx`. Replace the `<a href="mailto:...">` with a button that calls the checkout API:

```typescript
// Add state for loading
const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

async function handleUpgrade(planId: "pro" | "max") {
  setCheckoutLoading(planId);
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan: planId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Failed to start checkout");
    }
    const { url } = await res.json();
    window.location.href = url; // Redirect to Stripe Checkout
  } catch (err) {
    console.error("Checkout error:", err);
    // Show error toast
  } finally {
    setCheckoutLoading(null);
  }
}

// Replace the <a> tag with:
{plan.cta ? (
  <button
    type="button"
    onClick={() => handleUpgrade(plan.id as "pro" | "max")}
    disabled={checkoutLoading === plan.id}
    className={`block w-full text-center text-xs font-medium py-2.5 rounded-lg transition-all ${
      plan.highlight
        ? "bg-[#2d8a5e] text-white hover:bg-[#236e4a] disabled:opacity-50"
        : "bg-[#f0ede8] text-[#1a1a1a] hover:bg-[#e5e2dd] disabled:opacity-50"
    }`}
  >
    {checkoutLoading === plan.id ? "Redirecting…" : plan.cta}
  </button>
) : (
  <div className="text-center text-xs text-[#9a9690] py-2.5">Current plan</div>
)}
```

Also remove the "Online payment coming soon" text at the bottom of the modal.  
**Output:** Upgrade button calls Stripe Checkout  
**Effort:** half day

---

## Story 2.3: Implement Stripe Webhook Handler

**As a** backend engineer,  
**I want** a webhook endpoint that processes Stripe events,  
**so that** subscription changes in Stripe are reflected in the database within 30 seconds.

**Acceptance Criteria:**
- [ ] `POST /api/billing/webhook` verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`
- [ ] Returns 400 if signature verification fails
- [ ] Handles `checkout.session.completed`: sets `plan`, `stripeSubscriptionId`, `currentPeriodEnd`, resets `creditsUsed` to 0 for new subscriptions
- [ ] Handles `customer.subscription.updated`: updates `plan`, `currentPeriodEnd`, `cancelAtPeriodEnd`
- [ ] Handles `customer.subscription.deleted`: downgrades to `free`, clears `stripeSubscriptionId`
- [ ] Handles `invoice.payment_failed`: sets `status = "past_due"` on the subscription
- [ ] All handlers are idempotent — processing the same event twice has no side effects
- [ ] Webhook responds with 200 within 5 seconds (Stripe times out at 30 seconds)
- [ ] Unit tests cover all 4 event types with mocked Stripe payloads

### Task 2.3.1: Create webhook route
**Owner:** Backend Engineer  
**Deliverable:** `apps/web/src/app/api/billing/webhook/route.ts`  
**Dependencies:** Task 2.2.1 (Stripe client), Task 2.1.1 (Stripe columns in DB)

##### Subtask: Create webhook handler
Create `apps/web/src/app/api/billing/webhook/route.ts`:
```typescript
import { stripe } from "@/lib/stripe";
import { db, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";

// Disable body parsing — Stripe requires the raw body for signature verification
export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error("[webhook] handler error:", err instanceof Error ? err.message : err, { eventId: event.id, type: event.type });
    // Return 500 so Stripe retries
    return NextResponse.json({ error: "handler_error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      if (!userId || session.mode !== "subscription") break;

      const subscriptionId = session.subscription as string;
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const plan = subscription.metadata.plan as "pro" | "max" | undefined ?? "pro";

      await db
        .update(subscriptions)
        .set({
          plan,
          status: "active",
          stripeSubscriptionId: subscriptionId,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          creditsUsed: 0, // Reset credits on new subscription
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, userId));
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.retune_user_id;
      if (!userId) break;

      const plan = sub.metadata.plan as "pro" | "max" | "free" ?? "free";
      await db
        .update(subscriptions)
        .set({
          plan,
          status: sub.status === "active" ? "active" : sub.status,
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(subscriptions)
        .set({
          plan: "free",
          status: "active",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          creditsUsed: 0, // Reset to free plan credits
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId) break;

      await db
        .update(subscriptions)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subscriptionId));
      break;
    }

    default:
      // Unhandled event type — log and ignore
      console.log(`[webhook] unhandled event type: ${event.type}`);
  }
}
```
**Output:** Webhook handler created  
**Effort:** full day

##### Subtask: Write webhook unit tests
Create `apps/web/src/app/api/billing/__tests__/webhook.route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockConstructEvent = vi.fn();
const mockRetrieveSubscription = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSubscription },
  },
}));

vi.mock("@retune/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mockDbUpdate })),
    })),
  },
  subscriptions: {},
}));

function makeRequest(body: string, sig = "valid-sig") {
  return new NextRequest("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": sig, "content-type": "application/json" },
    body,
  });
}

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdate.mockResolvedValue([]);
  });

  it("returns 400 when signature is missing", async () => {
    const { POST } = await import("../webhook/route");
    const req = new NextRequest("http://localhost/api/billing/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_signature");
  });

  it("returns 400 when signature verification fails", async () => {
    mockConstructEvent.mockImplementation(() => { throw new Error("Invalid signature"); });
    const { POST } = await import("../webhook/route");
    const res = await POST(makeRequest("{}", "bad-sig"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_signature");
  });

  it("handles checkout.session.completed and updates subscription", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      id: "evt_test",
      data: {
        object: {
          client_reference_id: "user-123",
          mode: "subscription",
          subscription: "sub_test",
        },
      },
    });
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_test",
      metadata: { plan: "pro", retune_user_id: "user-123" },
      current_period_end: Math.floor(Date.now() / 1000) + 2592000,
    });

    const { POST } = await import("../webhook/route");
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it("handles invoice.payment_failed and sets status to past_due", async () => {
    mockConstructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      id: "evt_test2",
      data: { object: { subscription: "sub_test" } },
    });

    const { POST } = await import("../webhook/route");
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});
```
**Output:** 4 passing webhook tests  
**Effort:** full day
