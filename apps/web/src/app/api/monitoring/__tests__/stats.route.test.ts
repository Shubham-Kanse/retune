import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getApiSession: vi.fn(),
}));

// Mock the safe browser entry (technical-2.0 §12.3).
vi.mock("@retune/agent/web", () => ({
  getAgentExecutionStats: vi.fn(),
}));

describe("GET /api/monitoring/stats", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/monitoring/stats/route");

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns metrics shape for authenticated user", async () => {
    const { getApiSession } = await import("@/lib/session");
    const { getAgentExecutionStats } = await import("@retune/agent/web");
    vi.mocked(getApiSession).mockResolvedValue({ userId: "u1", email: "u@x.com", fullName: "User" });
    vi.mocked(getAgentExecutionStats).mockReturnValue({
      requestMetrics: {
        totalRequests: 10,
        successfulRequests: 9,
        failedRequests: 1,
        retries: 2,
        avgLatencyMs: 500,
        p95LatencyMs: 900,
        p99LatencyMs: 1200,
        errorsByType: { timeout: 1 },
      },
      successRate: 90,
      circuitBreakerState: "CLOSED",
    } as never);

    const { GET } = await import("@/app/api/monitoring/stats/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.metrics.totalRequests).toBe(10);
    expect(json.metrics.circuitBreakerStatus).toBe("CLOSED");
    expect(json.metrics.successRate).toBe("90.00%");
  });

  it("returns 500 when agent stats retrieval throws", async () => {
    const { getApiSession } = await import("@/lib/session");
    const { getAgentExecutionStats } = await import("@retune/agent/web");
    vi.mocked(getApiSession).mockResolvedValue({ userId: "u1", email: "u@x.com", fullName: "User" });
    vi.mocked(getAgentExecutionStats).mockImplementation(() => {
      throw new Error("stats unavailable");
    });

    const { GET } = await import("@/app/api/monitoring/stats/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
