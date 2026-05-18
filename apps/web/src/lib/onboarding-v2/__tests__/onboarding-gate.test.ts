import { describe, expect, it, vi } from "vitest";

// onboarding-gate imports @retune/db at module load, so mock it before importing.
vi.mock("@retune/db", () => ({
  db: { select: vi.fn() },
  users: { id: "id", onboardingCompleted: "onboardingCompleted", emailVerified: "emailVerified" },
}));

describe("onboardingPath", () => {
  it("always returns the v2 onboarding route", async () => {
    const { onboardingPath } = await import("@/lib/onboarding-gate");
    expect(onboardingPath()).toBe("/onboarding-v2");
  });
});
