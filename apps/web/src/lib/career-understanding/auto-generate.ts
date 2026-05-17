/**
 * Background helper that generates and persists the initial career
 * understanding right after onboarding completes.
 *
 * Fire-and-forget. Emits onboarding_events at every transition.
 * Retries transient AI errors up to 2 times (1s → 2s delay).
 * Deterministic errors (profile_too_thin, model_returned_disallowed_facts)
 * are not retried.
 */

import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import { logOnboardingEvent } from "@/lib/onboarding/events";
import * as dbModule from "@retune/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { CareerUnderstandingAiError, generateInitialCareerUnderstanding } from "./service";
import { persistCareerUnderstanding } from "./repository";

const DETERMINISTIC_ERRORS = new Set(["profile_too_thin", "model_returned_disallowed_facts"]);
const MAX_RETRIES = 2;

interface AutoGenerateParams {
  userId: string;
  profile?: CareerProfileV1 | null;
  readiness?: ProfileReadiness | null;
}

export function triggerInitialUnderstandingGeneration(params: AutoGenerateParams): void {
  const traceId = randomUUID().slice(0, 8);
  void runInBackground(params, traceId).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[understanding] background initial generation failed", err);
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInBackground(params: AutoGenerateParams, traceId: string): Promise<void> {
  let profile = params.profile;
  let readiness = params.readiness ?? null;

  if (!profile) {
    const rows = await dbModule.db
      .select()
      .from(dbModule.profiles)
      .where(eq(dbModule.profiles.userId, params.userId))
      .limit(1);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.skipped_no_profile", payload: { traceId } });
      return;
    }
    if (!isCareerProfileV1(row.careerProfile)) {
      await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.skipped_not_v1", payload: { traceId } });
      return;
    }
    profile = row.careerProfile as CareerProfileV1;
    readiness = (row.profileReadiness as ProfileReadiness | null | undefined) ?? null;

    const existingRevision =
      typeof row.careerUnderstandingRevision === "number" ? row.careerUnderstandingRevision : 0;
    if (existingRevision > 0) {
      await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.skipped_existing_revision", payload: { traceId, revision: existingRevision } });
      return;
    }
  }

  await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.started", payload: { traceId } });

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(1000 * attempt);
    try {
      const startMs = Date.now();
      const result = await generateInitialCareerUnderstanding({ userId: params.userId, profile, readiness });
      const aiLatencyMs = Date.now() - startMs;
      const understanding = { ...result.understanding, revision: 1 };
      await persistCareerUnderstanding({ userId: params.userId, understanding, expectedRevision: 0 });
      await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.succeeded", payload: { traceId, attempt }, aiLatencyMs });
      return;
    } catch (err) {
      lastError = err;
      if (err instanceof CareerUnderstandingAiError) {
        if (err.reason === "profile_too_thin") {
          await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.skipped_thin_profile", payload: { traceId } });
          return;
        }
        if (DETERMINISTIC_ERRORS.has(err.reason)) {
          await logOnboardingEvent({ userId: params.userId, eventType: "understanding.bg.failed", payload: { traceId, attempt }, errorCode: err.reason });
          return;
        }
      }
      // Transient — retry if attempts remain
    }
  }

  await logOnboardingEvent({
    userId: params.userId,
    eventType: "understanding.bg.failed",
    payload: { traceId, attempts: MAX_RETRIES + 1 },
    errorCode: lastError instanceof CareerUnderstandingAiError ? lastError.reason : "unknown",
  });
  throw lastError;
}
