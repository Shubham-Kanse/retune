/**
 * Phase 0 security tests:
 * - Spoofed x-user-id headers must not authenticate API routes
 * - Forged pills must be rejected
 * - Oversized / invalid files must be rejected
 * - resume_data kind must be rejected (removed)
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const resolveSessionState = vi.fn();

vi.mock("@/lib/identity", () => ({
  createIdentityModule: vi.fn(() => ({ resolveSessionState })),
}));

vi.mock("@/lib/onboarding/session-store", () => ({
  getOrCreateSession: vi.fn(async (userId: string) => ({
    id: "sess-1",
    userId,
    responseChainId: null,
    profile: {
      id: "p1",
      userId,
      identity: {
        fullName: { value: "Jane Doe", source: "resume", confidence: 0.9, confirmed: false, lastUpdatedAt: "" },
        email: { value: "jane@example.com", source: "resume", confidence: 0.9, confirmed: false, lastUpdatedAt: "" },
        phone: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        location: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        linkedin: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        github: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        portfolio: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        website: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      },
      professionalProfile: {
        currentTitles: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        professionalIdentities: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        yearsOfExperience: { value: null, source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        summarySignals: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        domainExperience: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        careerHighlights: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      },
      experience: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      education: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      skills: {
        technical: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        tools: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        business: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        methodologies: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        softSkills: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        domainSkills: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      },
      projects: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      certifications: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      languages: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      awards: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      publications: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      volunteering: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      careerIntent: {
        interestedRoles: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        careerDirection: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        preferredMarkets: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        workPreference: { value: "", source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        seniorityComfort: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        industriesOfInterest: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        roleDealbreakers: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      },
      resumeWritingPreferences: {
        emphasisAreas: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        deEmphasisAreas: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        toneSignals: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
        styleConstraints: { value: [], source: "system", confidence: 0, confirmed: false, lastUpdatedAt: "" },
      },
      onboarding: {
        currentPhase: "resume_upload",
        parseQuality: { score: 0, textExtractionMethod: "unknown", hasIdentity: false, hasExperience: false, hasEducation: false, hasSkills: false, hasProjects: false, weakAreas: [], warnings: [] },
        readiness: null,
        resumeUploaded: false,
        resumeParsed: false,
        resumeSummarized: false,
        educationNotApplicable: false,
        completedAt: null,
      },
    },
    meta: {
      currentPhase: "resume_upload",
      answeredQuestionKeys: [],
      skippedQuestionKeys: [],
      resumeUploaded: false,
      resumeParsed: false,
      resumeSummarized: false,
      identityConfirmed: false,
      experienceConfirmed: false,
      educationConfirmed: false,
      skillsConfirmed: false,
      projectsCertificationsReviewed: false,
      educationNotApplicable: false,
      optionalTonePrompted: false,
      enhancementTurns: 0,
      resetCount: 0,
      status: "draft",
    },
    messages: [],
    turnCount: 0,
    version: 0,
    status: "draft",
  })),
  saveSession: vi.fn(async () => {}),
  createEmptyProfile: vi.fn((userId: string) => ({ id: "p1", userId })),
  createEmptyMeta: vi.fn(() => ({})),
}));

vi.mock("@/lib/onboarding/events", () => ({
  logOnboardingEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/onboarding/planner", () => ({
  planNextQuestion: vi.fn(() => ({
    phase: "resume_upload",
    field: "resume",
    questionKey: "resume_upload",
    prompt: "Upload your resume",
    answerType: "confirm",
    pills: [
      { label: "Upload", value: "upload_resume", action: "navigate", field: "resume" },
    ],
    skipAllowed: false,
  })),
}));

vi.mock("@/lib/onboarding/readiness", () => ({
  calculateProfileReadiness: vi.fn(() => ({
    canEnterDashboard: false,
    score: 0,
    blockers: ["No resume uploaded"],
    warnings: [],
    suggestions: [],
    completedCategories: { identity: 0, experience: 0, education: 0, skills: 0, professionalProfile: 0, careerIntent: 0, resumeWritingSignals: 0 },
  })),
}));

vi.mock("@/lib/onboarding/fallback-templates", () => ({
  fallbackFor: vi.fn(() => "Let's get started."),
}));

vi.mock("@/lib/onboarding/guardrails", () => ({
  applyInputGuardrails: vi.fn((text: string) => ({ blocked: false, text })),
  stripOutputLeaks: vi.fn((s: string) => s),
  isDuplicateMessage: vi.fn(() => false),
}));

vi.mock("@/lib/onboarding/text-router", () => ({
  routeFreeText: vi.fn(async () => ({ intent: "off_topic", rationale: "test" })),
}));

vi.mock("@/lib/onboarding/profile-context", () => ({
  buildProfileContext: vi.fn(() => ""),
}));

vi.mock("@/lib/onboarding/normalization", () => ({
  normalizeSkill: vi.fn((s: string) => s),
  normalizeStringArray: vi.fn((a: string[]) => a),
}));

vi.mock("@/lib/profile-domain/services/normalizer", () => ({
  normalizeProfile: vi.fn(() => ({})),
}));

vi.mock("@/lib/profile-domain/repositories/profile-repository", () => ({
  persistProfile: vi.fn(async () => {}),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 59 })),
}));

vi.mock("@/lib/profile-domain/extractors/openai-resume-extractor", () => ({
  extractProfileFromResumeFile: vi.fn(async () => ({ extracted: { fullName: "Jane Doe" } })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chatReq(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/onboarding/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

function uploadReq(file: File, extraHeaders: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("file", file);
  // NextRequest needs explicit multipart content-type for formData() to work in tests
  return new NextRequest("http://localhost/api/onboarding/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=----boundary", ...extraHeaders },
    body: fd,
  });
}

// ─── Auth spoofing tests ──────────────────────────────────────────────────────

describe("Auth spoofing — chat route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when no session and no x-user-id header", async () => {
    resolveSessionState.mockResolvedValue(null);
    const { POST } = await import("@/app/api/onboarding/chat/route");
    const res = await POST(chatReq({ kind: "greeting" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-user-id header is present but Supabase returns no session", async () => {
    resolveSessionState.mockResolvedValue(null);
    const { POST } = await import("@/app/api/onboarding/chat/route");
    // Spoofed header — should be ignored by getApiSession()
    const res = await POST(chatReq({ kind: "greeting" }, { "x-user-id": "fake-user-id", "x-user-email": "fake@example.com" }));
    expect(res.status).toBe(401);
  });

  it("succeeds when Supabase returns a valid session (ignores headers)", async () => {
    resolveSessionState.mockResolvedValue({ userId: "real-user", email: "real@example.com", fullName: null, expiresAt: 0 });
    const { POST } = await import("@/app/api/onboarding/chat/route");
    const res = await POST(chatReq({ kind: "greeting" }));
    // Should not be 401
    expect(res.status).not.toBe(401);
  });
});

describe("Auth spoofing — upload route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 401 when no session", async () => {
    resolveSessionState.mockResolvedValue(null);
    const { POST } = await import("@/app/api/onboarding/upload/route");
    const file = new File(["hello"], "resume.pdf", { type: "application/pdf" });
    const res = await POST(uploadReq(file));
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-user-id header is spoofed but Supabase returns no session", async () => {
    resolveSessionState.mockResolvedValue(null);
    const { POST } = await import("@/app/api/onboarding/upload/route");
    const file = new File(["hello"], "resume.pdf", { type: "application/pdf" });
    const res = await POST(uploadReq(file, { "x-user-id": "attacker", "x-user-email": "attacker@evil.com" }));
    expect(res.status).toBe(401);
  });
});

// ─── resume_data kind must be rejected ───────────────────────────────────────

describe("chat route — resume_data kind removed", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 for resume_data kind (removed in Phase 0)", async () => {
    resolveSessionState.mockResolvedValue({ userId: "u1", email: "u@example.com", fullName: null, expiresAt: 0 });
    const { POST } = await import("@/app/api/onboarding/chat/route");
    const res = await POST(chatReq({ kind: "resume_data", profile: { fullName: "Hacker" } }));
    expect(res.status).toBe(400);
  });
});

describe("chat route — finish_later is not completion", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("saves a draft and does not persist a completed profile", async () => {
    resolveSessionState.mockResolvedValue({ userId: "u1", email: "u@example.com", fullName: null, expiresAt: 0 });
    const sessionStore = await import("@/lib/onboarding/session-store");
    const profileRepository = await import("@/lib/profile-domain/repositories/profile-repository");
    const { POST } = await import("@/app/api/onboarding/chat/route");

    const res = await POST(chatReq({ kind: "finish_later" }));

    expect(res.status).toBe(200);
    expect(sessionStore.saveSession).toHaveBeenCalled();
    expect(profileRepository.persistProfile).not.toHaveBeenCalled();
    const savedState = vi.mocked(sessionStore.saveSession).mock.calls[0]?.[1] as any;
    expect(savedState.status).toBe("draft");
    expect(savedState.meta.status).toBe("draft");
  });
});

// ─── Forged pill tests ────────────────────────────────────────────────────────

describe("chat route — forged pill rejection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns 400 for a pill not in the current question", async () => {
    resolveSessionState.mockResolvedValue({ userId: "u1", email: "u@example.com", fullName: null, expiresAt: 0 });
    const { POST } = await import("@/app/api/onboarding/chat/route");
    // Pill with action/field/value not matching any server pill
    const res = await POST(chatReq({
      kind: "pill_click",
      questionKey: "resume_upload",
      pill: { label: "Forged", value: "onboarding_completed", action: "set_field", field: "users.onboarding_completed" },
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a pill with wrong field for current question", async () => {
    resolveSessionState.mockResolvedValue({ userId: "u1", email: "u@example.com", fullName: null, expiresAt: 0 });
    const { POST } = await import("@/app/api/onboarding/chat/route");
    const res = await POST(chatReq({
      kind: "pill_click",
      questionKey: "resume_upload",
      pill: { label: "Remote", value: "remote", action: "set_field", field: "careerIntent.workPreference" },
    }));
    expect(res.status).toBe(400);
  });
});

// ─── File validation tests (testing the utility directly) ────────────────────
// The route delegates to readAndValidateResumeFile; we test that directly
// since NextRequest.formData() doesn't work reliably in vitest jsdom.

describe("readAndValidateResumeFile — file validation", () => {
  it("throws for unsupported file extension", async () => {
    const { readAndValidateResumeFile } = await import("@/lib/profile-domain/utils/resume-file");
    const file = new File(["content"], "resume.txt", { type: "text/plain" });
    await expect(readAndValidateResumeFile(file)).rejects.toThrow("Only PDF and DOCX files are supported.");
  });

  it("throws for PDF extension with non-PDF magic bytes", async () => {
    const { readAndValidateResumeFile } = await import("@/lib/profile-domain/utils/resume-file");
    // ZIP bytes (PK signature) in a .pdf file
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(100).fill(0)]);
    const file = { name: "resume.pdf", size: zipBytes.length, arrayBuffer: async () => zipBytes.buffer } as unknown as File;
    await expect(readAndValidateResumeFile(file)).rejects.toThrow("valid PDF");
  });

  it("throws for oversized file", async () => {
    const { readAndValidateResumeFile } = await import("@/lib/profile-domain/utils/resume-file");
    const bigContent = new Uint8Array(11 * 1024 * 1024);
    const file = new File([bigContent], "resume.pdf", { type: "application/pdf" });
    await expect(readAndValidateResumeFile(file)).rejects.toThrow("10MB");
  });

  it("accepts a valid PDF (correct magic bytes)", async () => {
    const { readAndValidateResumeFile } = await import("@/lib/profile-domain/utils/resume-file");
    // %PDF magic bytes
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, ...new Array(100).fill(0x20)]);
    const file = { name: "resume.pdf", size: pdfBytes.length, arrayBuffer: async () => pdfBytes.buffer } as unknown as File;
    await expect(readAndValidateResumeFile(file)).resolves.toBeDefined();
  });
});
