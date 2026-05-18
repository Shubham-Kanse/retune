import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySession } from "../types";
import { EXPECTED_EXTRACTION } from "./fixtures";
import { clearLLMMocks, mockCallLLM, nextLLMResponse } from "./llm-mock";

vi.mock("@/lib/onboarding-v2/llm/calls", () => ({
  callLLM: vi.fn(async () => nextLLMResponse()),
  callLLMWithRetry: vi.fn(async () => nextLLMResponse()),
  getSessionStats: () => ({ calls: 3, costUsd: 0.0123 }),
  resetSessionLimits: () => {},
}));

vi.mock("@/lib/onboarding-v2/session", () => ({
  loadSession: vi.fn(),
  updateSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

describe("Stage 9 — Confidence Audit", () => {
  beforeEach(() => {
    clearLLMMocks();
    vi.clearAllMocks();
  });

  it("uses the LLM audit when it returns valid JSON", async () => {
    const { runConfidenceAudit } = await import("../stages/stage-9-audit");
    mockCallLLM([
      JSON.stringify({
        critical_gaps: [],
        important_gaps: [],
        contradictions: [],
        user_supplied_overrides: [],
        regenerate_inferred_summary: false,
        profile_quality_score: 88,
        profile_quality_note: "Strong, specific profile.",
        ready_to_commit: true,
      }),
    ]);
    const session = createEmptySession("u1");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.confirmation.confirmed_role_family = "Backend Engineering";
    session.confirmation.confirmed_seniority = "Senior IC";
    session.question_map.target_role = {
      value: "Senior Backend Engineer",
      confidence: "high",
      source: "free_text",
    };
    session.question_map.resume_frame = {
      value: "system design at scale",
      confidence: "high",
      source: "free_text",
    };

    const audit = await runConfidenceAudit(session);
    expect(audit.profile_quality_score).toBe(88);
    expect(audit.ready_to_commit).toBe(true);
  });

  it("merges deterministic critical gaps into the LLM result", async () => {
    const { runConfidenceAudit } = await import("../stages/stage-9-audit");
    mockCallLLM([
      JSON.stringify({
        critical_gaps: [],
        important_gaps: [],
        contradictions: [],
        user_supplied_overrides: [],
        regenerate_inferred_summary: false,
        profile_quality_score: 70,
        profile_quality_note: "Workable.",
        ready_to_commit: true,
      }),
    ]);
    // Session is missing target_role + resume_frame → deterministic critical gaps must surface
    const session = createEmptySession("u2");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.confirmation.confirmed_role_family = "Backend Engineering";
    session.confirmation.confirmed_seniority = "Senior IC";

    const audit = await runConfidenceAudit(session);
    const fields = audit.critical_gaps.map((g) => g.field);
    expect(fields).toContain("target_role");
    expect(fields).toContain("resume_frame");
    expect(audit.ready_to_commit).toBe(false); // not ready until resolved
  });

  it("falls back to deterministic-only audit when the LLM throws", async () => {
    const { runConfidenceAudit } = await import("../stages/stage-9-audit");
    mockCallLLM([new Error("provider down")]);
    const session = createEmptySession("u3");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.confirmation.confirmed_role_family = "Backend Engineering";
    session.confirmation.confirmed_seniority = "Senior IC";
    session.question_map.target_role = {
      value: "Senior Backend Engineer",
      confidence: "high",
      source: "chip",
    };
    session.question_map.resume_frame = {
      value: "system design at scale",
      confidence: "high",
      source: "free_text",
    };

    const audit = await runConfidenceAudit(session);
    expect(audit.critical_gaps).toHaveLength(0);
    expect(audit.ready_to_commit).toBe(true);
    expect(audit.profile_quality_note).toContain("fallback");
  });

  it("commits through the atomic onboarding v2 profile RPC", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { commitProfile } = await import("../stages/stage-9-audit");
    const session = createEmptySession("u4");
    session.dual_extraction.pure_extraction = EXPECTED_EXTRACTION;
    session.audit.ready_to_commit = true;

    await commitProfile(session);

    expect(rpc).toHaveBeenCalledWith("commit_onboarding_v2_profile", {
      p_user_id: "u4",
      p_session: session,
      p_llm_stats: { calls: 3, costUsd: 0.0123 },
    });
  });
});
