import { beforeEach, describe, expect, it, vi } from "vitest";
import { type OnboardingV2Session, createEmptySession } from "../types";
import { clearLLMMocks, nextLLMResponse } from "./llm-mock";

const updateSessionMock = vi.fn(async () => {});
let storedSession: OnboardingV2Session;

vi.mock("@/lib/onboarding-v2/llm/calls", () => ({
  callLLM: vi.fn(async () => nextLLMResponse()),
  callLLMWithRetry: vi.fn(async () => nextLLMResponse()),
  getSessionStats: () => ({ calls: 0, costUsd: 0 }),
  resetSessionLimits: () => {},
}));

vi.mock("@/lib/onboarding-v2/session", () => ({
  loadSession: vi.fn(async () => storedSession),
  updateSession: vi.fn(async (...args: unknown[]) => updateSessionMock(...args)),
}));

describe("Stage 8 — Voice question sequencer + extraction", () => {
  beforeEach(() => {
    clearLLMMocks();
    updateSessionMock.mockClear();
    storedSession = createEmptySession("u1");
  });

  it("returns the first voice question (natural_voice_sample)", async () => {
    const { getNextVoiceQuestion } = await import("../stages/stage-8-voice");
    const q = getNextVoiceQuestion(storedSession);
    expect(q?.field).toBe("natural_voice_sample");
    expect(q?.freeTextAllowed).toBe(true);
    expect(q?.chips).toBeNull();
  });

  it("rejects an under-30-word voice sample with a fallback prompt", async () => {
    const { processVoiceAnswer } = await import("../stages/stage-8-voice");
    const session = createEmptySession("u2");
    storedSession = session;

    const result = await processVoiceAnswer(
      session,
      "u2",
      "natural_voice_sample",
      "I build stuff.",
    );
    expect(result.accepted).toBe(false);
    expect(result.followUp).toContain("tech meetup");
  });

  it("accepts a 30+ word voice sample and stores it", async () => {
    const { processVoiceAnswer } = await import("../stages/stage-8-voice");
    const session = createEmptySession("u3");
    storedSession = session;
    const sample =
      "I build payment infrastructure at scale, focused on the work that keeps a financial system " +
      "honest under load. My day-to-day is API design, latency tuning, capacity planning, and " +
      "mentoring more junior engineers on distributed systems patterns like idempotency keys, " +
      "retries, and clean failure modes. I care more about clarity than cleverness.";

    const result = await processVoiceAnswer(session, "u3", "natural_voice_sample", sample);
    expect(result.accepted).toBe(true);
    expect(updateSessionMock).toHaveBeenCalled();
  });

  it("collapses 8+ tone preferences into 'open'", async () => {
    const { processVoiceAnswer } = await import("../stages/stage-8-voice");
    const session = createEmptySession("u4");
    storedSession = session;
    const all = [
      "direct_confident",
      "technical_precise",
      "warm_collaborative",
      "leadership_focused",
      "results_driven",
      "understated",
      "bold",
      "conversational",
    ];

    const result = await processVoiceAnswer(session, "u4", "tone_preferences", all);
    expect(result.accepted).toBe(true);
    const lastCall = updateSessionMock.mock.calls.at(-1);
    const patch = lastCall?.[1] as { voice_profile?: { tone_preferences?: unknown } };
    expect(patch.voice_profile?.tone_preferences).toBe("open");
  });

  it("normalises 'none' aversion to an empty array", async () => {
    const { processVoiceAnswer } = await import("../stages/stage-8-voice");
    const session = createEmptySession("u5");
    storedSession = session;

    await processVoiceAnswer(session, "u5", "tone_aversions", ["none"]);
    const patch = updateSessionMock.mock.calls.at(-1)?.[1] as {
      voice_profile?: { tone_aversions?: string[] };
    };
    expect(patch.voice_profile?.tone_aversions).toEqual([]);
  });
});
