# Epic 06 — Tax Compliance (Stripe Tax + Invoice Retention)

**Charter:** 03-Billing
**Priority:** P2 — Week 6–7 (after billing portal is live)
**Complexity:** L
**Owner:** Backend Engineer + Finance/Ops
**Status:** Created in architect rewrite (2026-05-22). No tax configuration or invoice retention exists today.

---

## Goal

Enable Stripe Tax for automatic tax calculation and collection, and implement invoice retention for regulatory compliance. Retune is EU-hosted (Supabase `eu-west-1`), selling to global customers. VAT applies to EU customers, GST to UK/AU customers, and US sales tax in collecting states. All invoices must be retained for 7 years per HMRC/IRS requirements.

## Definition of Done

- [ ] Stripe Tax enabled on the production Stripe account with correct registration thresholds configured.
- [ ] All Checkout sessions (from epic-02) include `automatic_tax: { enabled: true }`.
- [ ] Stripe Customer Portal configured to show tax-inclusive pricing and collect tax IDs.
- [ ] Every Stripe invoice URL + raw event payload stored in `stripe_events` table (from epic-03) with 7-year retention.
- [ ] Tax registration runbook authored as an ops document (out-of-charter but referenced).
- [ ] Stripe Tax Dashboard shows correct tax collection for test transactions in EU, UK, AU, and US.

---

## Code grounding (verified)

- `.env.example` shows `RETUNE_DATABASE_URL=postgresql://postgres.your-project-ref:...@aws-0-region.pooler.supabase.com:6543/postgres` — Supabase hosted, EU region confirmed by project configuration.
- `packages/db/src/pg/schema.ts` (line 684) `subscriptions` table — no tax-related columns needed (Stripe handles tax externally).
- `stripe_events` table (to be created in epic-03, Story 3.1) stores `payload JSONB` — invoice events will be stored here with full payload for retention.
- `apps/web/src/lib/stripe.ts` (created in epic-02) — Checkout session creation must be extended with `automatic_tax`.
- `apps/web/src/app/api/billing/webhooks/stripe/route.ts` (created in epic-03) — already processes `invoice.paid`; extend to store invoice URL.
- `SMTP_FROM=hello@retuned.cv` in `.env.example` — business domain is `retuned.cv`, used for tax registration.

---

## Story 6.1 — Enable Stripe Tax on Production Account

**As a** finance operator,
**I want** Stripe Tax enabled and configured with our tax registrations,
**so that** the correct tax is automatically calculated and collected on every transaction.

### Acceptance criteria

- [ ] Stripe Tax enabled in Stripe Dashboard → Settings → Tax.
- [ ] Tax registrations added for: Ireland (EU VAT, company domicile), UK (VAT if threshold exceeded), Australia (GST if threshold exceeded).
- [ ] US tax collection enabled via Stripe Tax's automatic state-level calculation (no manual registration needed for remote sellers below nexus thresholds — Stripe handles this).
- [ ] Tax behavior set to `exclusive` (tax added on top of listed price) or `inclusive` (price includes tax) — decision documented.
- [ ] Test mode: create a Checkout session for an EU customer → verify tax line item appears on invoice.

### Tasks

- **6.1.1** Enable Stripe Tax in Stripe Dashboard (test mode first, then production).
**Output:** Stripe Tax active
**Effort:** < 2 hours

- **6.1.2** Add tax registrations in Stripe Dashboard:
  - Ireland: EU VAT number (if registered) or EU OSS registration
  - UK: VAT registration (if above £85k threshold)
  - Australia: GST registration (if above AUD 75k threshold)
**Output:** Registrations configured
**Effort:** half day (requires finance input)

- **6.1.3** Document tax behavior decision (`exclusive` vs `inclusive`) in `docs/decisions/tax-behavior.md`. Recommendation: `exclusive` for B2B clarity, `inclusive` for B2C simplicity. Final decision requires business input.
**Output:** Decision document
**Effort:** < 2 hours

---

## Story 6.2 — Integrate Stripe Tax into Checkout and Portal

**As a** customer,
**I want** tax to be automatically calculated at checkout based on my location,
**so that** I see the correct total before paying.

### Acceptance criteria

- [ ] Checkout session creation in `apps/web/src/app/api/billing/checkout/route.ts` (from epic-02) includes `automatic_tax: { enabled: true }`.
- [ ] Checkout session includes `customer_update: { address: "auto" }` so Stripe can determine tax jurisdiction.
- [ ] Stripe Customer Portal configured (via Stripe Dashboard → Portal settings) to:
  - Allow customers to update their billing address (for tax jurisdiction)
  - Show tax ID collection field
  - Display tax-inclusive or tax-exclusive pricing per Story 6.1 decision
- [ ] Test: EU customer sees VAT line item; US customer sees sales tax; AU customer sees GST.

### Tasks

- **6.2.1** Update Checkout session creation in `apps/web/src/app/api/billing/checkout/route.ts`. Add to the `stripe.checkout.sessions.create()` call:
```typescript
automatic_tax: { enabled: true },
customer_update: { address: "auto" },
tax_id_collection: { enabled: true },
```
**Output:** Tax-enabled Checkout
**Effort:** < 2 hours

- **6.2.2** Configure Stripe Customer Portal settings in Stripe Dashboard:
  - Enable "Customer can update billing address"
  - Enable "Tax ID collection"
  - Set pricing display to match tax behavior decision
**Output:** Portal configured for tax
**Effort:** < 2 hours

- **6.2.3** Manual test in Stripe test mode:
  - Create Checkout with `customer[address][country] = IE` → verify VAT appears
  - Create Checkout with `customer[address][country] = US, state = CA` → verify CA sales tax
  - Create Checkout with `customer[address][country] = GB` → verify UK VAT
  - Create Checkout with `customer[address][country] = AU` → verify GST
**Output:** Test results documented
**Effort:** half day

---

## Story 6.3 — Invoice Retention (7-Year Compliance)

**As a** finance operator,
**I want** every Stripe invoice stored for 7 years,
**so that** we comply with HMRC (6 years + current) and IRS (7 years) retention requirements.

### Acceptance criteria

- [ ] `invoice.paid` and `invoice.payment_failed` webhook handlers (from epic-03) store the full invoice object in `stripe_events.payload`.
- [ ] Additionally store `invoice.hosted_invoice_url` and `invoice.invoice_pdf` URLs in a dedicated `invoice_url` and `invoice_pdf_url` field (or within the JSONB payload — accessible via query).
- [ ] `stripe_events` table has NO automatic deletion/TTL — retention is indefinite until explicit purge.
- [ ] A database-level comment or migration note documents the 7-year retention requirement.
- [ ] Query helper in `packages/billing/src/index.ts`: `getInvoiceHistory(userId)` returns invoice URLs for the billing page.
- [ ] Stripe's own invoice retention (available in Dashboard) is also enabled as a secondary backup.

### Tasks

- **6.3.1** Verify `stripe_events` table (from epic-03) stores full `event.data.object` as JSONB — this includes `hosted_invoice_url` and `invoice_pdf` for invoice events. No schema change needed if epic-03 stores the full object.
**Output:** Verified: invoice data captured in existing flow
**Effort:** < 2 hours

- **6.3.2** Add migration comment to `0014_stripe_events.sql` (or a new migration `0016_retention_policy.sql`):
```sql
COMMENT ON TABLE stripe_events IS 'Retained for minimum 7 years per HMRC/IRS requirements. Do not add TTL or auto-delete.';
```
**Output:** Retention policy documented at DB level
**Effort:** < 1 hour

- **6.3.3** Add `getInvoiceHistory()` to `packages/billing/src/index.ts`:
```typescript
export async function getInvoiceHistory(userId: string): Promise<Array<{
  stripeEventId: string;
  invoiceUrl: string | null;
  pdfUrl: string | null;
  amount: number;
  currency: string;
  createdAt: Date;
}>> {
  const rows = await db
    .select()
    .from(stripeEvents)
    .where(
      and(
        eq(stripeEvents.eventType, "invoice.paid"),
        sql`${stripeEvents.payload}->>'customer' IN (
          SELECT stripe_customer_id FROM billing_subscriptions WHERE user_id = ${userId}
        )`,
      )
    )
    .orderBy(desc(stripeEvents.createdAt));

  return rows.map(r => ({
    stripeEventId: r.stripeEventId,
    invoiceUrl: (r.payload as any)?.hosted_invoice_url ?? null,
    pdfUrl: (r.payload as any)?.invoice_pdf ?? null,
    amount: (r.payload as any)?.amount_paid ?? 0,
    currency: (r.payload as any)?.currency ?? "usd",
    createdAt: r.createdAt,
  }));
}
```
**Output:** Invoice history query helper
**Effort:** half day

- **6.3.4** Unit test: insert mock `invoice.paid` events into `stripe_events` → call `getInvoiceHistory(userId)` → verify correct URLs returned.
**Output:** Passing test
**Effort:** half day

---

## Story 6.4 — Tax Registration Runbook (Ops Document)

**As a** finance operator,
**I want** a runbook documenting when and how to register for tax in new jurisdictions,
**so that** we stay compliant as revenue grows.

### Acceptance criteria

- [ ] Document created at `docs/runbooks/tax-registration.md`.
- [ ] Covers: EU VAT OSS thresholds, UK VAT threshold (£85k), AU GST threshold (AUD 75k), US nexus rules.
- [ ] Includes step-by-step for adding a new tax registration in Stripe Dashboard.
- [ ] Includes monitoring: how to check Stripe Tax Dashboard for approaching thresholds.
- [ ] Reviewed by finance stakeholder before merge.

### Tasks

- **6.4.1** Author `docs/runbooks/tax-registration.md` covering:
  - Current registrations and their thresholds
  - How to add a new jurisdiction in Stripe
  - Quarterly review cadence for threshold monitoring
  - Escalation path when a threshold is approaching
**Output:** Runbook document
**Effort:** half day

- **6.4.2** Add a quarterly calendar reminder (documented in runbook) to review Stripe Tax Dashboard → Registrations → "Monitoring" tab.
**Output:** Process documented
**Effort:** < 1 hour

---

## Out of scope

- Custom tax calculation engine — Stripe Tax handles all calculation.
- Tax-exempt customer flows (B2B reverse charge) — handled natively by Stripe Tax when customer provides a valid tax ID.
- Multi-entity tax structure — single entity for now.
- Invoice PDF generation outside Stripe — Stripe generates compliant invoices.
- Data residency requirements beyond EU hosting — current Supabase EU region satisfies GDPR.

---

## Hard dependencies

| Dependency | Reason |
|-----------|--------|
| 03-billing/epic-03 (subscription lifecycle) | `stripe_events` table and webhook handler must exist for invoice retention |
| 03-billing/epic-02 (Stripe Checkout) | Checkout session creation is where `automatic_tax` is enabled |
| 03-billing/epic-05 (billing portal) | Portal must be configured to show tax IDs and billing address |
| Finance/legal stakeholder | Tax registration decisions require business input (thresholds, entity structure) |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Tax miscalculation leads to under-collection | Stripe Tax is the calculation engine; liability is shared per Stripe Tax terms. Regular reconciliation against Stripe Tax reports. |
| Approaching threshold in a jurisdiction without registration | Quarterly review cadence (Story 6.4); Stripe Dashboard alerts when approaching thresholds |
| Invoice URLs expire (Stripe hosted URLs have long but not infinite TTL) | Store full JSONB payload including line items; can reconstruct invoice data even if URL expires |
| 7-year retention grows DB significantly | Invoice events are small (~2KB each); at 1000 invoices/year = ~14MB over 7 years. Negligible. Archive to cold storage if needed in year 5+. |
| GDPR right-to-erasure conflicts with tax retention | Tax retention is a legal obligation that overrides GDPR erasure for financial records. Document this in privacy policy. |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Stripe Tax enabled | Create test Checkout → invoice shows tax line item | Manual (Stripe test mode) |
| EU VAT calculated | Checkout with `country=IE` → 23% VAT on invoice | Manual |
| US sales tax calculated | Checkout with `country=US, state=CA` → CA tax on invoice | Manual |
| Invoice stored in stripe_events | Process `invoice.paid` webhook → query `stripe_events` → payload contains `hosted_invoice_url` | Integration |
| 7-year retention | No TTL/auto-delete on `stripe_events` table; DB comment documents policy | Schema inspection |
| getInvoiceHistory returns data | Insert test invoice events → call helper → correct URLs and amounts returned | Unit |
| Tax ID collection | Checkout shows tax ID field; Portal allows tax ID update | Manual |
