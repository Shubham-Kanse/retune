import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

const persistProfileAssemblyMock = vi.fn();
const findMissingCoreFieldsMock = vi.fn(() => []);
vi.mock("@/lib/profile-assembly", () => ({
  persistProfileAssembly: persistProfileAssemblyMock,
  findMissingCoreFields: findMissingCoreFieldsMock,
}));

const createResponseMock = vi.fn();
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: {
      create: createResponseMock,
    },
  })),
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

  it("persists extracted profile through ProfileAssemblyModule", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue({
      userId: "u1",
      email: "u@example.com",
      fullName: "User One",
    });

    const selectLimitMock = vi.fn().mockResolvedValue([]);
    const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
    const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
    dbMock.select.mockReturnValue({ from: selectFromMock });

    const returningMock = vi.fn().mockResolvedValue([{ id: "c1" }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    dbMock.insert.mockReturnValue({ values: valuesMock });

    createResponseMock.mockResolvedValue({
      output_text: JSON.stringify({
        fullName: "Jane Doe",
        email: "jane@example.com",
        location: "Galway",
        currentTitle: "Software Engineer",
        experienceLevel: "mid",
        targetRoles: ["Backend Engineer"],
      }),
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
    expect(persistProfileAssemblyMock).toHaveBeenCalledTimes(1);
    expect(persistProfileAssemblyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        sessionEmail: "u@example.com",
        markOnboardingCompleted: false,
      }),
    );
  });
});
