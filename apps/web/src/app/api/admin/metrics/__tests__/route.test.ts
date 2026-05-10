import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/performance", () => ({
  perf: {
    getAverageTime: vi.fn(() => 123),
    getMetrics: vi.fn(() => [{ duration: 500 }, { duration: 1200 }]),
  },
}));

vi.mock("@/lib/analytics", () => ({
  analytics: {
    getEvents: vi.fn(() => [{ userId: "u1" }, { userId: "u2" }, { userId: "u1" }]),
    getEventCounts: vi.fn(() => ({ a: 2, b: 1 })),
  },
}));

vi.mock("@/lib/error-tracker", () => ({
  errorTracker: {
    getErrors: vi.fn((limit?: number) =>
      limit ? [{ message: "e1" }] : [{ message: "e1" }, { message: "e2" }],
    ),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: {},
}));

describe("GET /api/admin/metrics", () => {
  const originalAdminSecret = process.env.ADMIN_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = originalAdminSecret;
  });

  it("returns 403 when admin endpoint is disabled", async () => {
    delete process.env.ADMIN_SECRET;
    const { GET } = await import("@/app/api/admin/metrics/route");

    const req = new NextRequest("http://localhost/api/admin/metrics");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when token is invalid", async () => {
    process.env.ADMIN_SECRET = "secret";
    const { GET } = await import("@/app/api/admin/metrics/route");

    const req = new NextRequest("http://localhost/api/admin/metrics", {
      headers: { authorization: "Bearer wrong" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns metrics when token is valid", async () => {
    process.env.ADMIN_SECRET = "secret";
    const { GET } = await import("@/app/api/admin/metrics/route");

    const req = new NextRequest("http://localhost/api/admin/metrics", {
      headers: { authorization: "Bearer secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.performance.totalRequests).toBe(2);
    expect(json.analytics.uniqueUsers).toBe(2);
    expect(json.errors.totalErrors).toBe(2);
    expect(json.system).toHaveProperty("uptime");
  });
});
