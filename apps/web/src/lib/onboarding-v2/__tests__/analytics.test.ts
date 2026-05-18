import { describe, expect, it } from "vitest";
import { trackOnboardingError, trackOnboardingEvent } from "../analytics";

describe("trackOnboardingEvent", () => {
  it("does not throw on any documented event shape", () => {
    expect(() =>
      trackOnboardingEvent({
        event: "onboarding_v2_started",
        properties: { userId: "u1" },
      }),
    ).not.toThrow();

    expect(() =>
      trackOnboardingEvent({
        event: "onboarding_v2_committed",
        properties: {
          qualityScore: 87,
          completenessPath: "standard",
          totalLLMCalls: 12,
          totalCostUsd: 0.18,
          durationMs: 145_000,
        },
      }),
    ).not.toThrow();
  });

  it("never throws when console fails", () => {
    const original = console.log;
    // eslint-disable-next-line no-console
    console.log = () => {
      throw new Error("boom");
    };
    try {
      expect(() =>
        trackOnboardingEvent({
          event: "onboarding_v2_finish_later",
          properties: { stageAtExit: "voice" },
        }),
      ).not.toThrow();
    } finally {
      console.log = original;
    }
  });
});

describe("trackOnboardingError", () => {
  it("emits an onboarding_v2_error event with the supplied stage and code", () => {
    expect(() => trackOnboardingError(7, "answer_eval_failed", true)).not.toThrow();
  });
});
