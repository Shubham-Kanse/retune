import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION } from "./fixtures";
import { clearLLMMocks, mockCallLLM, nextLLMResponse } from "./llm-mock";

const updateSessionMock = vi.fn(async () => {});

vi.mock("@/lib/onboarding-v2/llm/calls", () => ({
  callLLM: vi.fn(async () => nextLLMResponse()),
  callLLMWithRetry: vi.fn(async () => nextLLMResponse()),
  getSessionStats: () => ({ calls: 0, costUsd: 0 }),
  resetSessionLimits: () => {},
}));

vi.mock("@/lib/onboarding-v2/session", () => ({
  loadSession: vi.fn(),
  updateSession: vi.fn(async (...args: unknown[]) => updateSessionMock(...args)),
  loadSessionWithVersion: vi.fn(),
}));

describe("Stage 5 — Correction Loop", () => {
  beforeEach(() => {
    clearLLMMocks();
    updateSessionMock.mockClear();
  });

  it("applies a clear correction and persists the updated extraction", async () => {
    const { processCorrectionRound } = await import("../stages/stage-5-correction");
    mockCallLLM([
      JSON.stringify({
        correction_understood: true,
        clarifying_question: null,
        fields_changed: ["experience[0].title"],
        updated_extraction: {
          ...EXPECTED_EXTRACTION,
          experience: [
            { ...EXPECTED_EXTRACTION.experience[0], title: "Staff Engineer" },
            EXPECTED_EXTRACTION.experience[1],
          ],
        },
        user_confirmation_message: "Updated your title at Fiserv to Staff Engineer.",
        user_supplied_fields: [],
      }),
    ]);
    const session = createEmptySession("u1");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await processCorrectionRound(
      session,
      "u1",
      "My title at Fiserv should be Staff Engineer",
    );
    expect(result.correctionUnderstood).toBe(true);
    expect(result.userConfirmationMessage).toContain("Staff Engineer");
    expect(updateSessionMock).toHaveBeenCalled();
  });

  it("returns a clarifying question when correction is unclear", async () => {
    const { processCorrectionRound } = await import("../stages/stage-5-correction");
    mockCallLLM([
      JSON.stringify({
        correction_understood: false,
        clarifying_question: "Which experience entry are you referring to?",
        fields_changed: [],
        updated_extraction: null,
        user_confirmation_message: "",
        user_supplied_fields: [],
      }),
    ]);
    const session = createEmptySession("u2");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await processCorrectionRound(session, "u2", "the experience is wrong");
    expect(result.correctionUnderstood).toBe(false);
    expect(result.clarifyingQuestion).toBe("Which experience entry are you referring to?");
  });

  it("escalates after the configured hard limit of correction rounds", async () => {
    const { processCorrectionRound } = await import("../stages/stage-5-correction");
    const session = createEmptySession("u3");
    session.confirmation.correction_rounds = 4; // already at limit
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await processCorrectionRound(session, "u3", "still wrong");
    expect(result.shouldEscalate).toBe(true);
    expect(result.escapeMessage).toContain("move on for now");
  });

  it("detects 'start over' intent and signals a restart", async () => {
    const { processCorrectionRound } = await import("../stages/stage-5-correction");
    const session = createEmptySession("u4");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await processCorrectionRound(session, "u4", "let's start over");
    expect(result.action).toBe("restart");
  });

  it("treats frustration phrases gently (no LLM, friendly clarifier)", async () => {
    const { processCorrectionRound } = await import("../stages/stage-5-correction");
    const session = createEmptySession("u5");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await processCorrectionRound(session, "u5", "this is completely wrong");
    expect(result.correctionUnderstood).toBe(false);
    expect(result.clarifyingQuestion).toContain("sorry about that");
  });
});
