import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getApiSession: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true })),
}));

vi.mock("@/lib/profile-domain/services/resume-import-orchestrator", () => ({
  importResumeAndPersist: vi.fn(),
}));

vi.mock("@retune/db", () => ({
  db: {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    get: vi.fn(),
    insert: vi.fn(),
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
    run: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
  },
  profiles: {},
  users: {},
}));

describe("POST /api/profile/import-resume", () => {
  function buildMultipartRequest(file: unknown): Request {
    return {
      method: "POST",
      headers: {
        get: (_name: string) => null,
      },
      formData: vi.fn().mockResolvedValue(new Map([["file", file]])),
    } as unknown as Request;
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/profile/import-resume/route");

    const req = new NextRequest("http://localhost/api/profile/import-resume", {
      method: "POST",
      body: new FormData(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when file is missing", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/profile/import-resume/route");

    const req = buildMultipartRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when file is too large", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/profile/import-resume/route");

    const oversized = { name: "resume.pdf", size: 11 * 1024 * 1024 };
    const req = buildMultipartRequest(oversized);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported extension", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/profile/import-resume/route");

    const invalid = { name: "resume.txt", size: 1234 };
    const req = buildMultipartRequest(invalid);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
