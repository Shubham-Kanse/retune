/**
 * POST /api/billing/portal
 *
 * Charter 03 Epic 05 — Stripe Customer Portal session.
 *
 * Stripe-hosted self-service for: changing plan, updating payment
 * method, downloading invoices, cancelling subscription. We never need
 * to build any of those screens ourselves.
 *
 * Auth: Supabase session required. Rate-limited + CSRF-checked + Origin-checked.
 */

import { withSupabaseAuth } from "@/lib/api-handler";
import { StripeNotConfiguredError, createCustomerPortalSession } from "@retune/billing/stripe";
import { db, subscriptions } from "@retune/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withSupabaseAuth(
  async (req, userId) => {
    // Look up the user's Stripe customer id. Created on first
    // checkout.session.completed event.
    const rows = await db
      .select({ stripeCustomerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    const customerId = rows[0]?.stripeCustomerId;
    if (!customerId) {
      return NextResponse.json(
        {
          error: "no_subscription",
          message: "Cannot open the billing portal until you've subscribed at least once.",
        },
        { status: 404 },
      );
    }

    const origin = new URL(req.url).origin;
    const returnUrl = `${origin}/account`;

    try {
      const session = await createCustomerPortalSession({ customerId, returnUrl });
      return NextResponse.json({ url: session.url });
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        return NextResponse.json(
          { error: "stripe_not_configured", message: err.message },
          { status: 503 },
        );
      }
      // eslint-disable-next-line no-console
      console.error("[portal] failed", err);
      return NextResponse.json(
        {
          error: "portal_failed",
          message: err instanceof Error ? err.message : "unknown",
        },
        { status: 500 },
      );
    }
  },
  { rateLimitPerMinute: 10 },
);
