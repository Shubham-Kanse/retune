import { createEmptyProfile } from "@/lib/onboarding/session-store";
import { describe, expect, it } from "vitest";
import { buildCareerUnderstandingContext } from "../context";
import { runUnderstandingGuardrails } from "../guardrails";

function profileWithEmployer(name = "Acme Corp") {
  const p = createEmptyProfile("u1");
  p.identity.fullName.value = "Jane";
  p.experience.value = [
    {
      id: "e1",
      title: "Engineer",
      company: name,
      responsibilities: ["Built APIs"],
      achievements: ["Reduced latency 30%"],
      tools: ["Java"],
      skills: [],
    },
  ];
  return p;
}

function baselineSlice() {
  return {
    summary: {
      headline: "Builder",
      narrative: "A reliable builder.",
      confidenceLabel: "medium" as const,
      caveats: [],
      sourceRefs: [],
      confirmed: false,
    },
    positioning: { selectedId: null, options: [] },
    evidenceMap: {
      strongestSignals: [],
      supportingSignals: [],
      weakSignals: [],
      inferredUnconfirmed: [],
    },
    resumeFuel: { ready: [], needsSharpening: [], risks: [], suggestedNextEdits: [] },
  };
}

describe("runUnderstandingGuardrails", () => {
  it("passes a clean output", () => {
    const profile = profileWithEmployer();
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const report = runUnderstandingGuardrails({
      output: baselineSlice(),
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("rejects unsupported employer claim in summary", () => {
    const profile = profileWithEmployer("Acme Corp");
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.summary.narrative = "Worked at NotInProfileCo to deliver scale.";
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(false);
    expect(report.violations.find((v) => v.kind === "unsupported_employer")).toBeDefined();
  });

  it("accepts known employer in summary", () => {
    const profile = profileWithEmployer("Acme Corp");
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.summary.narrative = "Worked at Acme Corp to deliver scale.";
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(true);
  });

  it("flags hype words", () => {
    const profile = profileWithEmployer();
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.summary.headline = "World-class rockstar developer";
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(false);
    expect(report.violations.filter((v) => v.kind === "hype_words").length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("rejects evidence ref with profile path outside the allowed list", () => {
    const profile = profileWithEmployer();
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.summary.sourceRefs = [
      {
        id: "e1",
        profilePath: "secrets.password",
        source: "ai_inferred",
        label: "Anomaly",
      },
    ];
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(false);
    expect(report.violations.find((v) => v.kind === "invalid_profile_path")).toBeDefined();
  });

  it("accepts indexed children of an allowed path", () => {
    const profile = profileWithEmployer();
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.summary.sourceRefs = [
      {
        id: "e1",
        profilePath: "experience[0].achievements",
        source: "resume",
        label: "Achievement",
      },
    ];
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(true);
  });

  it("rejects empty summary", () => {
    const profile = profileWithEmployer();
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.summary.headline = "   ";
    slice.summary.narrative = "  ";
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(false);
    expect(report.violations.find((v) => v.kind === "empty_summary")).toBeDefined();
  });

  it("rejects duplicate positioning ids", () => {
    const profile = profileWithEmployer();
    const ctx = buildCareerUnderstandingContext({ profile, readiness: null });
    const slice = baselineSlice();
    slice.positioning = {
      selectedId: null,
      options: [
        {
          id: "same",
          kind: "primary",
          title: "Builder",
          description: "d",
          bestFor: [],
          emphasize: [],
          deEmphasize: [],
          risks: [],
          evidenceRefs: [],
          userDecision: "undecided",
        },
        {
          id: "same",
          kind: "alternative",
          title: "Other",
          description: "d",
          bestFor: [],
          emphasize: [],
          deEmphasize: [],
          risks: [],
          evidenceRefs: [],
          userDecision: "undecided",
        },
      ],
    };
    const report = runUnderstandingGuardrails({
      output: slice,
      profile,
      allowedProfilePaths: ctx.allowedProfilePaths,
    });
    expect(report.ok).toBe(false);
    expect(report.violations.find((v) => v.kind === "duplicate_positioning_id")).toBeDefined();
  });
});
