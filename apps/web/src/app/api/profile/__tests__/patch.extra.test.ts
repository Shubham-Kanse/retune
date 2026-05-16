import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getApiSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));

const revalidateMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }));

const persistProfileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/profile-domain/repositories/profile-repository", () => ({
  persistProfile: persistProfileMock,
}));

vi.mock("@retune/db", () => ({
  db: {},
  profiles: { userId: "user_id" },
}));

function session() {
  return { userId: "u1", email: "u@x.com", fullName: "User One" };
}

function buildReq(body: unknown) {
  return new NextRequest("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/profile - additional coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    persistProfileMock.mockResolvedValue({ completenessScore: 80 });
  });

  it("persists normalized profile data and returns completeness score", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ fullName: "Jane Doe", location: "Dublin" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, completenessScore: 80 });
    expect(persistProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        sessionEmail: "u@x.com",
        sessionFullName: "User One",
        markOnboardingCompleted: true,
        profile: expect.objectContaining({ fullName: "Jane Doe", location: "Dublin" }),
      }),
    );
  });

  it("delegates markdown rebuilding to the repository when markdown is not provided", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ fullName: "Jane Doe", targetRoles: ["Engineer"] }));
    expect(res.status).toBe(200);
    expect(persistProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ fullName: "Jane Doe", targetRoles: ["Engineer"] }),
        profileMarkdownOverride: undefined,
      }),
    );
  });

  it("uses provided profileMarkdown when supplied", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ profileMarkdown: "# Custom Markdown" }));
    expect(res.status).toBe(200);
    expect(persistProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ profileMarkdownOverride: "# Custom Markdown" }),
    );
  });

  it("accepts nullable optional fields (phone, linkedin, voiceNotes)", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ phone: null, linkedin: null, voiceNotes: null }));
    expect(res.status).toBe(200);
  });

  it("passes normalized array fields to the repository", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    await PATCH(
      buildReq({
        targetRoles: ["Engineer", "Analyst"],
        skillsTier1: [{ name: "TypeScript", evidence: "daily" }],
      }),
    );

    expect(persistProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          targetRoles: ["Engineer", "Analyst"],
          skillsTier1: [expect.objectContaining({ name: "TypeScript" })],
        }),
      }),
    );
  });

  it("returns 400 for invalid JSON body", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const req = new NextRequest("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("strips unknown extra fields silently (Zod 4 default behavior)", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ unknownField: "should be stripped" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 when fullName exceeds max length", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ fullName: "A".repeat(101) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when experience array exceeds max items", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      company: `Co${i}`,
      title: "Engineer",
    }));
    const res = await PATCH(buildReq({ experience: tooMany }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when skillsTier1 exceeds max items", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `Skill${i}`, evidence: "x" }));
    const res = await PATCH(buildReq({ skillsTier1: tooMany }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid experienceLevel enum", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ experienceLevel: "expert" }));
    // "expert" is not in ["entry","early","mid","senior","staff"]
    expect(res.status).toBe(400);
  });
});
