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

const consentValuesMock = vi.fn();

vi.mock("@retune/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
  users: { id: "id", onboardingCompleted: "onboardingCompleted", __table: "users" },
  subscriptions: { __table: "subscriptions" },
  processorConsents: { __table: "processor_consents" },
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
    consentValuesMock.mockResolvedValue(undefined);
    insertMock.mockImplementation((table: { __table?: string }) => {
      if (table.__table === "users") return { values: userValuesMock };
      if (table.__table === "processor_consents") return { values: consentValuesMock };
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
    // No consents passed → no consent insert.
    expect(consentValuesMock).not.toHaveBeenCalled();
  });

  it("signUp persists processor consents when provided", async () => {
    signUpMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { createIdentityModule } = await import("@/lib/identity");

    const identity = createIdentityModule();
    await identity.signUp({
      email: "x@y.com",
      password: "Password123",
      fullName: "X",
      processorConsents: { anthropic: true, openai: true, retune: false },
    });

    expect(consentValuesMock).toHaveBeenCalledTimes(1);
    const rows = consentValuesMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.processor).sort()).toEqual(["anthropic", "openai"]);
    for (const r of rows) {
      expect(r.userId).toBe("u1");
      expect(r.granted).toBe(true);
      expect(r.grantedAt).toBeInstanceOf(Date);
    }
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
