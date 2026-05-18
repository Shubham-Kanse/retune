import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION } from "./fixtures";
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

describe("Stage 6 — Completeness Assessment", () => {
  beforeEach(() => clearLLMMocks());

  it("returns the LLM-decided completeness path on a valid response", async () => {
    const { runCompletenessAssessment } = await import("../stages/stage-6-completeness");
    mockCallLLM([
      JSON.stringify({
        completeness_score: 82,
        missing_critical_fields: [],
        completeness_path: "standard",
        resume_stale: false,
        employment_gaps_present: false,
        has_quantified_achievements: true,
        special_handling_notes: "FAANG background — questions should not feel basic.",
      }),
    ]);
    const session = createEmptySession("u1");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.confirmation.confirmed_role_family = "Backend Engineering";
    session.confirmation.confirmed_seniority = "Senior IC";

    const result = await runCompletenessAssessment(session);
    expect(result.completeness_path).toBe("standard");
    expect(result.has_quantified_achievements).toBe(true);
  });

  it("falls back to standard path when the LLM fails", async () => {
    const { runCompletenessAssessment } = await import("../stages/stage-6-completeness");
    mockCallLLM([new Error("provider down")]);
    const session = createEmptySession("u2");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;

    const result = await runCompletenessAssessment(session);
    expect(result.completeness_path).toBe("standard");
    expect(result.completeness_score).toBe(60);
  });

  it("activates conditional questions based on flags", async () => {
    const { determineActiveQuestions } = await import("../stages/stage-6-completeness");
    const session = createEmptySession("u3");
    session.inference.career_transition_detected = true;

    const active = determineActiveQuestions(session, {
      completeness_score: 70,
      missing_critical_fields: [],
      completeness_path: "career_changer",
      resume_stale: false,
      employment_gaps_present: true,
      has_quantified_achievements: false,
      special_handling_notes: "",
    });

    expect(active.career_transition_framing).toBe(true);
    expect(active.gap_handling).toBe(true);
    expect(active.achievement_depth).toBe(true);
    expect(active.target_role).toBe(true);
    expect(active.target_role_specificity).toBe(false); // activated dynamically post-Q1
  });

  it("disables conditional questions when flags are off", async () => {
    const { determineActiveQuestions } = await import("../stages/stage-6-completeness");
    const session = createEmptySession("u4");
    const active = determineActiveQuestions(session, {
      completeness_score: 90,
      missing_critical_fields: [],
      completeness_path: "standard",
      resume_stale: false,
      employment_gaps_present: false,
      has_quantified_achievements: true,
      special_handling_notes: "",
    });
    expect(active.career_transition_framing).toBe(false);
    expect(active.gap_handling).toBe(false);
    expect(active.achievement_depth).toBe(false);
  });
});
