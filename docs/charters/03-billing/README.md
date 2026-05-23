# Charter 03: Billing & Monetisation

**Priority:** P0 — blocks launch  
**Owner:** Backend Engineer + Product Manager  
**Source:** Audit Evidence (ENABLE_BILLING=false, no Stripe, upgrade button sends email)

---

## Problem

The billing system is a credit counter with no payment processing. `upgradeToPro()` and `upgradeToMax()` in `packages/billing/src/index.ts` directly update the `subscriptions` table without any payment verification. The upgrade button in `apps/web/src/components/layout/upgrade-button.tsx` sends users to `mailto:hello@retuned.cv` — there is no automated payment flow. `ENABLE_BILLING=false` in production.

Additionally, the billing integrity has two bugs:
1. `atomicCheckGeneration` runs `COALESCE(SUM(usageRecords.costUsd))` — a full table scan — on every generation request
2. The in-memory `_cache` Map in `packages/billing/src/index.ts` is per-process, so concurrent serverless instances can double-spend credits

---

## What "done" looks like

- Users can subscribe to Pro ($20/month) and Max ($50/month) via Stripe Checkout
- Stripe webhooks handle subscription lifecycle: creation, renewal, cancellation, payment failure
- Dunning: failed payments trigger 3 retry emails over 7 days before downgrading to free
- Billing portal: users can manage their subscription, view invoices, update payment method
- Credit balance is stored as a counter column on `subscriptions.creditsUsed` — no SUM query
- Credit deduction is atomic via a Postgres transaction with optimistic locking
- Free trial: 14-day Pro trial on signup, no credit card required
- Tax: Stripe Tax handles VAT/GST automatically

---

## Success Metrics

- Stripe Checkout conversion rate measurable (baseline established within 2 weeks of launch)
- Zero credit double-spend incidents (verified by `creditsUsed` counter audit)
- `atomicCheckGeneration` p95 latency < 5ms (down from current ~50ms with SUM query)
- Webhook handler processes events within 30 seconds of Stripe delivery
- Dunning recovery rate > 20% (industry average)

---

## Epics (architect-revised)

| # | Epic | Priority | File | Status |
|---|------|----------|------|--------|
| 1 | Billing Integrity Fixes | P0 Wk 3 | [epic-01-billing-integrity.md](./epic-01-billing-integrity.md) | Existed, reviewed |
| 2 | Stripe Integration | P0 Wk 4 | [epic-02-stripe-integration.md](./epic-02-stripe-integration.md) | Existed, reviewed |
| 3 | Subscription Lifecycle & Webhooks | P0 Wk 5 | [epic-03-subscription-lifecycle.md](./epic-03-subscription-lifecycle.md) | Created in rewrite |
| 4 | Free Trial Flow (14-day Pro) | P1 Wk 6 | [epic-04-free-trial.md](./epic-04-free-trial.md) | Created in rewrite |
| 5 | Billing Portal UI (Stripe Customer Portal) | P1 Wk 6 | [epic-05-billing-portal-ui.md](./epic-05-billing-portal-ui.md) | Created in rewrite |
| 6 | Tax Compliance (Stripe Tax + invoice retention) | P1 Wk 7 | [epic-06-tax-compliance.md](./epic-06-tax-compliance.md) | Created in rewrite |

All four follow the per-epic template used in `docs/charters/01-security/epic-01-secret-rotation.md`.

### Architect's polish on the existing epics

- **Epic 01** must reconcile the **dual budget ceilings** in the cognitive substrate: `apps/api/src/runtime/workbench-runtime.ts:498` uses `ceiling_usd: 0.2 / hard_kill_usd: 0.5`; the Temporal substrate (`packages/agent/src/temporal/activities/substrate.ts`) uses `0.05 / 0.2`. A user's billable cost depends on which runtime path the API picked — undefined behaviour today.
- **Epic 01** must add the `creditsUsed` counter migration as a single-statement Drizzle migration (`packages/db/src/pg/migrations/0012_credits_used_counter.sql`). Listed in the priority-order doc as a Quick Win.
- **Epic 02** must add a `stripe_events` table keyed by Stripe `event.id` for webhook idempotency. The intern's draft doesn't have this — every webhook integration eventually needs this table, so build it from day one.
- **Epic 02** webhook signature verification must use **separate signing secrets per environment** (staging vs production) to prevent replay across boundaries.

---

## Hard Dependencies

- Epic 1 (billing integrity) must complete before Epic 2 (Stripe) — Stripe integration must write to the correct schema
- Charter 09 (Data Integrity) `costUsd` rename must coordinate with Epic 1
- Charter 07 (CI/CD) staging environment must exist before Stripe webhooks are tested
