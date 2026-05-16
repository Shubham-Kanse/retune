import { describe, expect, it } from "vitest";
import {
  CAREER_UNDERSTANDING_VERSION,
  careerUnderstandingAiOutputSchema,
  careerUnderstandingPatchSchema,
  careerUnderstandingSchema,
  emptyCareerUnderstanding,
  isCareerUnderstandingV1,
} from "../index";

describe("career-understanding schema", () => {
  it("emptyCareerUnderstanding returns a valid v1 document", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    expect(u.schemaVersion).toBe(CAREER_UNDERSTANDING_VERSION);
    expect(isCareerUnderstandingV1(u)).toBe(true);
    expect(u.summary.confidenceLabel).toBe("low");
    expect(u.positioning.options).toHaveLength(0);
    expect(u.evidenceMap.strongestSignals).toHaveLength(0);
    expect(u.resumeFuel.ready).toHaveLength(0);
    expect(u.userFeedback.summary).toBeNull();
  });

  it("rejects oversized headline", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    u.summary.headline = "a".repeat(161);
    expect(careerUnderstandingSchema.safeParse(u).success).toBe(false);
  });

  it("rejects oversized narrative", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    u.summary.narrative = "a".repeat(901);
    expect(careerUnderstandingSchema.safeParse(u).success).toBe(false);
  });

  it("rejects more than 5 positioning options", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    u.positioning.options = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      kind: "alternative" as const,
      title: "Builder",
      description: "Builder description",
      bestFor: [],
      emphasize: [],
      deEmphasize: [],
      risks: [],
      evidenceRefs: [],
      userDecision: "undecided" as const,
    }));
    expect(careerUnderstandingSchema.safeParse(u).success).toBe(false);
  });

  it("rejects more than 24 strongest signals", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    u.evidenceMap.strongestSignals = Array.from({ length: 25 }, (_, i) => ({
      id: `s${i}`,
      label: "Production",
      interpretation: "Builds production systems",
      strength: "strong" as const,
      sourceRefs: [],
    }));
    expect(careerUnderstandingSchema.safeParse(u).success).toBe(false);
  });

  it("rejects an evidence quote longer than 500 chars", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    u.summary.sourceRefs = [
      {
        id: "e1",
        profilePath: "experience[0]",
        source: "resume",
        label: "Production",
        quote: "x".repeat(501),
      },
    ];
    expect(careerUnderstandingSchema.safeParse(u).success).toBe(false);
  });

  it("rejects unknown enum values", () => {
    const u = emptyCareerUnderstanding({ userId: "u1" });
    (u.summary as unknown as { confidenceLabel: string }).confidenceLabel = "supreme";
    expect(careerUnderstandingSchema.safeParse(u).success).toBe(false);
  });

  it("validates a positioning patch", () => {
    const patch = {
      section: "positioning" as const,
      positioning: {
        selectedId: "p1",
        options: [
          {
            id: "p1",
            kind: "primary" as const,
            title: "AI Product Engineer",
            description: "Builds AI workflow products end-to-end.",
            bestFor: ["AI SaaS"],
            emphasize: ["AI workflows"],
            deEmphasize: ["legacy java"],
            risks: ["narrow"],
            evidenceRefs: [],
            userDecision: "undecided" as const,
          },
        ],
      },
    };
    expect(careerUnderstandingPatchSchema.safeParse(patch).success).toBe(true);
  });

  it("rejects patch shapes with arbitrary keys", () => {
    const bogus = { section: "summary", arbitrary: { foo: "bar" } } as unknown;
    expect(careerUnderstandingPatchSchema.safeParse(bogus).success).toBe(false);
  });

  it("validates ai output without server metadata", () => {
    const ai = {
      summary: {
        headline: "Product-minded full-stack builder.",
        narrative: "A reliable builder of AI workflows and SaaS products.",
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
    expect(careerUnderstandingAiOutputSchema.safeParse(ai).success).toBe(true);
  });
});
