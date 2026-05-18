import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION, EXPECTED_INFERENCE } from "./fixtures";
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
}));

describe("Stage 3 — Inference (LLM)", () => {
  beforeEach(() => {
    clearLLMMocks();
  });

  it("returns parsed inference when the LLM produces valid JSON", async () => {
    const { runInference } = await import("../stages/stage-3-inference");
    mockCallLLM([JSON.stringify(EXPECTED_INFERENCE)]);
    const session = createEmptySession("u1");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.dual_extraction.inferred_summary = "Backend engineer at Fiserv...";

    const result = await runInference(session);
    expect(result?.industry).toBe("Fintech");
    expect(result?.role_family).toBe("Backend Engineering");
    expect(result?.seniority).toBe("Senior IC");
  });

  it("returns null when extraction is missing", async () => {
    const { runInference } = await import("../stages/stage-3-inference");
    const session = createEmptySession("u2"); // no extraction
    const result = await runInference(session);
    expect(result).toBeNull();
  });

  it("returns null when LLM emits invalid output after retries", async () => {
    const { runInference } = await import("../stages/stage-3-inference");
    // INFERENCE_MAX_RETRIES = 2, plus original = 3 attempts. Queue 3 garbage responses.
    mockCallLLM(["not json", "still not json", "{ broken"]);
    const session = createEmptySession("u3");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await runInference(session);
    expect(result).toBeNull();
  });

  it("returns null on missing required fields", async () => {
    const { runInference } = await import("../stages/stage-3-inference");
    mockCallLLM([
      JSON.stringify({ industry: "Fintech" }), // missing role_family/seniority
      JSON.stringify({ industry: "Fintech" }),
      JSON.stringify({ industry: "Fintech" }),
    ]);
    const session = createEmptySession("u4");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await runInference(session);
    expect(result).toBeNull();
  });
});
