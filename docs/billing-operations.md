# Billing operations

This doc captures Charter 03 Epics 3–6 (subscription lifecycle / free trial / portal UI / tax compliance) — what has landed in code and what's left to ship in product/ops.

## Subscription lifecycle (Charter 03 Epic 3)

State machine, owned by `processStripeEvent` in `packages/billing/src/stripe.ts`:

| Stripe event | Action | Resulting `subscriptions.status` |
|---|---|---|
| `checkout.session.completed` | Upsert `subscriptions` row with `stripeCustomerId`, `stripeSubscriptionId`, `plan` from price id | `active` |
| `customer.subscription.created` | Update plan + status + period dates | `active` (or whatever Stripe sends) |
| `customer.subscription.updated` | Update plan + status + period dates + `cancelAtPeriodEnd` | mirrors Stripe |
| `customer.subscription.deleted` | Plan → `free`, status → `canceled` | `canceled` |
| `invoice.payment_failed` | Status → `past_due` (dunning) | `past_due` |
| `invoice.payment_action_required` | Status → `past_due` (3DS challenge) | `past_due` |
| `invoice.paid` | Observational only — alert on out-of-band recovery | unchanged |
| `customer.subscription.trial_will_end` | Observational — wire email worker to send 3-day notice (TODO) | unchanged |

The Stripe webhook is signature-verified + idempotent at the storage
layer (`stripe_events` PRIMARY KEY ON CONFLICT DO NOTHING). Replays are
silent no-ops; first-time deliveries dispatch through `processStripeEvent`.

### Dunning policy

- **Day 0 (payment fails)**: Stripe automatically retries 3 times over
  4 days with smart-retries enabled. Our webhook updates `status='past_due'`
  on the first failure.
- **Day 4-14**: User retains access while Stripe retries. UI shows a
  warning banner (TODO — wire `subscription.status === 'past_due'`
  into `<DangerBanner>`).
- **Day 14**: If still failing, the subscription enters Stripe's
  `unpaid` state. We map this to `status='canceled'` via
  `subscription.deleted` webhook; user reverts to `free` plan.
- **Recovery**: any `invoice.paid` after `past_due` flips status back
  to `active` automatically (Stripe sends `subscription.updated`).

Email notification handlers for dunning are deferred to a follow-up.
The webhook records the state transitions; the email worker subscribes
to `stripe_events` table changes.

## Free trial logic (Charter 03 Epic 4)

The Stripe-side mechanism is supported via `subscription_data.trial_period_days`
on Checkout session creation. To enable:

1. Pass `trial_period_days: 14` in `createCheckoutSession`.
2. Honor the `trial_will_end` webhook to send 3-day-out reminder.
3. On `subscription.updated` with `status='active'` (after trial), no
   change needed — Stripe transitions automatically.

Code path is wired (`processStripeEvent` already handles
`customer.subscription.trial_will_end` as observational); enabling is
gated behind the `free-trial` feature flag (`apps/web/src/lib/feature-flags.ts`).

To enable in production:

```bash
# 1. Set the env var in the deploy environment
ENABLE_FREE_TRIAL=1

# 2. Add `trial_period_days` to subscription_data in
#    packages/billing/src/stripe.ts createCheckoutSession.
# 3. Wire the email worker to subscribe to trial_will_end events.
```

## Billing portal UI (Charter 03 Epic 5)

User-facing entry point: `apps/web/src/components/settings/settings-client.tsx`
"Manage billing" button. Visible only when `subscription.plan !== 'free'`.
Calls `POST /api/billing/portal` which creates a Stripe Customer Portal
session and returns the redirect URL.

The portal handles:
- Plan changes (upgrade / downgrade)
- Payment method updates
- Cancellation (sets `cancelAtPeriodEnd=true`)
- Invoice history download

Failures:
- 503 `stripe_not_configured`: surfaces "Contact support" message.
- 404 `no_subscription`: button is hidden when `plan === 'free'`.

## Tax compliance scaffolding (Charter 03 Epic 6)

Stripe handles the heavy lifting via `automatic_tax` + `tax_id_collection`,
both enabled in `createCheckoutSession`. Tax retention is satisfied by:

- **`stripe_events` table** keeps every billing event with the full payload
  for 7 years (deletion deferred per GDPR Article 17 exception for
  legal/tax obligations — Charter 08).
- **Stripe's own dashboard** retains invoices indefinitely.
- **Country/region detection** is automatic from the Checkout customer
  address; Stripe Tax determines the rate and collects.

For Retune's books:
- VAT IDs are collected at checkout and stored in Stripe (not our DB).
- Tax-exempt customers (e.g. UK reverse-charge B2B) are handled by Stripe
  via the customer's `tax_exempt` field.
- Quarterly tax filings export from Stripe Sigma; no Retune-side code
  needed.

If Retune needs to file tax in jurisdictions Stripe doesn't auto-collect,
extend `processStripeEvent` to write a `tax_obligations` row at
`invoice.paid` time.

## What's still open

| Item | Owner | Trigger |
|---|---|---|
| Email worker for `trial_will_end` 3-day reminder | Email + product | When `ENABLE_FREE_TRIAL=1` ships |
| Dunning UI banner (`<DangerBanner>` on past_due) | Frontend | Same |
| Cancellation flow UI inside the portal | None — Stripe handles | n/a |
| VAT/sales-tax filings beyond Stripe's coverage | Finance | When non-Stripe-supported jurisdiction is in scope |

## References

- `packages/billing/src/stripe.ts`
- `apps/web/src/app/api/billing/{checkout,portal,webhooks/stripe}/route.ts`
- `apps/web/src/components/settings/settings-client.tsx`
- `packages/db/src/pg/schema.ts` (`stripe_events`, `subscriptions`)
- `packages/db/src/pg/migrations/0014_stripe_events.sql`
- `apps/web/src/lib/feature-flags.ts` (`free-trial` flag)
