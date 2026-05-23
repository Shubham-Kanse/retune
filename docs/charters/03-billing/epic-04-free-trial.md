# Epic 04 — Free Trial (14-Day Pro)

**Charter:** 03-Billing
**Priority:** P1 — Week 4 (after subscription lifecycle is stable)
**Complexity:** L
**Owner:** Backend Engineer + Frontend Engineer
**Status:** Created in architect rewrite (2026-05-22). No trial infrastructure exists today.

---

## Goal

Offer every new user a 14-day Pro trial with no credit card required. Users get the full Pro credit allocation (500 credits) during the trial. At expiry, unconverted users are downgraded to the free plan (30 credits). This reduces friction to first value and increases conversion to paid.

## Definition of Done

- [ ] `subscriptions` table extended with `trial_started_at`, `trial_ends_at`, `trial_converted_at` columns in `packages/db/src/pg/schema.ts`.
- [ ] Signup flow auto-enrolls new users into a 14-day Pro trial with 500 credits.
- [ ] Trial expiry handled by a Temporal scheduled workflow in `apps/worker/` that downgrades to free at `trial_ends_at`.
- [ ] Email reminders sent at T-3d and T-1d before trial expiry.
- [ ] Users who convert (subscribe via Stripe Checkout) have `trial_converted_at` set; no downgrade fires.
- [ ] Dashboard UI shows trial status and days remaining.
- [ ] Integration tests cover: auto-enrollment, expiry downgrade, mid-trial conversion, email timing.

---

## Code grounding (verified)

- `packages/billing/src/index.ts` (line 10–14) defines `PLAN_CREDITS: { free: 30, pro: 500, max: 1500 }` — trial users get the `pro` allocation.
- `packages/db/src/pg/schema.ts` (line 684) defines `subscriptions = pgTable("billing_subscriptions", {...})` — no trial columns exist today. Columns present: `id`, `userId`, `plan`, `status`, `creditsUsed`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `createdAt`, `updatedAt`.
- `apps/worker/src/main.ts` boots a Temporal worker via `build_worker()` from `@retune/agent` — scheduled workflows can be registered here.
- `apps/web/src/lib/email.ts` provides `sendEmail({ to, subject, html })` for transactional emails.
- `apps/web/src/lib/email-templates/` contains existing HTML templates (confirm-signup, reset-password, etc.) — extend with trial templates.
- `packages/billing/src/index.ts:getSubscription()` (line ~80) reads `sub?.plan ?? "free"` — must account for trial state.

---

## Story 4.1 — Trial Columns Migration

**As a** backend engineer,
**I want** the `subscriptions` table to track trial start, end, and conversion timestamps,
**so that** the system can distinguish trial users from free users and schedule expiry.

### Acceptance criteria

- [ ] Migration `0015_trial_columns.sql` adds: `trial_started_at TIMESTAMPTZ`, `trial_ends_at TIMESTAMPTZ`, `trial_converted_at TIMESTAMPTZ`.
- [ ] Drizzle schema updated with these three columns (all nullable).
- [ ] Index on `trial_ends_at WHERE trial_ends_at IS NOT NULL AND trial_converted_at IS NULL` for efficient expiry queries.
- [ ] Migration is zero-downtime (all columns nullable, no NOT NULL constraints).

### Tasks

- **4.1.1** Create `packages/db/src/pg/migrations/0015_trial_columns.sql`:
```sql
ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_expiry
  ON billing_subscriptions(trial_ends_at)
  WHERE trial_ends_at IS NOT NULL AND trial_converted_at IS NULL;
```
**Output:** Migration file created
**Effort:** < 2 hours

- **4.1.2** Update `packages/db/src/pg/schema.ts` subscriptions table:
```typescript
trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
trialConvertedAt: timestamp("trial_converted_at", { withTimezone: true }),
```
**Output:** Drizzle schema updated
**Effort:** < 2 hours

---

## Story 4.2 — Auto-Enroll on Signup

**As a** new user,
**I want** to automatically receive a 14-day Pro trial when I sign up,
**so that** I can experience the full product without entering payment details.

### Acceptance criteria

- [ ] When a new `subscriptions` row is created (signup flow), `plan` is set to `"pro"`, `trial_started_at` to `NOW()`, `trial_ends_at` to `NOW() + 14 days`.
- [ ] `creditsUsed` starts at 0, giving the user the full 500-credit Pro allocation.
- [ ] `status` is set to `"trialing"` (distinct from `"active"` for analytics).
- [ ] `getSubscription()` in `packages/billing/src/index.ts` returns `plan: "pro"` and a new `isTrial: true` field when `trial_ends_at` is in the future and `trial_converted_at` is null.
- [ ] Existing free users are NOT retroactively enrolled (only new signups after feature flag is enabled).

### Tasks

- **4.2.1** Update subscription creation logic. Locate the INSERT into `subscriptions` during signup (triggered from `apps/web/src/app/api/auth/` routes or Supabase auth hook). Modify to set trial fields.
**Output:** New users get trial state on signup
**Effort:** half day

- **4.2.2** Update `packages/billing/src/index.ts:getSubscription()` to return `isTrial` boolean:
```typescript
const isTrial = !!(sub?.trialEndsAt && sub.trialEndsAt > new Date() && !sub.trialConvertedAt);
```
**Output:** `SubscriptionInfo` type extended with `isTrial`, `trialEndsAt`
**Effort:** half day

- **4.2.3** Update `packages/billing/src/index.ts:canGenerate()` and `canRefine()` — no changes needed if `plan` is already `"pro"` during trial (credits math works as-is). Verify with unit test.
**Output:** Verified: trial users have Pro limits
**Effort:** < 2 hours

---

## Story 4.3 — Trial Expiry Workflow

**As a** platform engineer,
**I want** a scheduled workflow that downgrades expired trials to the free plan,
**so that** users who don't convert lose Pro access automatically.

### Acceptance criteria

- [ ] Temporal scheduled workflow `trialExpiryWorkflow` runs every hour in `apps/worker/`.
- [ ] Queries `subscriptions WHERE trial_ends_at <= NOW() AND trial_converted_at IS NULL AND status = 'trialing'`.
- [ ] For each expired trial: sets `plan = "free"`, `status = "active"`, `creditsUsed = 0` (reset to free allocation).
- [ ] Sends "Your trial has ended" email to the user.
- [ ] Workflow is idempotent — running twice on the same user has no additional effect (checks `status !== 'trialing'`).
- [ ] If user converted mid-trial (`trial_converted_at IS NOT NULL`), skip entirely.

### Tasks

- **4.3.1** Create workflow file `packages/agent/src/workflows/trial-expiry.ts`:
```typescript
import { db, subscriptions, users } from "@retune/db";
import { and, eq, lte, isNull } from "drizzle-orm";

export async function trialExpiryActivity(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(
      and(
        lte(subscriptions.trialEndsAt, now),
        isNull(subscriptions.trialConvertedAt),
        eq(subscriptions.status, "trialing"),
      )
    );

  for (const { userId } of expired) {
    await db.update(subscriptions).set({
      plan: "free", status: "active", creditsUsed: 0, updatedAt: now,
    }).where(eq(subscriptions.userId, userId));
    // Send email (via activity)
  }
  return expired.length;
}
```
**Output:** Trial expiry activity
**Effort:** full day

- **4.3.2** Register the scheduled workflow in `apps/worker/src/main.ts` with a 1-hour interval.
**Output:** Worker runs trial expiry hourly
**Effort:** half day

- **4.3.3** Integration test: create a user with `trial_ends_at` in the past → run activity → verify plan is `"free"` and email sent.
**Output:** Passing test
**Effort:** half day

---

## Story 4.4 — Trial Reminder Emails

**As a** trial user,
**I want** to receive reminders before my trial expires,
**so that** I can decide whether to subscribe before losing Pro access.

### Acceptance criteria

- [ ] At T-3d (11 days into trial): send "3 days left on your Pro trial" email.
- [ ] At T-1d (13 days into trial): send "Last day of your Pro trial — upgrade now" email.
- [ ] Emails include a direct link to the upgrade/checkout flow (`/dashboard?upgrade=true`).
- [ ] Emails are NOT sent if user has already converted (`trial_converted_at IS NOT NULL`).
- [ ] Email templates created in `apps/web/src/lib/email-templates/`.

### Tasks

- **4.4.1** Create email templates:
  - `apps/web/src/lib/email-templates/trial-reminder-3d.html`
  - `apps/web/src/lib/email-templates/trial-reminder-1d.html`
  - `apps/web/src/lib/email-templates/trial-ended.html`
**Output:** 3 HTML email templates
**Effort:** half day

- **4.4.2** Extend the trial expiry workflow (or create a separate `trialReminderActivity`) to query users where `trial_ends_at - NOW()` is within the 3d or 1d window and no reminder has been sent. Track sent reminders via a `trial_reminders_sent` JSONB column or a separate `email_log` table.
**Output:** Reminder logic integrated
**Effort:** full day

- **4.4.3** Unit test: mock clock at T-3d → verify reminder sent; mock at T-1d → verify second reminder; mock at T-3d with `trial_converted_at` set → verify no email.
**Output:** 3 passing tests
**Effort:** half day

---

## Out of scope

- Credit card trial (Stripe `trial_period_days` on subscription) — that's for users who enter payment upfront; this epic is no-card-required.
- Trial extension for support cases — manual DB update for now.
- A/B testing trial duration (7d vs 14d vs 21d) — future growth experiment.
- Grandfathering existing free users into a trial — only new signups.

---

## Hard dependencies

| Dependency | Reason |
|-----------|--------|
| 03-billing/epic-03 (subscription lifecycle) | Downgrade workflow infrastructure and `stripe_events` idempotency used by conversion detection |
| 03-billing/epic-02 (Stripe Checkout) | Conversion path — user subscribes via Checkout, which sets `trial_converted_at` |
| `apps/worker/` Temporal runtime | Trial expiry and reminder workflows require a running Temporal worker |

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Trial expiry workflow misses a run (worker down) | Temporal guarantees at-least-once execution; workflow resumes on worker restart. Query is idempotent. |
| Users game the system by creating multiple accounts for repeated trials | Rate-limit by email domain; future: device fingerprinting (Charter 15) |
| Reminder emails arrive after user already converted | Check `trial_converted_at` immediately before sending; Stripe webhook sets this field |
| 500-credit allocation is too generous for trial abuse | Monitor trial-to-paid conversion rate; adjust credits or duration if abuse detected |
| Clock skew between worker and DB | Use DB `NOW()` for all comparisons, not application-layer `Date.now()` |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| Auto-enrollment on signup | Create new user → `subscriptions.plan = "pro"`, `status = "trialing"`, `trial_ends_at = NOW() + 14d` | Integration |
| Trial expiry downgrade | Set `trial_ends_at` to past → run workflow → `plan = "free"`, `status = "active"` | Integration |
| Mid-trial conversion | Subscribe via Checkout during trial → `trial_converted_at` set → expiry workflow skips user | Integration |
| Reminder at T-3d | Mock clock to 11 days post-signup → verify email sent with upgrade CTA | Unit |
| Reminder at T-1d | Mock clock to 13 days post-signup → verify email sent | Unit |
| No reminder after conversion | Set `trial_converted_at` → run reminder check → no email sent | Unit |
| Idempotent expiry | Run expiry workflow twice on same expired user → only one downgrade, one email | Integration |
