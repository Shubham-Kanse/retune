import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("@retune/db", () => ({
  db: dbMock,
  onboardingConversations: {},
}));

describe("POST /api/onboarding/upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/onboarding/upload/route");

    const form = new FormData();
    const req = { formData: vi.fn().mockResolvedValue(form) } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is provided", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/onboarding/upload/route");

    const form = new FormData();
    const req = { formData: vi.fn().mockResolvedValue(form) } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported extension", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/onboarding/upload/route");

    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "resume.txt", { type: "text/plain" }),
    );
    const req = { formData: vi.fn().mockResolvedValue(form) } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when extension and file signature mismatch", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });
    const { POST } = await import("@/app/api/onboarding/upload/route");

    const badPdfFile = {
      name: "resume.pdf",
      size: 4,
      arrayBuffer: async () => new Uint8Array([0x01, 0x02, 0x03, 0x04]).buffer,
    };
    const req = {
      formData: vi.fn().mockResolvedValue(new Map([["file", badPdfFile]])),
    } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
