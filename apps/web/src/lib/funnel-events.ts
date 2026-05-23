/**
 * Funnel events helper (Charter 25 Epic 02).
 *
 * Single canonical call site for the activation-funnel events Retune
 * fires to PostHog. Two surfaces:
 *   - Server: `captureFunnelEvent(distinctId, event, properties?)`
 *     fires from API routes via posthog-node.
 *   - Client: re-export of the existing `captureEvent` from
 *     `@/components/posthog-provider` (already wired).
 *
 * NOT to be confused with the in-memory `analytics` stub at
 * `lib/analytics.ts` which buffers events for the operations
 * dashboard. This module ships to PostHog + sanitises PII before send.
 */

import { captureServerEvent } from "./posthog";

/** Closed event taxonomy. New events MUST be added here first. */
export type FunnelEventName =
  | "signup_complete"
  | "signup_failed"
  | "login_success"
  | "login_failed"
  | "onboarding_v2_started"
  | "onboarding_v2_resume_uploaded"
  | "onboarding_v2_summary_confirmed"
  | "onboarding_v2_completed"
  | "first_generation_started"
  | "first_generation_completed"
  | "first_generation_refused"
  | "first_resume_downloaded"
  | "subscribed"
  | "trial_started"
  | "trial_will_end"
  | "subscription_canceled"
  | "billing_blocked";

interface PropertyBag {
  [k: string]: string | number | boolean | null | undefined;
}

const PII_KEY_PATTERN =
  /password|secret|token|api[_-]?key|^email$|^phone$|^full[_-]?name$|^address$|^ssn$|^dob$/i;

/**
 * Strip property keys that look credential-bearing or contain PII.
 */
function sanitiseProperties(props: PropertyBag): PropertyBag {
  const out: PropertyBag = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (PII_KEY_PATTERN.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Server-side capture. `distinctId` is the Supabase user UUID — never
 * email or any PII. No-op when PostHog is not configured.
 */
export async function captureFunnelEvent(
  distinctId: string,
  event: FunnelEventName,
  properties?: PropertyBag,
): Promise<void> {
  await captureServerEvent(distinctId, event, sanitiseProperties(properties ?? {}));
}

/**
 * Pull a safe email-domain from an email without leaking the local part.
 */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}
