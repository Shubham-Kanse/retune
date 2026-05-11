import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn();

vi.mock("@/lib/identity", () => ({
  createIdentityModule: vi.fn(() => ({
    signOut,
  })),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  function req() {
    return new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
  }

  it("returns ok on successful sign out", async () => {
    signOut.mockResolvedValue({ ok: true });
    const { POST } = await import("@/app/api/auth/logout/route");

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 503 on infrastructure errors", async () => {
    signOut.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND db.example.com"), { code: "ENOTFOUND" }),
    );
    const { POST } = await import("@/app/api/auth/logout/route");

    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
  });
});
