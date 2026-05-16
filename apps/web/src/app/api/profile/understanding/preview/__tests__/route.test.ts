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

const createMessageMock = vi.hoisted(() => vi.fn());
vi.mock("@retune/agent/web", () => ({
  getModels: () => ({ smart: "smart-model", fast: "fast-model", frontier: "frontier-model" }),
  getProvider: () => ({ createMessage: createMessageMock }),
}));

beforeEach(async () => {
  process.env.RETUNE_PREVIEW_SECRET = "test-secret-for-preview-1234";
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
  p.identity.location.value = "Dublin";
  p.professionalProfile.currentTitles.value = ["Senior Engineer"];
  p.professionalProfile.professionalIdentities.value = ["builder"];
  p.experience.value = [
    {
      id: "e1",
      title: "Senior Engineer",
      company: "Acme",
      responsibilities: ["Built APIs"],
      achievements: ["Cut latency 30%"],
      tools: ["TypeScript", "Postgres"],
      skills: [],
    },
  ];
  p.skills.technical.value = ["TypeScript", "Postgres"];
  p.careerIntent.interestedRoles.value = ["AI Product Engineer"];
  return p;
}

const validInitialAi = {
  summary: {
    headline: "Product-minded full-stack builder",
    narrative:
      "Retune sees you as a product-minded full-stack builder grounded in production experience.",
    confidenceLabel: "medium" as const,
    caveats: [],
    sourceRefs: [
      {
        id: "ev1",
        profilePath: "experience[0].achievements",
        source: "resume" as const,
        label: "Latency cut",
      },
    ],
    confirmed: false,
  },
  positioning: {
    selectedId: null,
    options: [
      {
        id: "p1",
        kind: "primary" as const,
        title: "AI Product Engineer",
        description: "Builds AI workflow products end to end.",
        bestFor: ["AI SaaS"],
        emphasize: [],
        deEmphasize: [],
        risks: [],
        evidenceRefs: [],
        userDecision: "undecided" as const,
      },
    ],
  },
  evidenceMap: {
    strongestSignals: [],
    supportingSignals: [],
    weakSignals: [],
    inferredUnconfirmed: [],
  },
  resumeFuel: { ready: [], needsSharpening: [], risks: [], suggestedNextEdits: [] },
};

function buildReq(body: unknown) {
  return new NextRequest("http://localhost/api/profile/understanding/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile/understanding/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(null);
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(buildReq({ section: "summary", scope: "summary", instruction: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(buildReq({ section: "x" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when profile does not exist", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([]);
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(
      buildReq({ section: "summary", scope: "summary", instruction: "More technical please." }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when profile JSON is invalid", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: { not: "valid" },
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
      },
    ]);
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(
      buildReq({ section: "summary", scope: "summary", instruction: "More technical please." }),
    );
    expect(res.status).toBe(422);
  });

  it("returns 409 when expectedProfileFingerprint mismatches", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: richProfile(),
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
      },
    ]);
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(
      buildReq({
        section: "summary",
        scope: "summary",
        instruction: "More technical please.",
        expectedProfileFingerprint: "definitely-wrong",
      }),
    );
    expect(res.status).toBe(409);
  });

  it("issues a preview token for an initial generation when there is no current understanding", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: richProfile(),
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
      },
    ]);
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(validInitialAi) }],
      stopReason: "end_turn",
    });
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(
      buildReq({
        section: "summary",
        scope: "summary",
        instruction: "Build the first read.",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.previewToken).toBeTypeOf("string");
    expect(data.kind).toBe("initial");
    expect(data.profileFingerprint).toBeTypeOf("string");
    expect(data.expiresAt).toBeTypeOf("string");
  });

  it("returns 502 when AI returns invalid JSON", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: richProfile(),
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
      },
    ]);
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
      stopReason: "end_turn",
    });
    const { POST } = await import("@/app/api/profile/understanding/preview/route");
    const res = await POST(
      buildReq({
        section: "summary",
        scope: "summary",
        instruction: "Build the first read.",
      }),
    );
    expect(res.status).toBe(502);
  });

  it("rate-limits per user", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    dbSelectMock.mockResolvedValue([
      {
        careerProfile: richProfile(),
        careerUnderstanding: null,
        careerUnderstandingRevision: 0,
      },
    ]);
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(validInitialAi) }],
      stopReason: "end_turn",
    });
    const { POST } = await import("@/app/api/profile/understanding/preview/route");

    // Drain the bucket by hitting many times.
    for (let i = 0; i < 20; i++) {
      const res = await POST(
        buildReq({ section: "summary", scope: "summary", instruction: `try ${i}` }),
      );
      expect(res.status).toBe(200);
    }
    const blocked = await POST(
      buildReq({ section: "summary", scope: "summary", instruction: "blocked" }),
    );
    expect(blocked.status).toBe(429);
  });
});
