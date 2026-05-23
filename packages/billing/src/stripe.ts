/**
 * Stripe SDK scaffolding (Charter 03 Epics 02–06).
 *
 * Conditional: every export is a no-op until `STRIPE_SECRET_KEY` is set.
 *
 * Wire-up:
 *   1. Create a Stripe account, generate live + test API keys.
 *   2. Set `STRIPE_SECRET_KEY=sk_test_...` (test mode initially).
 *   3. Set `STRIPE_WEBHOOK_SECRET=whsec_...` per environment
 *      (different secrets for staging vs production — Charter 06 Epic 03).
 *   4. `pnpm --filter @retune/billing add stripe`
 *   5. Add the webhook handler at `apps/web/src/app/api/billing/webhooks/stripe/route.ts`
 *      using `verifyWebhookSignature` + `recordStripeEvent` from this module.
 *   6. Add the Checkout-session creator at `apps/web/src/app/api/billing/checkout/route.ts`
 *      using `createCheckoutSession`.
 *
 * Idempotency:
 *   - Every webhook event is persisted via `recordStripeEvent` BEFORE
 *     the billing handler runs. Duplicate `event.id` → unique-violation
 *     → handler skipped (Charter 03 Epic 03).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ─── Plan SKUs (env-driven so test/prod can use different prices) ─────
export const STRIPE_PRICE_IDS = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? "",
  max_monthly: process.env.STRIPE_PRICE_MAX_MONTHLY ?? "",
} as const;

export const stripeEnabled = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

// ─── Lazy SDK accessor ──────────────────────────────────────────────
let _client: unknown = null;

export async function getStripeClient(): Promise<unknown> {
  if (!stripeEnabled()) return null;
  if (_client) return _client;
  try {
    const Stripe = (await import("stripe")).default;
    _client = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
      apiVersion: "2026-04-22.dahlia",
      maxNetworkRetries: 3,
      timeout: 10_000,
      typescript: true,
    });
    return _client;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[stripe] SDK not installed — skipping. To enable: pnpm --filter @retune/billing add stripe",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ─── Webhook signature verification ─────────────────────────────────
/**
 * Manual HMAC verification fallback so we don't have to import the
 * Stripe SDK just to verify a signature in environments where the SDK
 * isn't installed yet. Once `pnpm add stripe` runs, prefer
 * `stripe.webhooks.constructEvent(rawBody, sig, secret)` which adds
 * timestamp tolerance and event-format guards.
 *
 * Spec: https://stripe.com/docs/webhooks/signatures
 *
 *   Stripe-Signature: t=1234567890,v1=signature_hex
 *   payload_to_sign  = "${t}.${rawBody}"
 *   expected         = HMAC-SHA256(secret, payload_to_sign)
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300,
): { valid: boolean; reason?: string } {
  if (!signatureHeader) return { valid: false, reason: "missing_signature_header" };
  if (!webhookSecret || webhookSecret.length < 16) {
    return { valid: false, reason: "missing_or_weak_webhook_secret" };
  }

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim() ?? "", v?.trim() ?? ""];
    }),
  );

  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { valid: false, reason: "malformed_signature" };

  // Timestamp tolerance window (replay protection).
  const eventTime = Number(t);
  if (!Number.isFinite(eventTime)) return { valid: false, reason: "invalid_timestamp" };
  const ageSeconds = Math.abs(Date.now() / 1000 - eventTime);
  if (ageSeconds > toleranceSeconds) return { valid: false, reason: "timestamp_outside_tolerance" };

  // HMAC verify.
  const payload = `${t}.${rawBody}`;
  const expected = createHmac("sha256", webhookSecret).update(payload).digest("hex");
  const actual = v1;

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  if (expectedBuf.length !== actualBuf.length) return { valid: false, reason: "length_mismatch" };
  if (!timingSafeEqual(expectedBuf, actualBuf))
    return { valid: false, reason: "signature_mismatch" };

  return { valid: true };
}

// ─── Event types we care about ──────────────────────────────────────
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
] as const;

export type StripeEventType = (typeof HANDLED_EVENT_TYPES)[number];

// ─── Persist incoming event (idempotency) ───────────────────────────
import { db, stripe_events, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";

interface StripeEventLike {
  id: string;
  type: string;
  api_version?: string | null;
  livemode: boolean;
  data: {
    object: {
      id?: string;
      customer?: string | null;
      subscription?: string | null;
      client_reference_id?: string | null;
      metadata?: Record<string, string> | null;
      [k: string]: unknown;
    };
  };
}

/**
 * Insert into `stripe_events` keyed by Stripe `event.id`. Returns:
 *   - "new"       — first time we've seen this event; caller should process it.
 *   - "duplicate" — already processed; caller should skip.
 *
 * Uses `ON CONFLICT (id) DO NOTHING` so concurrent webhook deliveries
 * cannot both run the handler. Idempotency is enforced at the storage
 * layer, not in application code.
 */
export async function recordStripeEvent(
  event: StripeEventLike,
  signatureHeader: string,
): Promise<"new" | "duplicate"> {
  const obj = event.data?.object ?? {};
  const customerId = typeof obj.customer === "string" ? obj.customer : null;
  const subscriptionId =
    typeof obj.subscription === "string"
      ? obj.subscription
      : event.type.startsWith("customer.subscription") && typeof obj.id === "string"
        ? obj.id
        : null;

  const inserted = await db
    .insert(stripe_events)
    .values({
      id: event.id,
      event_type: event.type,
      api_version: event.api_version ?? null,
      livemode: event.livemode,
      payload: event as unknown as Record<string, unknown>,
      customer_id: customerId,
      subscription_id: subscriptionId,
      status: "received",
      signature: signatureHeader.slice(0, 512),
    })
    .onConflictDoNothing()
    .returning();

  return inserted.length === 0 ? "duplicate" : "new";
}

/**
 * Mark an event as processed (or failed). Safe to call multiple times —
 * the row is keyed by Stripe event id and only ever gets richer.
 */
export async function markStripeEventProcessed(
  eventId: string,
  result: "processed" | "failed",
  error?: string,
): Promise<void> {
  await db
    .update(stripe_events)
    .set({
      status: result,
      processed_at: new Date(),
      processing_error: error ?? null,
    })
    .where(eq(stripe_events.id, eventId));
}

/**
 * Dispatch a webhook event to the matching handler. Updates the
 * `subscriptions` table for the relevant user. Throws on unknown
 * `client_reference_id` — that means the Checkout session was created
 * outside our flow and we can't safely attribute it.
 */
export async function processStripeEvent(event: StripeEventLike): Promise<void> {
  const obj = event.data.object as {
    id?: string;
    customer?: string | null;
    subscription?: string | null;
    client_reference_id?: string | null;
    metadata?: Record<string, string> | null;
    status?: string;
    cancel_at_period_end?: boolean;
    current_period_start?: number;
    current_period_end?: number;
    items?: { data: Array<{ price?: { id?: string } }> };
  };

  const userId = obj.client_reference_id ?? obj.metadata?.userId ?? obj.metadata?.user_id ?? null;

  switch (event.type) {
    case "checkout.session.completed": {
      // Session has client_reference_id → user. Persist customer +
      // subscription ids so subsequent updates can find the row by
      // either userId or customerId.
      if (!userId || typeof obj.customer !== "string") return;
      await db
        .insert(subscriptions)
        .values({
          userId,
          stripeCustomerId: obj.customer,
          stripeSubscriptionId: typeof obj.subscription === "string" ? obj.subscription : null,
          plan: planFromPriceId(obj.items?.data?.[0]?.price?.id ?? null),
          status: "active",
        })
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: {
            stripeCustomerId: obj.customer,
            stripeSubscriptionId: typeof obj.subscription === "string" ? obj.subscription : null,
            plan: planFromPriceId(obj.items?.data?.[0]?.price?.id ?? null),
            status: "active",
            updatedAt: new Date(),
          },
        });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      if (typeof obj.customer !== "string") return;
      const priceId = obj.items?.data?.[0]?.price?.id ?? null;
      await db
        .update(subscriptions)
        .set({
          plan: planFromPriceId(priceId),
          status: obj.status ?? "active",
          stripeSubscriptionId: typeof obj.id === "string" ? obj.id : null,
          cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
          currentPeriodStart: obj.current_period_start
            ? new Date(obj.current_period_start * 1000)
            : null,
          currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, obj.customer));
      return;
    }

    case "customer.subscription.deleted": {
      if (typeof obj.customer !== "string") return;
      await db
        .update(subscriptions)
        .set({
          plan: "free",
          status: "canceled",
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, obj.customer));
      return;
    }

    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      if (typeof obj.customer !== "string") return;
      await db
        .update(subscriptions)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(subscriptions.stripeCustomerId, obj.customer));
      return;
    }

    case "invoice.paid":
    case "customer.subscription.trial_will_end":
      // Observational only — handled by alerting, not state mutation.
      return;

    default:
      return;
  }
}

function planFromPriceId(priceId: string | null): "free" | "pro" | "max" {
  if (!priceId) return "free";
  if (priceId === STRIPE_PRICE_IDS.pro_monthly) return "pro";
  if (priceId === STRIPE_PRICE_IDS.max_monthly) return "max";
  return "free";
}

// ─── Checkout session helper ────────────────────────────────────────
/**
 * Create a Stripe Checkout session. Returns the hosted Checkout URL.
 *
 * Requires:
 *   - STRIPE_SECRET_KEY env var
 *   - `stripe` npm package installed
 *
 * Throws a typed error if either is missing so the route handler can
 * return a clean 503 instead of a 500.
 */
export async function createCheckoutSession(params: {
  userId: string;
  customerEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  if (!stripeEnabled()) {
    throw new StripeNotConfiguredError("STRIPE_SECRET_KEY missing");
  }
  const stripe = (await getStripeClient()) as unknown as {
    checkout: {
      sessions: {
        create: (input: Record<string, unknown>) => Promise<{ id: string; url: string | null }>;
      };
    };
  } | null;
  if (!stripe) throw new StripeNotConfiguredError("Stripe SDK not installed");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    customer_email: params.customerEmail,
    client_reference_id: params.userId,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    metadata: { userId: params.userId },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  return { url: session.url ?? "", sessionId: session.id };
}

/**
 * Create a Customer Portal session (subscription self-service:
 * upgrade, downgrade, cancel, update payment method, view invoices).
 */
export async function createCustomerPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  if (!stripeEnabled()) {
    throw new StripeNotConfiguredError("STRIPE_SECRET_KEY missing");
  }
  const stripe = (await getStripeClient()) as unknown as {
    billingPortal: {
      sessions: {
        create: (input: Record<string, unknown>) => Promise<{ url: string }>;
      };
    };
  } | null;
  if (!stripe) throw new StripeNotConfiguredError("Stripe SDK not installed");

  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });

  return { url: session.url };
}

export class StripeNotConfiguredError extends Error {
  readonly code = "stripe_not_configured" as const;
  constructor(message: string) {
    super(message);
    this.name = "StripeNotConfiguredError";
  }
}
