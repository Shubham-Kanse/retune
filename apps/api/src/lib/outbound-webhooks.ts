/**
 * Outbound webhook signing + delivery (Charter 17 Epic 02).
 *
 * Sign payloads we send to third-party subscribers using the same
 * HMAC-over-(timestamp.body) pattern Stripe uses. Subscribers verify
 * with their per-endpoint signing secret.
 *
 * Header contract:
 *
 *   x-retune-signature: t=<unix-ts>,v1=<hex-sha256>
 *   x-retune-event:     <event_type>
 *   x-retune-event-id:  <event uuid>
 *   x-retune-attempt:   <retry attempt 1-5>
 *
 * Delivery semantics:
 *   - At-least-once. Subscribers MUST be idempotent on
 *     `x-retune-event-id`.
 *   - Retry schedule: 1m, 5m, 30m, 2h, 12h. Up to 5 attempts.
 *   - 2xx success ends retry. 4xx (client error) ends retry — no point.
 *     5xx + network errors retry.
 *   - Drop after 5 failed attempts. Surface in `outbound_webhook_events`
 *     with `status='failed'` for the operations dashboard.
 *
 * Key rotation:
 *   - Each subscription holds a primary signing secret + optional
 *     legacy secret. Both signatures are sent during a rollover window.
 *   - Quarterly rotation drilled per Charter 01 Epic 02.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type WebhookEventType =
  | "generation.completed"
  | "generation.failed"
  | "generation.refused"
  | "subscription.upgraded"
  | "subscription.downgraded"
  | "subscription.cancelled";

export interface OutboundWebhookEvent {
  /** Stable event id — subscribers dedupe on this. */
  id: string;
  /** Event type, dot-namespaced. */
  type: WebhookEventType;
  /** ISO timestamp at which the event was generated. */
  created_at: string;
  /** Tenant / user the event belongs to. */
  user_id: string;
  /** Event payload — schema differs per event type. */
  data: Record<string, unknown>;
}

export interface SignedDelivery {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
}

export interface WebhookSignerInput {
  url: string;
  /** Primary HMAC-SHA256 signing secret. */
  secret: string;
  /** Optional legacy secret for the rotation window. */
  legacy_secret?: string;
  event: OutboundWebhookEvent;
  /** Retry attempt number (1-based). */
  attempt: number;
  /** Override the timestamp (test-only). */
  now?: number;
}

/**
 * Build a signed webhook delivery. The returned `body` + `headers` can
 * be passed directly to `fetch(url, …)` or queued into a durable
 * delivery worker.
 */
export function signWebhookDelivery(input: WebhookSignerInput): SignedDelivery {
  if (!input.secret || input.secret.length < 16) {
    throw new Error("webhook signing secret must be >= 16 chars");
  }

  const body = JSON.stringify(input.event);
  const t = Math.floor((input.now ?? Date.now()) / 1000);
  const payload_to_sign = `${t}.${body}`;

  const sig_primary = createHmac("sha256", input.secret).update(payload_to_sign).digest("hex");
  const sig_parts = [`t=${t}`, `v1=${sig_primary}`];
  if (input.legacy_secret && input.legacy_secret.length >= 16) {
    const sig_legacy = createHmac("sha256", input.legacy_secret)
      .update(payload_to_sign)
      .digest("hex");
    sig_parts.push(`v1=${sig_legacy}`);
  }

  return {
    url: input.url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Retune-Webhooks/1.0 (+https://retuned.cv/docs/webhooks)",
      "x-retune-signature": sig_parts.join(","),
      "x-retune-event": input.event.type,
      "x-retune-event-id": input.event.id,
      "x-retune-attempt": String(input.attempt),
    },
    body,
  };
}

/**
 * Subscriber-side helper: verify an inbound webhook delivery.
 */
export function verifyWebhookDelivery(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300,
): { valid: boolean; reason?: string } {
  if (!signatureHeader) return { valid: false, reason: "missing_signature_header" };
  if (!webhookSecret || webhookSecret.length < 16) {
    return { valid: false, reason: "missing_or_weak_webhook_secret" };
  }

  const parts: { t?: string; v1: string[] } = { v1: [] };
  for (const segment of signatureHeader.split(",")) {
    const [k, v] = segment.split("=");
    if (k?.trim() === "t") parts.t = v?.trim();
    else if (k?.trim() === "v1" && v) parts.v1.push(v.trim());
  }
  if (!parts.t || parts.v1.length === 0) {
    return { valid: false, reason: "malformed_signature" };
  }

  const t = Number(parts.t);
  if (!Number.isFinite(t)) return { valid: false, reason: "invalid_timestamp" };
  const ageSeconds = Math.abs(Date.now() / 1000 - t);
  if (ageSeconds > toleranceSeconds) return { valid: false, reason: "timestamp_outside_tolerance" };

  const expected = createHmac("sha256", webhookSecret).update(`${t}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");

  for (const sig of parts.v1) {
    const actualBuf = Buffer.from(sig, "hex");
    if (expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)) {
      return { valid: true };
    }
  }

  return { valid: false, reason: "signature_mismatch" };
}

/** Retry schedule (ms from event creation). 5 attempts ≈ 14h44m. */
export const WEBHOOK_RETRY_SCHEDULE_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

/** True if a status code indicates a permanent failure (no retry). */
export function isTerminalFailure(status: number): boolean {
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}
