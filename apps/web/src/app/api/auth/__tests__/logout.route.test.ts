import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 without session", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 on cross-origin request", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "x@y.com", fullName: "X Y" });
    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.com", host: "localhost" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("clears cookie on valid logout", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({ userId: "u1", email: "x@y.com", fullName: "X Y" });
    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost", host: "localhost" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("session=");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
