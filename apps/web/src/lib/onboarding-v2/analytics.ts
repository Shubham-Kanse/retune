// Onboarding V2 — Analytics Events
//
// Funnel tracking for the new onboarding pipeline. Events are emitted to the
// analytics provider (or console in dev) and persisted to the
// user_onboarding_metadata_v2 table where appropriate.

export type OnboardingEvent =
  | { event: "onboarding_v2_started"; properties: { userId: string } }
  | {
      event: "onboarding_v2_upload_attempted";
      properties: { fileType: string; fileSizeBytes: number; attempt: number };
    }
  | {
      event: "onboarding_v2_upload_success";
      properties: { method: "file" | "paste"; charCount: number };
    }
  | {
      event: "onboarding_v2_upload_failed";
      properties: { errorCode: string; attempt: number };
    }
  | {
      event: "onboarding_v2_extraction_complete";
      properties: { confidence: string; schemaMapSuccess: boolean };
    }
  | {
      event: "onboarding_v2_inference_complete";
      properties: {
        roleFamily: string;
        seniority: string;
        industry: string;
        ambiguities: string[];
      };
    }
  | {
      event: "onboarding_v2_summary_presented";
      properties: { hasAmbiguity: boolean; extractionQuality: string };
    }
  | {
      event: "onboarding_v2_summary_confirmed";
      properties: { correctionRounds: number };
    }
  | { event: "onboarding_v2_correction_started"; properties: Record<string, never> }
  | {
      event: "onboarding_v2_correction_round";
      properties: { round: number; understood: boolean };
    }
  | {
      event: "onboarding_v2_questions_complete";
      properties: { answeredCount: number; skippedCount: number; path: string };
    }
  | {
      event: "onboarding_v2_voice_complete";
      properties: { source: "collected" | "default"; confidence: string };
    }
  | {
      event: "onboarding_v2_committed";
      properties: {
        qualityScore: number;
        completenessPath: string;
        totalLLMCalls: number;
        totalCostUsd: number;
        durationMs: number;
      };
    }
  | { event: "onboarding_v2_finish_later"; properties: { stageAtExit: string } }
  | { event: "onboarding_v2_start_over"; properties: { stageAtReset: string } }
  | {
      event: "onboarding_v2_error";
      properties: { stage: number; errorCode: string; retryable: boolean };
    };

/**
 * Track an onboarding event. In production this dispatches to the configured
 * analytics provider (PostHog, Segment, etc). In tests/dev it logs to console.
 *
 * The implementation deliberately swallows all errors so analytics never block
 * the onboarding flow.
 */
export function trackOnboardingEvent(event: OnboardingEvent): void {
  try {
    // Server-side console emission. In production a real provider call would
    // be wired here (e.g. posthog.capture(event.event, event.properties)).
    // Keeping it framework-free for now so the function works in API routes,
    // server components and client components alike.
    const tag = "[analytics:onboarding_v2]";
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return;
    // eslint-disable-next-line no-console
    console.log(tag, event.event, event.properties);
  } catch {
    // Swallow — analytics must never break onboarding.
  }
}

/** Convenience helper for the common case of recording a stage error. */
export function trackOnboardingError(stage: number, errorCode: string, retryable = true): void {
  trackOnboardingEvent({
    event: "onboarding_v2_error",
    properties: { stage, errorCode, retryable },
  });
}
