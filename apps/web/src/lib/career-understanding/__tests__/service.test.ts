import { createEmptyProfile } from "@/lib/onboarding/session-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@retune/agent/web", () => ({
  getModels: () => ({ smart: "smart-model", fast: "fast-model", frontier: "frontier-model" }),
  getProvider: () => ({ createMessage: createMessageMock }),
}));

function richProfile() {
  const p = createEmptyProfile("u1");
  p.identity.fullName.value = "Jane Doe";
  p.identity.location.value = "Dublin";
  p.professionalProfile.currentTitles.value = ["Senior Engineer"];
  p.professionalProfile.professionalIdentities.value = ["builder"];
  p.experience.value = [
    {
      id: "e1",
      title: "Senior Engineer",
      company: "Acme",
      responsibilities: ["Built APIs"],
      achievements: ["Cut latency 30%"],
      tools: ["TypeScript", "Postgres"],
      skills: [],
    },
  ];
  p.skills.technical.value = ["TypeScript", "Postgres"];
  p.careerIntent.interestedRoles.value = ["AI Product Engineer"];
  return p;
}

const validInitialAi = {
  summary: {
    headline: "Product-minded full-stack builder",
    narrative:
      "Retune currently understands you as a product-minded full-stack builder with strong signals in AI workflows.",
    confidenceLabel: "medium" as const,
    caveats: [],
    sourceRefs: [
      {
        id: "ev1",
        profilePath: "experience[0].achievements",
        source: "resume" as const,
        label: "Latency cut",
      },
    ],
    confirmed: false,
  },
  positioning: {
    selectedId: null,
    options: [
      {
        id: "p1",
        kind: "primary" as const,
        title: "AI Product Engineer",
        description: "Builds AI workflow products end to end.",
        bestFor: ["AI SaaS"],
        emphasize: ["AI workflows"],
        deEmphasize: [],
        risks: [],
        evidenceRefs: [],
        userDecision: "undecided" as const,
      },
    ],
  },
  evidenceMap: {
    strongestSignals: [
      {
        id: "s1",
        label: "Production systems",
        interpretation: "Demonstrates production work",
        strength: "strong" as const,
        sourceRefs: [],
      },
    ],
    supportingSignals: [],
    weakSignals: [],
    inferredUnconfirmed: [],
  },
  resumeFuel: {
    ready: [
      {
        id: "rf1",
        label: "Work history",
        whyItMatters: "Roles are present",
        section: "experience" as const,
        severity: "info" as const,
        sourceRefs: [],
      },
    ],
    needsSharpening: [],
    risks: [],
    suggestedNextEdits: [],
  },
};

describe("generateInitialCareerUnderstanding", () => {
  beforeEach(() => {
    vi.resetModules();
    createMessageMock.mockReset();
  });

  it("returns a validated CareerUnderstandingV1 from a clean AI response", async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(validInitialAi) }],
      stopReason: "end_turn",
    });

    const { generateInitialCareerUnderstanding } = await import("../service");
    const { isCareerUnderstandingV1 } = await import("../schema");
    const profile = richProfile();
    const result = await generateInitialCareerUnderstanding({
      userId: "u1",
      profile,
      readiness: null,
    });
    expect(isCareerUnderstandingV1(result.understanding)).toBe(true);
    expect(result.understanding.userId).toBe("u1");
    expect(result.understanding.summary.headline).toBe("Product-minded full-stack builder");
    expect(result.understanding.positioning.options[0]?.title).toBe("AI Product Engineer");
    expect(result.understanding.revision).toBe(1);
    expect(result.understanding.status).toBe("active");
  });

  it("throws CareerUnderstandingAiError when JSON is invalid", async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: "not json" }],
      stopReason: "end_turn",
    });

    const { generateInitialCareerUnderstanding, CareerUnderstandingAiError } = await import(
      "../service"
    );
    await expect(
      generateInitialCareerUnderstanding({
        userId: "u1",
        profile: richProfile(),
        readiness: null,
      }),
    ).rejects.toBeInstanceOf(CareerUnderstandingAiError);
  });

  it("throws when AI breaks the schema", async () => {
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ summary: { headline: "x" } }) }],
      stopReason: "end_turn",
    });

    const { generateInitialCareerUnderstanding, CareerUnderstandingAiError } = await import(
      "../service"
    );
    await expect(
      generateInitialCareerUnderstanding({
        userId: "u1",
        profile: richProfile(),
        readiness: null,
      }),
    ).rejects.toBeInstanceOf(CareerUnderstandingAiError);
  });

  it("throws when profile is too thin", async () => {
    const { generateInitialCareerUnderstanding, CareerUnderstandingAiError } = await import(
      "../service"
    );
    await expect(
      generateInitialCareerUnderstanding({
        userId: "u1",
        profile: createEmptyProfile("u1"),
        readiness: null,
      }),
    ).rejects.toMatchObject({
      reason: "profile_too_thin",
    });
    // Cross-check error class
    try {
      await generateInitialCareerUnderstanding({
        userId: "u1",
        profile: createEmptyProfile("u1"),
        readiness: null,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(CareerUnderstandingAiError);
    }
  });

  it("rejects AI output that mentions an employer not in the profile", async () => {
    const tampered = {
      ...validInitialAi,
      summary: {
        ...validInitialAi.summary,
        narrative:
          "Retune sees you as a builder. Worked at NotInProfileCo to ship critical infrastructure.",
      },
    };
    createMessageMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify(tampered) }],
      stopReason: "end_turn",
    });
    const { generateInitialCareerUnderstanding, CareerUnderstandingAiError } = await import(
      "../service"
    );
    await expect(
      generateInitialCareerUnderstanding({
        userId: "u1",
        profile: richProfile(),
        readiness: null,
      }),
    ).rejects.toMatchObject({ reason: "model_returned_disallowed_facts" });
    expect(CareerUnderstandingAiError).toBeDefined();
  });
});

describe("previewCareerUnderstandingChange", () => {
  beforeEach(() => {
    vi.resetModules();
    createMessageMock.mockReset();
  });

  it("returns a validated patch + slice for a summary scope", async () => {
    createMessageMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            summary: {
              ...validInitialAi.summary,
              headline: "Updated headline",
              narrative: "Updated narrative for the new tuning.",
            },
          }),
        },
      ],
      stopReason: "end_turn",
    });

    const { previewCareerUnderstandingChange } = await import("../service");
    const { emptyCareerUnderstanding } = await import("../schema");
    const profile = richProfile();
    const current = emptyCareerUnderstanding({
      userId: "u1",
      sourceProfileFingerprint: "fp",
    });
    const result = await previewCareerUnderstandingChange({
      userId: "u1",
      profile,
      current,
      request: {
        section: "summary",
        scope: "summary",
        instruction: "Make it more product-focused.",
      },
    });
    expect(result.patch.section).toBe("summary");
    expect(result.before.summary).toBeDefined();
    expect(result.after.summary?.headline).toBe("Updated headline");
    expect(result.changeSummary.length).toBeGreaterThan(0);
  });
});
