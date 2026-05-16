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
  process.env.RETUNE_PREVIEW_SECRET = "test-secret-for-apply-1234";
  vi.resetModules();
  vi.clearAllMocks();
  const { _resetUserRateLimit } = await import("@/lib/career-understanding/rate-limit");
  _resetUserRateLimit();
});

function session() {
  return { userId: "u1", email: "u@x.com", fullName: "User One", expiresAt: 0 };
}

function richProfile() {
  const p = createEmptyProfile("u1");
  p.identity.fullName.value = "Jane Doe";
  p.experience.value = [
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
  p.skills.technical.value = ["TypeScript"];
  return p;
}

const summaryPatch = {
  section: "summary" as const,
  summary: {
    headline: "New headline",
    narrative: "New narrative content for the apply test.",
    confidenceLabel: "medium" as const,
    caveats: [],
    sourceRefs: [],
    confirmed: false,
  },
};

function buildReq(body: unknown) {
  return new NextRequest("http://localhost/api/profile/understanding/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile/understanding/apply", () => {
  it("returns 400 for invalid token", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { POST } = await import("@/app/api/profile/understanding/apply/route");
    const res = await POST(buildReq({ previewId: "pv-1", previewToken: "garbage-token" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when token user does not match session", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { issuePreviewToken } = await import("@/lib/career-understanding/preview-token");
    const issued = await issuePreviewToken({
      previewId: "pv-1",
      userId: "different-user",
      profileFingerprint: "fp",
      understandingRevision: 0,
      patch: summaryPatch,
      changeSummary: [],
    });
    const { POST } = await import("@/app/api/profile/understanding/apply/route");
    const res = await POST(buildReq({ previewId: "pv-1", previewToken: issued.token }));
    expect(res.status).toBe(401);
  });

  it("returns 409 on stale profile fingerprint", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { issuePreviewToken } = await import("@/lib/career-understanding/preview-token");
    const issued = await issuePreviewToken({
      previewId: "pv-2",
      userId: "u1",
      profileFingerprint: "stale-fp",
      understandingRevision: 0,
      patch: summaryPatch,
      changeSummary: [],
    });
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: richProfile(),
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
      },
    ]);
    const { POST } = await import("@/app/api/profile/understanding/apply/route");
    const res = await POST(buildReq({ previewId: "pv-2", previewToken: issued.token }));
    expect(res.status).toBe(409);
  });

  it("applies the patch and returns the new understanding on success", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = richProfile();
    const { issuePreviewToken } =
      await import("@/lib/career-understanding/preview-token");
    const { careerProfileFingerprint } = await import("@/lib/career-understanding/fingerprint");
    const { buildPlaceholderUnderstanding } = await import("@/lib/career-understanding/service");
    const fp = careerProfileFingerprint(profile);
    const placeholder = buildPlaceholderUnderstanding({ userId: "u1", profile });
    placeholder.revision = 0;
    placeholder.id = "cu-existing";
    const issued = await issuePreviewToken({
      previewId: "pv-3",
      userId: "u1",
      profileFingerprint: fp,
      understandingRevision: 0,
      patch: summaryPatch,
      changeSummary: ["Updated headline"],
    });
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerUnderstanding: placeholder,
        careerUnderstandingRevision: 0,
      },
    ]);
    persistMock.mockResolvedValue({ revision: 1 });
    const { POST } = await import("@/app/api/profile/understanding/apply/route");
    const res = await POST(buildReq({ previewId: "pv-3", previewToken: issued.token }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.understanding.summary.headline).toBe("New headline");
    expect(data.understanding.revision).toBe(1);
  });

  it("returns 409 when persist returns StaleRevisionError", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const profile = richProfile();
    const { issuePreviewToken } =
      await import("@/lib/career-understanding/preview-token");
    const { careerProfileFingerprint } = await import("@/lib/career-understanding/fingerprint");
    const { buildPlaceholderUnderstanding } = await import("@/lib/career-understanding/service");
    const fp = careerProfileFingerprint(profile);
    const placeholder = buildPlaceholderUnderstanding({ userId: "u1", profile });
    placeholder.id = "cu-existing";
    const issued = await issuePreviewToken({
      previewId: "pv-4",
      userId: "u1",
      profileFingerprint: fp,
      understandingRevision: 0,
      patch: summaryPatch,
      changeSummary: ["Updated headline"],
    });
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: profile,
        careerUnderstanding: placeholder,
        careerUnderstandingRevision: 0,
      },
    ]);
    const { StaleRevisionError } = await import("@/lib/career-understanding/repository");
    persistMock.mockRejectedValue(new StaleRevisionError());
    const { POST } = await import("@/app/api/profile/understanding/apply/route");
    const res = await POST(buildReq({ previewId: "pv-4", previewToken: issued.token }));
    expect(res.status).toBe(409);
  });
});
