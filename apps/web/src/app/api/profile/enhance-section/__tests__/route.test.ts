import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getApiSession: vi.fn(),
}));

vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    // Stub IP-level rate limiting in tests so unrelated traffic doesn't 429.
    // userRateLimit + _resetRateLimitForTests use the real implementation
    // so per-user rate-limit tests still exercise the real bucket.
    rateLimit: vi.fn(() => ({ success: true, remaining: 100 })),
    authRateLimit: vi.fn(() => ({ success: true })),
  };
});

const createMock = vi.hoisted(() => vi.fn());
vi.mock("@retune/agent/web", () => ({
  getModels: () => ({ fast: "test-fast-model" }),
  getProvider: () => ({ createMessage: createMock }),
}));

describe("POST /api/profile/enhance-section", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const req = new NextRequest("http://localhost/api/profile/enhance-section", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 413 when request body is too large", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const req = new NextRequest("http://localhost/api/profile/enhance-section", {
      method: "POST",
      headers: { "content-length": "100001", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("returns 400 for invalid request payload", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const req = new NextRequest("http://localhost/api/profile/enhance-section", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section: "invalid", intent: "bad", profile: {} }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 502 when AI response is not valid JSON", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    createMock.mockResolvedValue({
      content: [{ type: "text", text: "not-json-response" }],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const req = new NextRequest("http://localhost/api/profile/enhance-section", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        section: "summary",
        intent: "make_recruiter_ready",
        profile: { voiceNotes: "x" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });
});
