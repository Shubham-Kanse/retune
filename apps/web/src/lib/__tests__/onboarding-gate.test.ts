import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const fromMock = vi.fn();
const whereMock = vi.fn();
const limitMock = vi.fn();

vi.mock("@retune/db", () => ({
  db: { select: selectMock },
  users: { id: "id", onboardingCompleted: "onboardingCompleted", emailVerified: "emailVerified" },
}));

describe("getOnboardingStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });
  });

  it("returns flags from the users row", async () => {
    limitMock.mockResolvedValue([{ onboardingCompleted: true, emailVerified: true }]);
    const { getOnboardingStatus } = await import("@/lib/onboarding-gate");
    const status = await getOnboardingStatus("u1");
    expect(status).toEqual({ onboardingCompleted: true, emailVerified: true });
  });

  it("fail-closes when no row exists", async () => {
    limitMock.mockResolvedValue([]);
    const { getOnboardingStatus } = await import("@/lib/onboarding-gate");
    const status = await getOnboardingStatus("u-missing");
    expect(status).toEqual({ onboardingCompleted: false, emailVerified: false });
  });

  it("treats null fields as false", async () => {
    limitMock.mockResolvedValue([{ onboardingCompleted: null, emailVerified: null }]);
    const { getOnboardingStatus } = await import("@/lib/onboarding-gate");
    const status = await getOnboardingStatus("u-null");
    expect(status).toEqual({ onboardingCompleted: false, emailVerified: false });
  });
});
