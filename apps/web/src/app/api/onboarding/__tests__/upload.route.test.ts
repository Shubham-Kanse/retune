import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

const importResumeAndPersistMock = vi.fn();
vi.mock("@/lib/profile-domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/profile-domain")>();
  return {
    ...actual,
    importResumeAndPersist: importResumeAndPersistMock,
  };
});

describe("POST /api/onboarding/upload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    importResumeAndPersistMock.mockImplementation(async ({ file }) => {
      const name = (file as File).name.toLowerCase();
      if (!name.endsWith(".pdf") && !name.endsWith(".docx")) {
        const { ResumeFileValidationError } = await import("@/lib/profile-domain");
        throw new ResumeFileValidationError("Only PDF and DOCX files are supported.", 400);
      }
      const bytes = new Uint8Array(await (file as File).arrayBuffer());
      const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
      if (name.endsWith(".pdf") && !isPdf) {
        const { ResumeFileValidationError } = await import("@/lib/profile-domain");
        throw new ResumeFileValidationError("File does not appear to be a valid PDF.", 400);
      }
      return {
        extracted: { fullName: "Jane Doe", email: "jane@example.com", targetRoles: [] },
        missingQuestions: [],
        completenessScore: 80,
        ingestionId: "ing-1",
      };
    });
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

    const badFile = {
      name: "resume.txt",
      size: 5,
      arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
    };
    const req = {
      formData: vi.fn().mockResolvedValue(new Map([["file", badFile]])),
    } as unknown as Request;
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

  it("imports and persists extracted profile through profile-domain orchestrator", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });

    importResumeAndPersistMock.mockResolvedValue({
      extracted: {
        fullName: "Jane Doe",
        email: "jane@example.com",
        location: "Galway",
        currentTitle: "Software Engineer",
        experienceLevel: "mid",
        targetRoles: ["Backend Engineer"],
      },
      missingQuestions: [],
      completenessScore: 80,
      ingestionId: "ing-1",
    });

    const { POST } = await import("@/app/api/onboarding/upload/route");

    const goodPdfFile = {
      name: "resume.pdf",
      size: 5,
      arrayBuffer: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
    };
    const req = {
      formData: vi.fn().mockResolvedValue(new Map([["file", goodPdfFile]])),
    } as unknown as Request;
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(importResumeAndPersistMock).toHaveBeenCalledTimes(1);
    expect(importResumeAndPersistMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "onboarding_upload",
        session: expect.objectContaining({
          userId: "u1",
          email: "u@example.com",
        }),
        markOnboardingCompleted: false,
      }),
    );
  });
});
