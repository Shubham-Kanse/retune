import { test } from "@playwright/test";

test.describe.skip("legacy onboarding E2E", () => {
  test("quarantined", () => {
    // The old fixed-queue onboarding flow and "Start from scratch" assertions
    // were retired by the SOTA planner flow. See onboarding-sota.spec.ts.
  });
});
