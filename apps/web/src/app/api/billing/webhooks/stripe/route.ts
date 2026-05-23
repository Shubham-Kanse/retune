/**
 * POST /api/billing/webhooks/stripe
 *
 * Charter 03 Epic 02 + 03 — Stripe webhook receiver.
 *
 * Contract:
 *   - Reads the raw request body (signature verification needs the
 *     exact bytes Stripe signed; we cannot `req.json()` first).
 *   - Verifies the `Stripe-Signature` header against
 *     `STRIPE_WEBHOOK_SECRET` with replay protection.
 *   - Persists the event into `stripe_events` keyed by `event.id`.
 *     Idempotency is enforced at the unique-constraint layer — the
 *     handler runs at most once per event.
 *   - Dispatches to the matching `processStripeEvent` handler which
 *     updates the `subscriptions` table.
 *   - ALWAYS responds 200 once the signature is verified — Stripe
 *     retries on non-2xx, and we don't want retries to amplify a
 *     processing bug. Failures are recorded in `stripe_events.status`.
 *
 * Returns 400 only when the signature is missing or invalid (Stripe
 * stops retrying after enough 400s — the only case where that's correct).
 */

import {
  HANDLED_EVENT_TYPES,
  markStripeEventProcessed,
  processStripeEvent,
  recordStripeEvent,
  verifyWebhookSignature,
} from "@retune/billing/stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // node:crypto required for HMAC verify
export const dynamic = "force-dynamic";

interface MinimalStripeEvent {
  id: string;
  type: string;
  api_version?: string | null;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}

export async function POST(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Production must have this set; in dev/test we accept that the
    // endpoint is unreachable until configured. Returning 503 keeps
    // Stripe's CLI `stripe listen` from looping until the secret lands.
    return NextResponse.json({ error: "stripe_webhook_secret_missing" }, { status: 503 });
  }

  const signatureHeader = request.headers.get("stripe-signature") ?? "";
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "body_read_failed" }, { status: 400 });
  }

  const verified = verifyWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!verified.valid) {
    // Don't include the reason in the response — that's information
    // useful only to an attacker probing for valid signatures.
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Parse the event JSON. Signature is already verified so we can trust
  // the body shape, but defend against malformed JSON anyway.
  let event: MinimalStripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_event_json" }, { status: 400 });
  }
  if (typeof event?.id !== "string" || typeof event?.type !== "string") {
    return NextResponse.json({ error: "malformed_event" }, { status: 400 });
  }

  // Persist (idempotent). Returns "duplicate" on second delivery —
  // that's the happy path; we ack 200 and skip processing.
  let recordResult: "new" | "duplicate";
  try {
    recordResult = await recordStripeEvent(event, signatureHeader);
  } catch (err) {
    // Persistence failure is the one case where Stripe SHOULD retry —
    // 503 keeps the event in Stripe's queue.
    return NextResponse.json(
      {
        error: "persist_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 503 },
    );
  }

  if (recordResult === "duplicate") {
    return NextResponse.json({ ok: true, status: "duplicate" });
  }

  // Process events we recognise. Unknown event types are persisted but
  // not dispatched — they'll surface in observability dashboards.
  const knownType = (HANDLED_EVENT_TYPES as readonly string[]).includes(event.type);
  if (!knownType) {
    await markStripeEventProcessed(event.id, "processed");
    return NextResponse.json({ ok: true, status: "ignored", type: event.type });
  }

  try {
    await processStripeEvent(event);
    await markStripeEventProcessed(event.id, "processed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markStripeEventProcessed(event.id, "failed", message);
    // Still return 200: the event is persisted, our state is recorded,
    // and Stripe re-delivering won't help (idempotency means the next
    // attempt would short-circuit as "duplicate"). Reconciliation
    // happens via the processed=false index, not Stripe retries.
    // eslint-disable-next-line no-console
    console.error("[stripe-webhook] processing failed", {
      event_id: event.id,
      type: event.type,
      error: message,
    });
  }

  return NextResponse.json({ ok: true, status: "processed" });
}
