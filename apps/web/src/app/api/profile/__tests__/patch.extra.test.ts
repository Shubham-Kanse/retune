import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));

const revalidateMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }));

const dbMock = { insert: vi.fn(), transaction: vi.fn((fn: () => unknown) => fn()) };
vi.mock("@retune/db", () => ({
  db: dbMock,
  profiles: { userId: "user_id" },
  computeCompletenessScore: vi.fn(() => 80),
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

describe("PATCH /api/profile — additional coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbMock.transaction.mockImplementation((fn: () => unknown) => fn());
    const run = vi.fn();
    const onConflictDoUpdate = vi.fn().mockReturnValue({ run });
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    dbMock.insert.mockReturnValue({ values });
  });

  it("computes and stores completeness score", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { computeCompletenessScore } = await import("@retune/db");
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ fullName: "Jane Doe", location: "Dublin" }));
    expect(res.status).toBe(200);
    expect(computeCompletenessScore).toHaveBeenCalled();
  });

  it("rebuilds profileMarkdown when not provided", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ fullName: "Jane Doe", targetRoles: ["Engineer"] }));
    expect(res.status).toBe(200);
    // insert was called with a profileMarkdown that includes the name
    const insertCall = vi.mocked(dbMock.insert().values).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(String(insertCall?.profileMarkdown ?? "")).toContain("Jane Doe");
  });

  it("uses provided profileMarkdown when supplied", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ profileMarkdown: "# Custom Markdown" }));
    expect(res.status).toBe(200);
    const insertCall = vi.mocked(dbMock.insert().values).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(insertCall?.profileMarkdown).toBe("# Custom Markdown");
  });

  it("accepts nullable optional fields (phone, linkedin, voiceNotes)", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ phone: null, linkedin: null, voiceNotes: null }));
    expect(res.status).toBe(200);
  });

  it("serializes arrays to JSON strings", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    await PATCH(
      buildReq({
        targetRoles: ["Engineer", "Analyst"],
        skillsTier1: [{ name: "TypeScript", evidence: "daily" }],
      }),
    );

    const insertCall = vi.mocked(dbMock.insert().values).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(typeof insertCall?.targetRoles).toBe("string");
    expect(JSON.parse(insertCall?.targetRoles as string)).toEqual(["Engineer", "Analyst"]);
    expect(typeof insertCall?.skillsTier1).toBe("string");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
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
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ unknownField: "should be stripped" }));
    expect(res.status).toBe(200);
  });

  it("returns 400 when fullName exceeds max length", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ fullName: "A".repeat(101) }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when experience array exceeds max items", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      company: `Co${i}`,
      title: "Engineer",
    }));
    const res = await PATCH(buildReq({ experience: tooMany }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when skillsTier1 exceeds max items", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `Skill${i}`, evidence: "x" }));
    const res = await PATCH(buildReq({ skillsTier1: tooMany }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid experienceLevel enum", async () => {
    const { getSession } = await import("@/lib/session");
    vi.mocked(getSession).mockResolvedValue(session());
    const { PATCH } = await import("@/app/api/profile/route");

    const res = await PATCH(buildReq({ experienceLevel: "expert" }));
    // "expert" is not in ["entry","early","mid","senior","staff"]
    expect(res.status).toBe(400);
  });
});
