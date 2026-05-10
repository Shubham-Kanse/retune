import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
}));

describe("middleware session protection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects to login when session cookie is missing", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const { middleware } = await import("./middleware");
    const req = new NextRequest("http://localhost/dashboard");
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("rejects tampered session cookie", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const { jwtVerify } = await import("jose");
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("invalid token"));
    const { middleware } = await import("./middleware");

    const req = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "session=tampered.token.value" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("rejects expired session cookie", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const { jwtVerify } = await import("jose");
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("jwt expired"));
    const { middleware } = await import("./middleware");

    const req = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "session=expired.jwt.token" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("allows protected routes with a valid non-expired session across route changes", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const { jwtVerify } = await import("jose");
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { userId: "u1" } } as never);
    const { middleware } = await import("./middleware");

    const dashboardReq = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "session=valid.jwt.token" },
    });
    const dashboardRes = await middleware(dashboardReq);
    expect(dashboardRes.status).toBe(200);
    expect(dashboardRes.headers.get("location")).toBeNull();

    const settingsReq = new NextRequest("http://localhost/settings", {
      headers: { cookie: "session=valid.jwt.token" },
    });
    const settingsRes = await middleware(settingsReq);
    expect(settingsRes.status).toBe(200);
    expect(settingsRes.headers.get("location")).toBeNull();
  });

  it("allows crawler files without requiring session", async () => {
    process.env.JWT_SECRET = "12345678901234567890123456789012";
    const { middleware } = await import("./middleware");

    const robotsReq = new NextRequest("http://localhost/robots.txt");
    const robotsRes = await middleware(robotsReq);
    expect(robotsRes.status).toBe(200);
    expect(robotsRes.headers.get("location")).toBeNull();

    const sitemapReq = new NextRequest("http://localhost/sitemap.xml");
    const sitemapRes = await middleware(sitemapReq);
    expect(sitemapRes.status).toBe(200);
    expect(sitemapRes.headers.get("location")).toBeNull();
  });
});
