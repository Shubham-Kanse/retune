import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getApiSession: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));

const createMock = vi.hoisted(() => vi.fn());
vi.mock("@retune/agent/web", () => ({
  getModels: () => ({ fast: "test-fast-model" }),
  getProvider: () => ({ createMessage: createMock }),
}));

function session() {
  return { userId: "u1", email: "u@x.com", fullName: "User One" };
}

function buildReq(body: unknown, contentLength?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (contentLength) headers["content-length"] = contentLength;
  return new NextRequest("http://localhost/api/profile/enhance-section", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validProfile = { voiceNotes: "I build things", experience: [], projects: [] };

describe("POST /api/profile/enhance-section — additional coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 for invalid intent name", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const res = await POST(
      buildReq({ section: "summary", intent: "bad_intent", profile: validProfile }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when profile payload is missing", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const res = await POST(buildReq({ section: "summary", intent: "make_recruiter_ready" }));
    expect(res.status).toBe(400);
  });

  it("returns patch for summary section", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"voiceNotes":"Improved summary text."}' }],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const res = await POST(
      buildReq({ section: "summary", intent: "make_recruiter_ready", profile: validProfile }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.patch).toHaveProperty("voiceNotes");
  });

  it("returns patch for experience section", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"experience":[{"company":"Acme","title":"Engineer","description":"Built APIs."}]}',
        },
      ],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const profile = {
      ...validProfile,
      experience: [{ company: "Acme", title: "Engineer", description: "Built APIs." }],
    };
    const res = await POST(
      buildReq({ section: "experience", intent: "strengthen_bullets", profile }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.patch).toHaveProperty("experience");
  });

  it("returns patch for projects section", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    createMock.mockResolvedValue({
      content: [
        { type: "text", text: '{"projects":[{"name":"MyApp","description":"A cool app."}]}' },
      ],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const profile = {
      ...validProfile,
      projects: [{ name: "MyApp", description: "Existing project." }],
    };
    const res = await POST(
      buildReq({ section: "projects", intent: "align_to_target_roles", profile }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.patch).toHaveProperty("projects");
  });

  it("returns 502 when AI patch fails schema validation", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    // voiceNotes must be a string, not a number
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"voiceNotes":12345}' }],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const res = await POST(
      buildReq({ section: "summary", intent: "make_recruiter_ready", profile: validProfile }),
    );
    expect(res.status).toBe(502);
  });

  it("ignores fields outside the selected section", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    // AI returns both voiceNotes (correct for summary) and experience (wrong section)
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"voiceNotes":"Good summary.","experience":[{"company":"Acme","title":"Eng"}]}',
        },
      ],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const res = await POST(
      buildReq({ section: "summary", intent: "make_recruiter_ready", profile: validProfile }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // Only voiceNotes should be in the patch, not experience
    expect(json.patch).toHaveProperty("voiceNotes");
    expect(json.patch).not.toHaveProperty("experience");
  });

  it("returns 502 when AI returns no patch for the section", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    // AI returns a field that doesn't belong to summary section
    createMock.mockResolvedValue({
      content: [{ type: "text", text: '{"education":[]}' }],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const res = await POST(
      buildReq({ section: "summary", intent: "make_recruiter_ready", profile: validProfile }),
    );
    expect(res.status).toBe(502);
  });

  it("rejects experience patch that introduces unknown company/title entities", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"experience":[{"company":"FakeCorp","title":"Principal Engineer","description":"Did everything."}]}',
        },
      ],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const profile = {
      experience: [{ company: "Acme", title: "Engineer", description: "Built APIs." }],
      projects: [],
      voiceNotes: "",
    };
    const res = await POST(
      buildReq({ section: "experience", intent: "strengthen_bullets", profile }),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toMatch(/unsupported entities/i);
  });

  it("allows experience patch when entity identity matches source profile", async () => {
    const { getApiSession } = await import("@/lib/session");
    vi.mocked(getApiSession).mockResolvedValue(session());
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: '{"experience":[{"company":"Acme","title":"Engineer","description":"Architected APIs."}]}',
        },
      ],
    });
    const { POST } = await import("@/app/api/profile/enhance-section/route");

    const profile = {
      experience: [{ company: "Acme", title: "Engineer", description: "Built APIs." }],
      projects: [],
      voiceNotes: "",
    };
    const res = await POST(
      buildReq({ section: "experience", intent: "strengthen_bullets", profile }),
    );
    expect(res.status).toBe(200);
  });
});
