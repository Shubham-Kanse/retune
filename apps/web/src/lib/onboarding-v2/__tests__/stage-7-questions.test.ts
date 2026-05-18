import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { clearLLMMocks, nextLLMResponse } from "./llm-mock";

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
}));

describe("Stage 7 — Question sequencer", () => {
  beforeEach(() => {
    clearLLMMocks();
    updateSessionMock.mockClear();
  });

  it("returns target_role as the first question", async () => {
    const { getNextQuestion } = await import("../stages/stage-7-questions");
    const session = createEmptySession("u1");
    session.confirmation.confirmed_role_family = "Backend Engineering";
    session.confirmation.confirmed_seniority = "Senior IC";

    const q = getNextQuestion(session);
    expect(q?.field).toBe("target_role");
    expect(q?.chips?.length).toBeGreaterThan(0);
    expect(q?.skipAllowed).toBe(false);
  });

  it("skips conditional questions when their flag is off", async () => {
    const { getNextQuestion } = await import("../stages/stage-7-questions");
    const session = createEmptySession("u2");
    // Fill all non-conditional fields
    session.question_map.target_role = {
      value: "Senior Backend Engineer",
      confidence: "high",
      source: "chip",
    };
    session.question_map.underrepresented_skills = {
      value: "none",
      confidence: "high",
      source: "chip",
    };
    session.question_map.deemphasis_preferences = {
      value: "none",
      confidence: "high",
      source: "chip",
    };
    session.question_map.resume_frame = {
      value: "system design at scale",
      confidence: "high",
      source: "free_text",
    };
    // Conditionals all off — career_transition_detected=false, gaps=false, has_quantified=true
    session.completeness.has_quantified_achievements = true;

    const q = getNextQuestion(session);
    expect(q).toBeNull();
  });

  it("activates target_role_specificity follow-up when target_role is medium-confidence", async () => {
    const { getNextQuestion } = await import("../stages/stage-7-questions");
    const session = createEmptySession("u3");
    session.question_map.target_role = {
      value: "engineer",
      confidence: "medium",
      source: "free_text",
    };

    const q = getNextQuestion(session);
    expect(q?.field).toBe("target_role_specificity");
    expect(q?.skipAllowed).toBe(true);
  });

  it("quick-accepts the 'none' chip on underrepresented_skills without an LLM call", async () => {
    const { processAnswer } = await import("../stages/stage-7-questions");
    const session = createEmptySession("u4");

    const result = await processAnswer(session, "u4", "underrepresented_skills", "none");
    expect(result.accepted).toBe(true);
    expect(updateSessionMock).toHaveBeenCalled();
  });

  it("returns a follow-up when 'will_share' chip is selected on achievement_depth", async () => {
    const { processAnswer } = await import("../stages/stage-7-questions");
    const session = createEmptySession("u5");

    const result = await processAnswer(session, "u5", "achievement_depth", "will_share");
    expect(result.accepted).toBe(false);
    expect(result.followUp).toContain("share whatever comes to mind");
  });
});
