import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveSessionStateFromRequest = vi.fn();

vi.mock("@/lib/identity-edge", () => ({
  resolveSessionStateFromRequest,
}));

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("allows public paths without auth and sets security headers", async () => {
    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost/login");

    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(resolveSessionStateFromRequest).not.toHaveBeenCalled();
  });

  it("redirects protected path to /login when session is missing", async () => {
    resolveSessionStateFromRequest.mockResolvedValue({
      response: NextResponse.next(),
      session: null,
    });
    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost/dashboard");

    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("passes through protected path when session exists", async () => {
    const passthrough = NextResponse.next();
    resolveSessionStateFromRequest.mockResolvedValue({
      response: passthrough,
      session: {
        userId: "u1",
        email: "u1@example.com",
        fullName: "U1",
        expiresAt: 0,
      },
    });
    const { middleware } = await import("@/middleware");
    const req = new NextRequest("http://localhost/dashboard");

    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(resolveSessionStateFromRequest).toHaveBeenCalledTimes(1);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
