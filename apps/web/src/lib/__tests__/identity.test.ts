import { beforeEach, describe, expect, it, vi } from "vitest";

const signUpMock = vi.fn();
const signInWithPasswordMock = vi.fn();
const signOutMock = vi.fn();
const getUserMock = vi.fn();

const selectMock = vi.fn();
const fromMock = vi.fn();
const whereMock = vi.fn();
const limitMock = vi.fn();
const insertMock = vi.fn();
const userValuesMock = vi.fn();
const subValuesMock = vi.fn();
const userOnConflictMock = vi.fn();
const subOnConflictMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: signUpMock,
      signInWithPassword: signInWithPasswordMock,
      signOut: signOutMock,
      getUser: getUserMock,
    },
  })),
}));

vi.mock("@retune/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
  users: { id: "id", onboardingCompleted: "onboardingCompleted", __table: "users" },
  subscriptions: { __table: "subscriptions" },
}));

describe("IdentityModule", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    limitMock.mockResolvedValue([{ onboardingCompleted: true }]);
    whereMock.mockReturnValue({ limit: limitMock });
    fromMock.mockReturnValue({ where: whereMock });
    selectMock.mockReturnValue({ from: fromMock });

    userValuesMock.mockReturnValue({ onConflictDoNothing: userOnConflictMock });
    subValuesMock.mockReturnValue({ onConflictDoNothing: subOnConflictMock });
    userOnConflictMock.mockResolvedValue(undefined);
    subOnConflictMock.mockResolvedValue(undefined);
    insertMock.mockImplementation((table: { __table?: string }) => {
      if (table.__table === "users") return { values: userValuesMock };
      return { values: subValuesMock };
    });
  });

  it("signUp creates auth user and local records", async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { createIdentityModule } = await import("@/lib/identity");

    const identity = createIdentityModule();
    const res = await identity.signUp({ email: "x@y.com", password: "Password123", fullName: "X" });

    expect(res).toEqual({ userId: "u1", emailVerificationSent: true });
    expect(userValuesMock).toHaveBeenCalledTimes(1);
    expect(subValuesMock).toHaveBeenCalledTimes(1);
  });

  it("signIn returns onboarding flag", async () => {
    signInWithPasswordMock.mockResolvedValue({ data: { user: { id: "u2" } }, error: null });
    const { createIdentityModule } = await import("@/lib/identity");

    const identity = createIdentityModule();
    const res = await identity.signIn({ email: "x@y.com", password: "secret" });

    expect(res).toEqual({ userId: "u2", onboardingCompleted: true });
  });

  it("signOut is idempotent on missing session", async () => {
    signOutMock.mockResolvedValue({ error: { message: "Auth session missing!" } });
    const { createIdentityModule } = await import("@/lib/identity");

    const identity = createIdentityModule();
    const res = await identity.signOut();
    expect(res).toEqual({ ok: true });
  });

  it("resolveSessionState maps user from provider", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "u3", email: "u3@example.com", user_metadata: { full_name: "U 3" } } },
      error: null,
    });
    const { createIdentityModule } = await import("@/lib/identity");

    const identity = createIdentityModule();
    const session = await identity.resolveSessionState();
    expect(session).toEqual({ userId: "u3", email: "u3@example.com", fullName: "U 3", expiresAt: 0 });
  });
});
