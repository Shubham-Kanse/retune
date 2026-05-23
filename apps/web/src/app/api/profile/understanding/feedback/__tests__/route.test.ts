import { createEmptyProfile } from "@/lib/onboarding/session-store";
// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getApiSession: vi.fn() }));
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

const persistMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/career-understanding/repository", () => ({
  persistCareerUnderstanding: persistMock,
  StaleRevisionError: class extends Error {
    constructor() {
      super("stale");
      this.name = "StaleRevisionError";
    }
  },
  getCareerUnderstandingByUserId: vi.fn(),
  markCareerUnderstandingStale: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  const { _resetUserRateLimit } = await import("@/lib/career-understanding/rate-limit");
  _resetUserRateLimit();
  persistMock.mockResolvedValue({ revision: 1 });
});

function session() {
  return { userId: "u1", email: "u@x.com", fullName: "User One", expiresAt: 0 };
}

function placeholderUnderstanding() {
  const profile = createEmptyProfile("u1");
  profile.identity.fullName.value = "Jane";
  profile.experience.value = [
    {
      id: "e1",
      title: "Engineer",
      company: "Acme",
      responsibilities: [],
      achievements: [],
      tools: [],
      skills: [],
    },
  ];
  profile.skills.technical.value = ["TypeScript"];
  return profile;
}

function buildReq(body: unknown) {
  return new NextRequest("http://localhost/api/profile/understanding/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile/understanding/feedback", () => {
  it("returns 401 when unauthenticated", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/profile/understanding/feedback/route");
    const res = await POST(buildReq({ kind: "summary_feedback", value: "accurate" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for unknown kind", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { POST } = await import("@/app/api/profile/understanding/feedback/route");
    const res = await POST(buildReq({ kind: "unknown" }));
    expect(res.status).toBe(400);
  });

  it("records summary feedback when understanding exists", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = placeholderUnderstanding();
    const { buildPlaceholderUnderstanding } = await import("@/lib/career-understanding/service");
    const understanding = buildPlaceholderUnderstanding({ userId: "u1", profile });
    understanding.id = "cu-1";
    understanding.revision = 1;
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerUnderstanding: understanding,
        careerUnderstandingRevision: 1,
      },
    ]);
    const { POST } = await import("@/app/api/profile/understanding/feedback/route");
    const res = await POST(buildReq({ kind: "summary_feedback", value: "accurate" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.understanding.userFeedback.summary).toBe("accurate");
    expect(data.understanding.summary.confirmed).toBe(true);
    expect(data.understanding.revision).toBe(2);
  });

  it("rejects unknown positioning ids", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = placeholderUnderstanding();
    const { buildPlaceholderUnderstanding } = await import("@/lib/career-understanding/service");
    const understanding = buildPlaceholderUnderstanding({ userId: "u1", profile });
    understanding.id = "cu-1";
    understanding.revision = 1;
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerUnderstanding: understanding,
        careerUnderstandingRevision: 1,
      },
    ]);
    const { POST } = await import("@/app/api/profile/understanding/feedback/route");
    const res = await POST(buildReq({ kind: "select_positioning", positioningId: "p-not-real" }));
    expect(res.status).toBe(400);
  });

  it("selects an existing positioning option", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = placeholderUnderstanding();
    const { buildPlaceholderUnderstanding } = await import("@/lib/career-understanding/service");
    const understanding = buildPlaceholderUnderstanding({ userId: "u1", profile });
    understanding.id = "cu-1";
    understanding.revision = 1;
    understanding.positioning.options = [
      {
        id: "p1",
        kind: "primary",
        title: "Builder",
        description: "Description",
        bestFor: [],
        emphasize: [],
        deEmphasize: [],
        risks: [],
        evidenceRefs: [],
        userDecision: "undecided",
      },
    ];
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerUnderstanding: understanding,
        careerUnderstandingRevision: 1,
      },
    ]);
    const { POST } = await import("@/app/api/profile/understanding/feedback/route");
    const res = await POST(buildReq({ kind: "select_positioning", positioningId: "p1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.understanding.positioning.selectedId).toBe("p1");
    expect(data.understanding.positioning.options[0].userDecision).toBe("accepted");
    expect(data.understanding.userFeedback.preferredPositioningIds).toContain("p1");
  });
});
