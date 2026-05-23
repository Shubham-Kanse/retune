/**
 * POST /api/billing/checkout
 *
 * Charter 03 Epic 02 — Stripe Checkout session creation.
 *
 * Body: { plan: "pro" | "max" }
 *
 * Returns a Stripe-hosted Checkout URL. The client redirects to it.
 * Once the user completes payment, Stripe POSTs a
 * `checkout.session.completed` event to our webhook which upserts
 * the `subscriptions` row.
 *
 * Auth: requires a Supabase session (via withSupabaseAuth). Rate-limited
 * + CSRF-checked + Origin-checked by the wrapper.
 */

import { withSupabaseAuth } from "@/lib/api-handler";
import { createClient } from "@/lib/supabase/server";
import {
  STRIPE_PRICE_IDS,
  StripeNotConfiguredError,
  createCheckoutSession,
} from "@retune/billing/stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLAN_TO_PRICE: Record<"pro" | "max", string> = {
  pro: STRIPE_PRICE_IDS.pro_monthly,
  max: STRIPE_PRICE_IDS.max_monthly,
};

export const POST = withSupabaseAuth(
  async (req, userId) => {
    const body = (await req.json().catch(() => ({}))) as { plan?: unknown };
    const planRaw = body.plan;
    if (planRaw !== "pro" && planRaw !== "max") {
      return NextResponse.json(
        { error: "invalid_plan", message: "plan must be 'pro' or 'max'" },
        { status: 400 },
      );
    }
    const plan: "pro" | "max" = planRaw;

    const priceId = PLAN_TO_PRICE[plan];
    if (!priceId) {
      return NextResponse.json(
        {
          error: "price_not_configured",
          message: `STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY is unset`,
        },
        { status: 503 },
      );
    }

    // Need the user's email for Checkout prefill.
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      return NextResponse.json({ error: "no_email_on_user" }, { status: 400 });
    }

    // Build absolute callback URLs from the request origin so this
    // works in dev (localhost:3000) and production without env vars.
    const origin = new URL(req.url).origin;
    const successUrl = `${origin}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/pricing?checkout=cancel`;

    try {
      const session = await createCheckoutSession({
        userId,
        customerEmail: email,
        priceId,
        successUrl,
        cancelUrl,
      });
      return NextResponse.json({ url: session.url, sessionId: session.sessionId });
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return NextResponse.json(
          { error: "stripe_not_configured", message: err.message },
          { status: 503 },
        );
      }
      // eslint-disable-next-line no-console
      console.error("[checkout] failed", err);
      return NextResponse.json(
        {
          error: "checkout_failed",
          message: err instanceof Error ? err.message : "unknown",
        },
        { status: 500 },
      );
    }
  },
  // Rate-limit aggressively — Checkout creation is expensive and
  // shouldn't be called more than once per user-click.
  { rateLimitPerMinute: 10 },
);
