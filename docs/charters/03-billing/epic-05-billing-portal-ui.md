# Epic 05 — Billing Portal UI

**Charter:** 03-Billing
**Priority:** P1 — Week 5 (after subscription lifecycle is stable)
**Complexity:** M
**Owner:** Frontend Engineer + Backend Engineer
**Status:** Created in architect rewrite (2026-05-22). No billing portal or self-service subscription management exists today.

---

## Goal

Embed Stripe Customer Portal so users can manage their subscription, view invoices, update payment method, and cancel — all without contacting support. Today `apps/web/src/components/layout/upgrade-button.tsx` triggers `mailto:hello@retuned.cv` when billing is disabled. This epic replaces that with a real self-service billing surface.

## Definition of Done

- [ ] API route `apps/web/src/app/api/billing/portal/route.ts` creates a Stripe Customer Portal session and returns the redirect URL.
- [ ] New settings page at `apps/web/src/app/(auth)/settings/billing/page.tsx` shows current plan, credits used/remaining, next billing date, and a "Manage Subscription" button that opens the Stripe Portal.
- [ ] Post-portal-return handler re-syncs subscription state from Stripe API (latency mitigation — don't wait for webhook).
- [ ] Users without a Stripe customer ID see the upgrade CTA instead of the portal button.
- [ ] All UI states tested: free user, trialing user, active subscriber, past_due subscriber, cancelled-at-period-end.

---

## Code grounding (verified)

- `apps/web/src/components/layout/upgrade-button.tsx` (line 130–140) renders `<a href="mailto:hello@retuned.cv?subject=Upgrade to ${plan.name}">` — the current "upgrade" path is email-based.
- `apps/web/src/app/(auth)/settings/page.tsx` exists as the settings root. Sub-pages exist at `settings/honesty/`, `settings/voice/`, `settings/culture/`. No `settings/billing/` directory exists.
- `packages/billing/src/index.ts:getSubscription()` returns `SubscriptionInfo` with `plan`, `status`, `creditsUsed`, `creditsLimit`, `creditsRemaining` — sufficient for the billing page display.
- `packages/db/src/pg/schema.ts` (line 684) `subscriptions` table has `stripeCustomerId` — required to create a Portal session.
- `apps/web/src/lib/stripe.ts` (to be created in epic-02) exports the Stripe client — reused here.
- No file exists at `apps/web/src/app/api/billing/portal/` — must be created.

---

## Story 5.1 — Stripe Customer Portal API Route

**As a** subscribed user,
**I want** an API endpoint that creates a Stripe Customer Portal session,
**so that** I can manage my subscription without contacting support.

### Acceptance criteria

- [ ] `POST /api/billing/portal` requires authenticated session (401 if not logged in).
- [ ] Looks up `stripeCustomerId` from `subscriptions` table for the authenticated user.
- [ ] If no `stripeCustomerId` exists, returns 400 with `{ error: "no_stripe_customer" }`.
- [ ] Creates a Stripe Billing Portal session with `return_url: /settings/billing?synced=true`.
- [ ] Returns `{ url: string }` — the portal session URL.
- [ ] Unit test: mocked Stripe client, verifies correct customer ID and return URL.

### Tasks

- **5.1.1** Create `apps/web/src/app/api/billing/portal/route.ts`:
```typescript
import { withErrorHandling } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { createIdentityModule } from "@/lib/identity";
import { stripe } from "@/lib/stripe";
import { db, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const POST = withErrorHandling(async () => {
  const identity = createIdentityModule();
  const session = await identity.resolveSessionState();
  if (!session) throw new ValidationError("Unauthorized");

  const subRows = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.userId))
    .limit(1);

  const customerId = subRows[0]?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json({ error: "no_stripe_customer" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings/billing?synced=true`,
  });

  return NextResponse.json({ url: portalSession.url });
});
```
**Output:** Portal API route created
**Effort:** half day

- **5.1.2** Write unit test at `apps/web/src/app/api/billing/__tests__/portal.route.test.ts`.
**Output:** 3 passing tests (success, no customer, unauthenticated)
**Effort:** half day

---

## Story 5.2 — Billing Settings Page

**As a** user,
**I want** a billing page in my settings,
**so that** I can see my current plan, credit usage, and manage my subscription.

### Acceptance criteria

- [ ] Page at `/settings/billing` renders for all authenticated users.
- [ ] Displays: current plan name, credits used / credits total, progress bar, next billing date (if subscribed), trial days remaining (if trialing).
- [ ] For subscribed users (`stripeCustomerId` exists): shows "Manage Subscription" button that calls `POST /api/billing/portal` and redirects.
- [ ] For free/trialing users (no `stripeCustomerId`): shows "Upgrade to Pro" CTA that opens the checkout flow.
- [ ] For `past_due` users: shows warning banner "Payment failed — update your payment method" with portal link.
- [ ] For `cancelAtPeriodEnd = true`: shows "Your plan will be cancelled on {date}" notice.
- [ ] Page uses existing design system patterns from `apps/web/src/app/(auth)/settings/page.tsx`.
- [ ] Accessible: proper heading hierarchy, ARIA labels on interactive elements, keyboard navigable.

### Tasks

- **5.2.1** Create `apps/web/src/app/(auth)/settings/billing/page.tsx`:
```typescript
import { createIdentityModule } from "@/lib/identity";
import { getSubscription } from "@retune/billing";
import { redirect } from "next/navigation";

export default async function BillingPage() {
  const identity = createIdentityModule();
  const session = await identity.resolveSessionState();
  if (!session) redirect("/login");

  const sub = await getSubscription(session.userId);
  // Render billing UI based on sub state
}
```
**Output:** Billing settings page
**Effort:** full day

- **5.2.2** Create `apps/web/src/components/billing/billing-overview.tsx` client component with:
  - Plan badge (Free / Pro / Max / Trialing)
  - Credit usage bar (`creditsUsed / creditsLimit`)
  - Next billing date or trial expiry date
  - Action button (Manage / Upgrade)
**Output:** Billing overview component
**Effort:** full day

- **5.2.3** Add navigation link to billing page in the settings sidebar/nav. Check existing settings layout at `apps/web/src/app/(auth)/settings/` for the nav pattern.
**Output:** Billing link in settings nav
**Effort:** < 2 hours

---

## Story 5.3 — Post-Portal-Return Sync

**As a** user returning from the Stripe Customer Portal,
**I want** my subscription state to be immediately up-to-date,
**so that** I don't see stale plan information while waiting for the webhook.

### Acceptance criteria

- [ ] When the billing page loads with `?synced=true` query param, it calls a sync endpoint.
- [ ] Sync endpoint `POST /api/billing/sync` fetches the subscription from Stripe API using `stripeSubscriptionId` and updates the local `subscriptions` row.
- [ ] Updates: `plan`, `status`, `currentPeriodEnd`, `cancelAtPeriodEnd`.
- [ ] If the Stripe subscription is cancelled, sets `plan = "free"` locally.
- [ ] Sync is best-effort — if Stripe API fails, the page still renders with cached data (webhook will eventually catch up).
- [ ] Rate-limited: max 1 sync per user per 30 seconds (prevent abuse).

### Tasks

- **5.3.1** Create `apps/web/src/app/api/billing/sync/route.ts`:
```typescript
import { withErrorHandling } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { createIdentityModule } from "@/lib/identity";
import { stripe } from "@/lib/stripe";
import { db, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const POST = withErrorHandling(async () => {
  const identity = createIdentityModule();
  const session = await identity.resolveSessionState();
  if (!session) throw new ValidationError("Unauthorized");

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.userId))
    .limit(1);

  const sub = subRows[0];
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ synced: false, reason: "no_subscription" });
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const plan = stripeSub.metadata.plan as "pro" | "max" ?? "free";

  await db.update(subscriptions).set({
    plan: stripeSub.status === "canceled" ? "free" : plan,
    status: stripeSub.status === "active" ? "active" : stripeSub.status,
    currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    updatedAt: new Date(),
  }).where(eq(subscriptions.userId, session.userId));

  return NextResponse.json({ synced: true });
});
```
**Output:** Sync endpoint
**Effort:** half day

- **5.3.2** In the billing page client component, detect `?synced=true` and call `POST /api/billing/sync` on mount, then refresh the page data.
**Output:** Auto-sync on portal return
**Effort:** < 2 hours

- **5.3.3** Unit test: mock Stripe subscription retrieval → verify local DB updated correctly.
**Output:** Passing test
**Effort:** half day

---

## Out of scope

- Custom-built invoice list UI — Stripe Customer Portal shows invoices natively.
- Payment method collection outside Stripe Portal — Portal handles this.
- Admin-facing billing dashboard — future Charter 19 (enterprise).
- Coupon/promotion code management UI — managed in Stripe Dashboard.

---

## Hard dependencies

| Dependency | Reason |
|-----------|--------|
| 03-billing/epic-03 (subscription lifecycle) | Webhook handler must exist to keep local state in sync when Portal changes propagate |
| 03-billing/epic-02 (Stripe Checkout) | `stripeCustomerId` must be populated before Portal can be opened |
| `apps/web/src/lib/stripe.ts` | Stripe client module created in epic-02 |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Stripe Portal UI doesn't match Retune branding | Configure Portal branding in Stripe Dashboard (logo, colors, links) |
| User cancels in Portal but webhook is delayed — sees stale state | Post-portal-return sync (Story 5.3) fetches fresh state from Stripe API |
| Sync endpoint abused for rate-limiting Stripe API | Rate-limit to 1 call per user per 30 seconds; return cached data on throttle |
| Free users click "Manage Subscription" with no Stripe customer | UI conditionally shows upgrade CTA vs portal button based on `stripeCustomerId` presence |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Portal session created | Authenticated user with `stripeCustomerId` → POST returns valid Stripe URL | Unit |
| No customer guard | User without `stripeCustomerId` → 400 with `no_stripe_customer` | Unit |
| Billing page renders all states | Render with: free, trialing, active, past_due, cancel_at_period_end → correct UI for each | Component test (vitest + testing-library) |
| Post-portal sync | Return with `?synced=true` → local DB matches Stripe state | Integration |
| Rate limiting | Call sync twice within 30s → second call returns cached/throttled | Unit |
