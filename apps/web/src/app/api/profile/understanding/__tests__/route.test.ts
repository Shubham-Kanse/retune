import { CAREER_UNDERSTANDING_VERSION } from "@/lib/career-understanding";
import { createEmptyProfile } from "@/lib/onboarding/session-store";
// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getApiSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));

const dbSelectMock = vi.hoisted(() => vi.fn());
vi.mock("@retune/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: dbSelectMock,
        }),
      }),
    }),
  },
  profiles: { userId: "user_id" },
}));

function session() {
  return { userId: "u1", email: "u@x.com", fullName: "User One", expiresAt: 0 };
}

function buildReq() {
  return new NextRequest("http://localhost/api/profile/understanding", { method: "GET" });
}

describe("GET /api/profile/understanding", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/profile/understanding/route");
    const res = await GET(buildReq());
    expect(res.status).toBe(401);
  });

  it("returns nulls when no profile exists", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([]);

    const { GET } = await import("@/app/api/profile/understanding/route");
    const res = await GET(buildReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.careerProfile).toBeNull();
    expect(data.canGenerateUnderstanding).toBe(false);
    expect(data.missing).toContain("profile");
  });

  it("returns profile + understanding fields when present", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane Doe";
    profile.experience.value = [
      {
        id: "e1",
        title: "Senior Engineer",
        company: "Acme",
        responsibilities: [],
        achievements: [],
        tools: ["TypeScript"],
        skills: [],
      },
    ];
    profile.skills.technical.value = ["TypeScript"];
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerProfileVersion: profile.schemaVersion,
        profileReadiness: null,
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
        careerUnderstandingStaleSince: null,
        careerUnderstandingUpdatedAt: null,
      },
    ]);

    const { GET } = await import("@/app/api/profile/understanding/route");
    const res = await GET(buildReq());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.careerProfile?.identity.fullName.value).toBe("Jane Doe");
    expect(data.profileFingerprint).toBeTypeOf("string");
    expect(data.canGenerateUnderstanding).toBe(true);
    expect(data.understanding).toBeTruthy();
    expect(data.understanding.schemaVersion).toBe(CAREER_UNDERSTANDING_VERSION);
    expect(data.understandingPersisted).toBe(false);
    expect(data.stale).toBe(false);
  });

  it("reports canGenerateUnderstanding=false when profile lacks experience and skills", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane Doe";
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerProfileVersion: profile.schemaVersion,
        profileReadiness: null,
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
        careerUnderstandingStaleSince: null,
        careerUnderstandingUpdatedAt: null,
      },
    ]);

    const { GET } = await import("@/app/api/profile/understanding/route");
    const res = await GET(buildReq());
    const data = await res.json();
    expect(data.canGenerateUnderstanding).toBe(false);
  });
});
