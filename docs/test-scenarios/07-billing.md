# TS-BILLING — Billing & Credits

---

### TS-BIL-001 · P0 · [MISSING]
**Free tier limit enforced**
- User on free plan has used 2 tunings
- Attempts a 3rd tuning
- Expected: refused with `rate_limit` or billing gate, "Tuning credits exhausted"
- CTA: "Upgrade to Pro for unlimited tunings."

### TS-BIL-002 · P1 · [MISSING]
**Credit usage shown on settings page**
- User views `/settings`
- Expected: credit bar shows `used / limit` with percentage
- Free plan: `2 / 2 credits · 100%`

### TS-BIL-003 · P1 · [MISSING]
**Upgrade button routes to billing portal**
- User on free plan clicks "Upgrade"
- Expected: POST to `/api/billing/portal`, redirected to Stripe portal URL
- If Stripe not configured: alert "Billing portal is not configured yet."

### TS-BIL-004 · P1 · [MISSING]
**Manage billing button (Pro user)**
- Pro user clicks "Manage billing"
- Expected: redirected to Stripe customer portal

### TS-BIL-005 · P2 · [MISSING]
**Webhook: subscription activated**
- Stripe sends `customer.subscription.created` webhook
- Expected: user plan updated to "pro", credits limit updated

### TS-BIL-006 · P2 · [MISSING]
**Webhook: subscription cancelled**
- Stripe sends `customer.subscription.deleted` webhook
- Expected: user plan reverted to "free", credits limit reduced

### TS-BIL-007 · P2 · [MISSING]
**Duplicate webhook event ignored**
- Same Stripe event ID sent twice
- Expected: second event ignored (idempotency), no double-credit

### TS-BIL-008 · P2 · [MISSING]
**Webhook with invalid signature rejected**
- POST to `/api/billing/webhooks/stripe` with wrong signature
- Expected: 400 response, event not processed
