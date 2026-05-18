import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION, SAMPLE_RESUME_TEXT } from "./fixtures";
import { clearLLMMocks, mockCallLLM, nextLLMResponse } from "./llm-mock";

vi.mock("@/lib/onboarding-v2/llm/calls", () => ({
  callLLM: vi.fn(async () => nextLLMResponse()),
  callLLMWithRetry: vi.fn(async () => nextLLMResponse()),
  getSessionStats: () => ({ calls: 0, costUsd: 0 }),
  resetSessionLimits: () => {},
}));

vi.mock("@/lib/onboarding-v2/session", () => ({
  loadSession: vi.fn(),
  updateSession: vi.fn(),
  loadSessionWithVersion: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  markSessionCommitted: vi.fn(),
  validateSessionOwnership: vi.fn(),
  validateCommitIdempotency: vi.fn(),
}));

function fixtureIdentity() {
  const identity = EXPECTED_EXTRACTION.identity;
  if (!identity) throw new Error("Expected extraction fixture identity");
  return identity;
}

describe("Stage 2 — Dual Extraction", () => {
  beforeEach(() => {
    clearLLMMocks();
  });

  it("returns extraction + summary when both calls succeed", async () => {
    const { runDualExtraction } = await import("../stages/stage-2-extraction");
    mockCallLLM([
      JSON.stringify(EXPECTED_EXTRACTION),
      "Backend engineer with around four years of focused fintech experience at Fiserv and Accenture, leading payment processing infrastructure work, gRPC microservice migrations, and Redis-backed latency optimisations that cut API response time by forty percent. Distinctive in their pairing of deep distributed-systems chops with active mentorship of junior engineers on patterns like idempotency keys, retry budgets, and saga orchestration. Career arc shows steady scope growth from individual contributor to tech lead, with the most credible next move being senior or staff backend roles at fintech companies that already operate at million-transactions-per-day scale.",
    ]);
    const session = createEmptySession("u1");
    session.extraction.raw_text = SAMPLE_RESUME_TEXT;
    session.extraction.raw_text_character_count = SAMPLE_RESUME_TEXT.length;

    const result = await runDualExtraction(session);
    expect(result.pureExtraction).toBeTruthy();
    expect(result.pureExtractionConfidence).toBe("high");
    expect(result.inferredSummary ?? "").toContain("Fiserv");
    expect(result.summaryQuality === "high" || result.summaryQuality === "medium").toBe(true);
    expect(result.nonResumeDetected).toBe(false);
  });

  it("flags non-resume documents (cover letters, etc.)", async () => {
    const { runDualExtraction } = await import("../stages/stage-2-extraction");
    mockCallLLM([
      JSON.stringify({
        ...EXPECTED_EXTRACTION,
        identity: { ...fixtureIdentity(), full_name: null },
        experience: [],
        education: [],
        skills: { raw_list: [], grouped: {} },
      }),
      "(this should not be reached because non-resume short-circuits)",
    ]);
    const session = createEmptySession("u2");
    session.extraction.raw_text = "Dear hiring manager, I am writing to express my interest...";

    const result = await runDualExtraction(session);
    expect(result.nonResumeDetected).toBe(true);
  });

  it("falls back to schema mapping when pure extraction fails", async () => {
    const { runDualExtraction } = await import("../stages/stage-2-extraction");
    mockCallLLM([new Error("model timeout")]);
    const session = createEmptySession("u3");
    session.extraction.raw_text = SAMPLE_RESUME_TEXT;
    session.extraction.schema_mapping_object = EXPECTED_EXTRACTION;

    const result = await runDualExtraction(session);
    expect(result.pureExtraction).toEqual(EXPECTED_EXTRACTION);
    expect(result.pureExtractionConfidence).toBe("medium");
  });

  it("flags low-quality summaries when the narrative is generic", async () => {
    const { runDualExtraction } = await import("../stages/stage-2-extraction");
    // pure extraction succeeds, summary is short + generic on first try AND retry
    mockCallLLM([
      JSON.stringify(EXPECTED_EXTRACTION),
      "Experience in software with various projects.", // first attempt — generic
      "Multiple companies experience in software with various projects across many domains.", // retry still generic
    ]);
    const session = createEmptySession("u4");
    session.extraction.raw_text = SAMPLE_RESUME_TEXT;

    const result = await runDualExtraction(session);
    expect(result.summaryQuality).toBe("low");
    expect(result.inferredSummaryStatus).toBe("low_quality");
  });
});
