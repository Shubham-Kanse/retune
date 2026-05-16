/**
 * Background helper that generates and persists the initial career
 * understanding right after onboarding completes (or after a fresh
 * profile-side resume import).
 *
 * Called fire-and-forget so it doesn't block the API response. The user
 * lands on the dashboard / profile page and the understanding is either
 * already ready or shows up shortly after via revalidation.
 *
 * Failures are logged but never surfaced — the user can still click
 * "Regenerate" manually if this background pass fails.
 */

import {
  generateInitialCareerUnderstanding,
  CareerUnderstandingAiError,
} from "./service";
import { persistCareerUnderstanding } from "./repository";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";

interface AutoGenerateParams {
  userId: string;
  /** When provided, skip the DB read; otherwise fetch the latest profile row. */
  profile?: CareerProfileV1 | null;
  readiness?: ProfileReadiness | null;
}

/**
 * Fire-and-forget initial understanding generation. Returns void immediately
 * to the caller; the actual work runs in the background.
 *
 * Idempotent: if an understanding already exists with revision > 0, this is
 * a no-op. Onboarding completion only fires this once.
 */
export function triggerInitialUnderstandingGeneration(params: AutoGenerateParams): void {
  // Run async in the background. The callback never throws.
  void runInBackground(params).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[understanding] background initial generation failed", err);
  });
}

async function runInBackground(params: AutoGenerateParams): Promise<void> {
  let profile = params.profile;
  let readiness = params.readiness ?? null;

  // Hydrate from DB if profile not passed
  if (!profile) {
    const rows = await dbModule.db
      .select()
      .from(dbModule.profiles)
      .where(eq(dbModule.profiles.userId, params.userId))
      .limit(1);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      console.warn("[understanding] no profile row for user", params.userId);
      return;
    }
    if (!isCareerProfileV1(row.careerProfile)) {
      console.warn("[understanding] careerProfile not v1 for user", params.userId);
      return;
    }
    profile = row.careerProfile as CareerProfileV1;
    readiness = (row.profileReadiness as ProfileReadiness | null | undefined) ?? null;

    // Idempotency: skip if understanding already exists with revision > 0.
    const existingRevision =
      typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0;
    if (existingRevision > 0) return;
  }

  try {
    const result = await generateInitialCareerUnderstanding({
      userId: params.userId,
      profile,
      readiness,
    });
    // Persist with revision = 1 (initial). expectedRevision = 0 ensures we
    // don't overwrite if another writer already produced an understanding.
    const understanding = { ...result.understanding, revision: 1 };
    await persistCareerUnderstanding({
      userId: params.userId,
      understanding,
      expectedRevision: 0,
    });
  } catch (err) {
    if (err instanceof CareerUnderstandingAiError && err.reason === "profile_too_thin") {
      // Profile genuinely doesn't have enough data — user will see the
      // empty state and click Regenerate manually after adding more facts.
      return;
    }
    throw err;
  }
}
