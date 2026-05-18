/**
 * Onboarding/verification gate. Read-only helper used by the (auth) and
 * (onboarding) route group layouts to enforce that:
 *
 *   - authenticated users with `onboarding_completed = false` cannot reach
 *     the main app (they are sent to the onboarding flow),
 *   - authenticated users with `onboarding_completed = true` cannot loop
 *     back through onboarding (they are sent to /dashboard).
 *
 * Email-verification gating is left as a separate concern (see
 * route-guard layer) but the helper exposes the flag so callers can
 * compose both checks in one DB read.
 *
 * v2 routing: the new 9-stage onboarding is the only active onboarding flow.
 */

import { db, users } from "@retune/db";
import { eq } from "drizzle-orm";
import { isE2EAuthBypassEnabled } from "./onboarding-v2/auth";

export interface OnboardingStatus {
  onboardingCompleted: boolean;
  emailVerified: boolean;
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  if (isE2EAuthBypassEnabled()) {
    return { onboardingCompleted: false, emailVerified: true };
  }

  const rows = await db
    .select({
      onboardingCompleted: users.onboardingCompleted,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  // Fail-closed: if the row vanished (rare race) treat as un-onboarded so
  // the user is sent through onboarding rather than into a half-empty app.
  return {
    onboardingCompleted: row?.onboardingCompleted ?? false,
    emailVerified: row?.emailVerified ?? false,
  };
}

export function onboardingPath(): string {
  return "/onboarding-v2";
}
