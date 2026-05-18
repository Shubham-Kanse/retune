import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLLMMocks, mockCallLLM, nextLLMResponse } from "./llm-mock";

vi.mock("@/lib/onboarding-v2/llm/calls", () => ({
  callLLM: vi.fn(async () => nextLLMResponse()),
  callLLMWithRetry: vi.fn(async () => nextLLMResponse()),
  getSessionStats: () => ({ calls: 0, costUsd: 0 }),
  resetSessionLimits: () => {},
}));

const updateSessionMock = vi.fn(async () => {});
vi.mock("@/lib/onboarding-v2/session", () => ({
  loadSession: vi.fn(),
  updateSession: vi.fn(async (...args: unknown[]) => updateSessionMock(...args)),
}));

vi.mock("@/lib/profile-domain/extractors/document-text-extractor", () => ({
  extractDocumentText: vi.fn(async ({ buffer }: { buffer: Buffer }) => buffer.toString("utf-8")),
}));

import { extractTextFromFile, isStage1Complete } from "../stages/stage-1-upload";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION, SAMPLE_RESUME_TEXT } from "./fixtures";

describe("Stage 1 — extractTextFromFile", () => {
  beforeEach(() => {
    clearLLMMocks();
    updateSessionMock.mockClear();
  });

  it("reads plaintext directly via UTF-8", async () => {
    const buf = Buffer.from(SAMPLE_RESUME_TEXT, "utf-8");
    const result = await extractTextFromFile(buf, "text/plain");
    expect(result.success).toBe(true);
    expect(result.charCount).toBeGreaterThan(300);
    expect(result.text?.length ?? 0).toBeGreaterThan(0);
  });

  it("flags scanned PDFs (under NEAR_EMPTY_CHARS) with the right code", async () => {
    const buf = Buffer.from("a".repeat(50), "utf-8");
    const result = await extractTextFromFile(buf, "text/plain");
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("scanned_pdf");
  });

  it("flags near-empty content (under MIN_EXTRACTION_CHARS) distinctly", async () => {
    // Between NEAR_EMPTY_CHARS (200) and MIN_EXTRACTION_CHARS (300)
    const buf = Buffer.from("a".repeat(250), "utf-8");
    const result = await extractTextFromFile(buf, "text/plain");
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("empty_content");
  });

  it("propagates password-protected errors", async () => {
    vi.doMock("@/lib/profile-domain/extractors/document-text-extractor", () => ({
      extractDocumentText: vi.fn(async () => {
        throw new Error("file is password protected");
      }),
    }));
    vi.resetModules();
    const { extractTextFromFile: ext } = await import("../stages/stage-1-upload");
    const result = await ext(Buffer.from("dummy"), "application/pdf");
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("password_protected");
    vi.doUnmock("@/lib/profile-domain/extractors/document-text-extractor");
  });
});

describe("Stage 1 — fireSchemaMapping", () => {
  beforeEach(() => {
    clearLLMMocks();
    updateSessionMock.mockClear();
    vi.resetModules();
  });

  it("persists schema_mapping_status: success on a valid LLM response", async () => {
    mockCallLLM([JSON.stringify(EXPECTED_EXTRACTION)]);
    const { fireSchemaMapping: fire } = await import("../stages/stage-1-upload");
    await fire(SAMPLE_RESUME_TEXT, "u1");
    const lastCall = updateSessionMock.mock.calls.at(-1);
    const patch = lastCall?.[1] as { extraction?: { schema_mapping_status?: string } };
    expect(patch.extraction?.schema_mapping_status).toBe("success");
  });

  it("persists schema_mapping_status: failed when all retries error", async () => {
    mockCallLLM([new Error("a"), new Error("b"), new Error("c")]);
    const { fireSchemaMapping: fire } = await import("../stages/stage-1-upload");
    await fire(SAMPLE_RESUME_TEXT, "u2");
    const lastCall = updateSessionMock.mock.calls.at(-1);
    const patch = lastCall?.[1] as { extraction?: { schema_mapping_status?: string } };
    expect(patch.extraction?.schema_mapping_status).toBe("failed");
  });
});

describe("Stage 1 — isStage1Complete", () => {
  it("returns true only when extraction + status are both ready", () => {
    const session = createEmptySession("u");
    expect(isStage1Complete(session)).toBe(false);

    session.extraction.raw_text = "x".repeat(400);
    session.extraction.raw_text_character_count = 400;
    session.extraction.extraction_method = "file";
    session.onboarding_status = "extraction_complete";
    expect(isStage1Complete(session)).toBe(true);
  });
});
