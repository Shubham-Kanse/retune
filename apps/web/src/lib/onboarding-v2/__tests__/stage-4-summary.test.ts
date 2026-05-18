import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION, EXPECTED_INFERENCE, EXPECTED_SUMMARY } from "./fixtures";
import { clearLLMMocks, mockCallLLM, nextLLMResponse } from "./llm-mock";

vi.mock("@/lib/onboarding-v2/llm/calls", () => ({
  callLLM: vi.fn(async () => nextLLMResponse()),
  callLLMWithRetry: vi.fn(async () => nextLLMResponse()),
  getSessionStats: () => ({ calls: 0, costUsd: 0 }),
  resetSessionLimits: () => {},
}));

describe("Stage 4 — Summary Presentation", () => {
  beforeEach(() => clearLLMMocks());

  it("returns the LLM-generated summary message and extraction cards", async () => {
    const { generateSummaryPresentation } = await import("../stages/stage-4-summary");
    mockCallLLM([EXPECTED_SUMMARY]);
    const session = createEmptySession("u1");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.dual_extraction.inferred_summary = "Backend engineer...";
    Object.assign(session.inference, EXPECTED_INFERENCE);

    const presentation = await generateSummaryPresentation(session);
    expect(presentation.summaryMessage).toBe(EXPECTED_SUMMARY);
    expect(presentation.extractionCards.length).toBeGreaterThan(0);
    expect(presentation.flags.careerTransition).toBe(false);
    expect(presentation.flags.newGrad).toBe(false);
  });

  it("falls back to a template summary when the LLM throws", async () => {
    const { generateSummaryPresentation } = await import("../stages/stage-4-summary");
    mockCallLLM([new Error("provider down")]);
    const session = createEmptySession("u2");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    Object.assign(session.inference, EXPECTED_INFERENCE);

    const presentation = await generateSummaryPresentation(session);
    expect(presentation.summaryMessage).toContain("Thanks for sharing your resume");
    expect(presentation.summaryMessage).toContain("Fiserv");
  });

  it("surfaces ambiguity questions when role family is ambiguous", async () => {
    const { generateSummaryPresentation } = await import("../stages/stage-4-summary");
    mockCallLLM([EXPECTED_SUMMARY]);
    const session = createEmptySession("u3");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.dual_extraction.inferred_summary = "Backend engineer...";
    Object.assign(session.inference, EXPECTED_INFERENCE);
    session.inference.role_family_ambiguous = true;
    session.inference.role_family_candidates = ["Backend Engineering", "Data Engineering"];

    const presentation = await generateSummaryPresentation(session);
    expect(presentation.ambiguityQuestions).toHaveLength(1);
    expect(presentation.ambiguityQuestions[0].field).toBe("role_family");
    expect(presentation.ambiguityQuestions[0].options).toEqual([
      "Backend Engineering",
      "Data Engineering",
    ]);
  });

  it("uses the new-grad template phrasing for early-career users", async () => {
    const { generateSummaryPresentation } = await import("../stages/stage-4-summary");
    mockCallLLM([new Error("force template")]);
    const session = createEmptySession("u4");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    Object.assign(session.inference, EXPECTED_INFERENCE);
    session.inference.new_grad = true;

    const presentation = await generateSummaryPresentation(session);
    expect(presentation.summaryMessage).toContain("earlier in your career");
  });
});
