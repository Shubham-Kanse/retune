import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
}));

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

describe("POST /api/profile/enhance-section", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const req = new NextRequest("http://localhost/api/profile/enhance-section", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 413 when request body is too large", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
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
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
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
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
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
