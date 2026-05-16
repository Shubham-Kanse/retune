import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiSession: vi.fn(),
  rateLimit: vi.fn(() => ({ success: true, remaining: 19 })),
  importResumeAndPersist: vi.fn(),
  assertValidResumeFile: vi.fn(() => ({ buffer: Buffer.alloc(0), lowerName: "resume.pdf", mediaType: "application/pdf" })),
  readAndValidateResumeFile: vi.fn(() => Promise.resolve({ buffer: Buffer.from("test"), lowerName: "resume.pdf", mediaType: "application/pdf" })),
  computeContentHash: vi.fn(() => "abc123"),
  extractProfileFromResumeFile: vi.fn(),
  getProfileByUserId: vi.fn(() => Promise.resolve(null)),
  logOnboardingEvent: vi.fn(),
  ResumeFileValidationError: class extends Error {
    status: number;
    constructor(msg: string, status = 400) { super(msg); this.status = status; }
  },
}));

vi.mock("@/lib/session", () => ({ getApiSession: mocks.getApiSession }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/profile-domain/services/resume-import-orchestrator", () => ({ importResumeAndPersist: mocks.importResumeAndPersist }));
vi.mock("@/lib/profile-domain/utils/resume-file", () => ({
  assertValidResumeFile: mocks.assertValidResumeFile,
  readAndValidateResumeFile: mocks.readAndValidateResumeFile,
  ResumeFileValidationError: mocks.ResumeFileValidationError,
}));
vi.mock("@/lib/profile-domain/repositories/resume-ingestion-repository", () => ({ computeContentHash: mocks.computeContentHash }));
vi.mock("@/lib/profile-domain/extractors/openai-resume-extractor", () => ({ extractProfileFromResumeFile: mocks.extractProfileFromResumeFile }));
vi.mock("@/lib/profile-domain/repositories/profile-repository", () => ({ getProfileByUserId: mocks.getProfileByUserId }));
vi.mock("@/lib/onboarding/events", () => ({ logOnboardingEvent: mocks.logOnboardingEvent }));
vi.mock("@retune/db", () => ({ db: {}, profiles: {}, users: {} }));

import { POST } from "@/app/api/profile/import-resume/route";

/** Build a request with a mocked formData() that returns a Map-like FormData */
function buildRequest(fields: Record<string, string | File | null>): Request {
  const fd = new Map<string, string | File | null>(Object.entries(fields));
  return {
    method: "POST",
    headers: { get: () => null },
    formData: () => Promise.resolve({ get: (key: string) => fd.get(key) ?? null }),
  } as unknown as Request;
}

describe("POST /api/profile/import-resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue({ success: true, remaining: 19 });
    mocks.assertValidResumeFile.mockReturnValue({ buffer: Buffer.alloc(0), lowerName: "resume.pdf", mediaType: "application/pdf" });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.getApiSession.mockResolvedValue(null);
    const req = buildRequest({ file: new File(["x"], "r.pdf") });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 when IP rate limit exceeded", async () => {
    mocks.getApiSession.mockResolvedValue({ userId: "u-rl", email: "u@example.com", fullName: "User One", expiresAt: 0 });
    mocks.rateLimit.mockReturnValue({ success: false, remaining: 0 });
    const req = buildRequest({ file: new File(["x"], "resume.pdf") });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 when file is missing", async () => {
    mocks.getApiSession.mockResolvedValue({ userId: "u-no-file", email: "u@example.com", fullName: "User One", expiresAt: 0 });
    const req = buildRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported extension", async () => {
    mocks.getApiSession.mockResolvedValue({ userId: "u-ext", email: "u@example.com", fullName: "User One", expiresAt: 0 });
    mocks.assertValidResumeFile.mockImplementation(() => { throw new mocks.ResumeFileValidationError("Only PDF and DOCX files are supported.", 400); });
    const req = buildRequest({ file: new File(["test"], "resume.txt", { type: "text/plain" }) });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("PDF and DOCX");
  });

  it("supports dryRun mode and returns extracted preview", async () => {
    mocks.getApiSession.mockResolvedValue({ userId: "u-dry", email: "u@example.com", fullName: "User One", expiresAt: 0 });
    mocks.extractProfileFromResumeFile.mockResolvedValue({
      assistantText: "",
      extracted: { fullName: "Jane", experience: [{ title: "Eng", company: "Co" }] },
    });
    const req = buildRequest({ file: new File(["test"], "resume.pdf", { type: "application/pdf" }), dryRun: "true" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.extracted.fullName).toBe("Jane");
    expect(body.parseQuality).toBeDefined();
    expect(body.parseQuality.score).toBeGreaterThan(0);
  });

  it("commits import and returns profile on non-dryRun", async () => {
    mocks.getApiSession.mockResolvedValue({ userId: "u-commit", email: "u@example.com", fullName: "User One", expiresAt: 0 });
    mocks.importResumeAndPersist.mockResolvedValue({
      extracted: { fullName: "Jane", experience: [] },
      missingQuestions: [],
      completenessScore: 60,
      ingestionId: "ing-1",
    });
    const req = buildRequest({ file: new File(["test"], "resume.pdf", { type: "application/pdf" }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile.fullName).toBe("Jane");
    expect(body.ingestionId).toBe("ing-1");
  });

  it("logs telemetry events on success", async () => {
    mocks.getApiSession.mockResolvedValue({ userId: "u-telem", email: "u@example.com", fullName: "User One", expiresAt: 0 });
    mocks.importResumeAndPersist.mockResolvedValue({
      extracted: { fullName: "Jane" },
      missingQuestions: [],
      completenessScore: 60,
      ingestionId: "ing-1",
    });
    const req = buildRequest({ file: new File(["test"], "resume.pdf", { type: "application/pdf" }) });
    await POST(req);
    expect(mocks.logOnboardingEvent).toHaveBeenCalledTimes(2);
    expect(mocks.logOnboardingEvent.mock.calls[0][0].eventType).toBe("resume_upload_started");
    expect(mocks.logOnboardingEvent.mock.calls[1][0].eventType).toBe("resume_upload_succeeded");
  });
});
