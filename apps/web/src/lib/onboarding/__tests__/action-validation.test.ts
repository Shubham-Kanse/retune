import { describe, expect, it } from "vitest";
import { resolveTrustedClientAction } from "../action-validation";
import type { OnboardingQuestion } from "../types";

const question: OnboardingQuestion = {
  phase: "work_preferences",
  field: "careerIntent.workPreference",
  questionKey: "work_preferences",
  prompt: "Pick work preference",
  answerType: "single_select",
  skipAllowed: true,
  pills: [
    { label: "Remote", value: "remote", action: "set_field", field: "careerIntent.workPreference" },
    { label: "Hybrid", value: "hybrid", action: "set_field", field: "careerIntent.workPreference" },
  ],
};

describe("resolveTrustedClientAction", () => {
  it("accepts a minimal pill identity that matches the current server question", () => {
    const result = resolveTrustedClientAction({
      currentQuestion: question,
      request: {
        kind: "pill_click",
        questionKey: "work_preferences",
        action: "set_field",
        field: "careerIntent.workPreference",
        value: "remote",
      },
    });

    expect(result.valid).toBe(true);
  });

  it("rejects a stale question key", () => {
    const result = resolveTrustedClientAction({
      currentQuestion: question,
      request: {
        kind: "pill_click",
        questionKey: "identity_confirm",
        action: "set_field",
        field: "careerIntent.workPreference",
        value: "remote",
      },
    });

    expect(result.valid).toBe(false);
  });

  it("rejects forged fields even if the value looks valid", () => {
    const result = resolveTrustedClientAction({
      currentQuestion: question,
      request: {
        kind: "pill_click",
        questionKey: "work_preferences",
        action: "set_field",
        field: "users.onboarding_completed",
        value: "remote",
      },
    });

    expect(result.valid).toBe(false);
  });
});
