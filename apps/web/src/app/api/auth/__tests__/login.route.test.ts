import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();

vi.mock("@/lib/identity", () => ({
  createIdentityModule: vi.fn(() => ({
    signIn,
  })),
}));

describe("POST /api/auth/login", () => {
  function req(body: unknown) {
    return new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns user id and onboarding flag on valid credentials", async () => {
    signIn.mockResolvedValue({ userId: "u1", onboardingCompleted: true });
    const { POST } = await import("@/app/api/auth/login/route");

    const res = await POST(req({ email: "u@example.com", password: "secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ userId: "u1", onboardingCompleted: true });
    expect(signIn).toHaveBeenCalledWith({ email: "u@example.com", password: "secret" });
  });

  it("returns 400 for invalid json", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const badReq = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("returns 400 for identity module auth failure", async () => {
    const { ValidationError } = await import("@/lib/errors");
    signIn.mockRejectedValue(new ValidationError("Invalid email or password"));
    const { POST } = await import("@/app/api/auth/login/route");

    const res = await POST(req({ email: "u.com", password: "wrong" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid input schema", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(req({ email: "not-an-email", password: "" }));
    expect(res.status).toBe(400);
  });
});
