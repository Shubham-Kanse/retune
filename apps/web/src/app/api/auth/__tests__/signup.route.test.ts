import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();

vi.mock("@/lib/identity", () => ({
  createIdentityModule: vi.fn(() => ({
    signUp,
  })),
}));

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function req(body: unknown) {
    return new NextRequest("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const allConsents = { anthropic: true, openai: true, retune: true };

  it("creates account and returns user id", async () => {
    signUp.mockResolvedValue({ userId: "u1", emailVerificationSent: true });
    const { POST } = await import("@/app/api/auth/signup/route");

    const res = await POST(
      req({
        email: "user@example.com",
        password: "Password123",
        fullName: "Test User",
        processorConsents: allConsents,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1", emailVerificationSent: true });
    expect(signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password123",
      fullName: "Test User",
      processorConsents: allConsents,
    });
  });

  it("passes through no-user-id case", async () => {
    signUp.mockResolvedValue({ userId: undefined, emailVerificationSent: true });
    const { POST } = await import("@/app/api/auth/signup/route");

    const res = await POST(
      req({
        email: "user@example.com",
        password: "Password123",
        processorConsents: allConsents,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: undefined, emailVerificationSent: true });
  });

  it("rejects when consents are missing", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(
      req({
        email: "user@example.com",
        password: "Password123",
        processorConsents: { anthropic: true, openai: true },
      }),
    );
    expect(res.status).toBe(400);
  }, 15_000);

  it("returns 400 for invalid schema", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const res = await POST(req({ email: "not-an-email", password: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid json", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const badReq = new NextRequest("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });
});
