import { describe, expect, it } from "vitest";
import {
  type CareerUnderstandingPatch,
  applyCareerUnderstandingPatch,
  buildSliceForPatch,
  emptyCareerUnderstanding,
  isCareerUnderstandingV1,
} from "../index";

describe("applyCareerUnderstandingPatch", () => {
  it("applies a summary patch and leaves other sections untouched", () => {
    const current = emptyCareerUnderstanding({ userId: "u1" });
    current.positioning.options = [
      {
        id: "p1",
        kind: "primary",
        title: "Builder",
        description: "Builder description",
        bestFor: [],
        emphasize: [],
        deEmphasize: [],
        risks: [],
        evidenceRefs: [],
        userDecision: "undecided",
      },
    ];
    const patch: CareerUnderstandingPatch = {
      section: "summary",
      summary: {
        ...current.summary,
        headline: "Updated headline",
        narrative: "Updated narrative",
        confidenceLabel: "high",
      },
    };
    const next = applyCareerUnderstandingPatch({ current, patch });
    expect(next.summary.headline).toBe("Updated headline");
    expect(next.positioning.options).toHaveLength(1);
    expect(next.positioning.options[0]?.id).toBe("p1");
    expect(isCareerUnderstandingV1(next)).toBe(true);
  });

  it("applies a positioning patch", () => {
    const current = emptyCareerUnderstanding({ userId: "u1" });
    const patch: CareerUnderstandingPatch = {
      section: "positioning",
      positioning: {
        selectedId: "p1",
        options: [
          {
            id: "p1",
            kind: "primary",
            title: "Builder",
            description: "Description",
            bestFor: [],
            emphasize: [],
            deEmphasize: [],
            risks: [],
            evidenceRefs: [],
            userDecision: "undecided",
          },
        ],
      },
    };
    const next = applyCareerUnderstandingPatch({ current, patch });
    expect(next.positioning.options[0]?.title).toBe("Builder");
    expect(next.positioning.selectedId).toBe("p1");
  });

  it("applies a multi-section patch", () => {
    const current = emptyCareerUnderstanding({ userId: "u1" });
    const patch: CareerUnderstandingPatch = {
      section: "multiple",
      summary: {
        ...current.summary,
        headline: "Multi headline",
        narrative: "Multi narrative",
      },
      resumeFuel: {
        ready: [
          {
            id: "rf1",
            label: "Work history",
            whyItMatters: "Roles are present",
            section: "experience",
            severity: "info",
            sourceRefs: [],
          },
        ],
        needsSharpening: [],
        risks: [],
        suggestedNextEdits: [],
      },
    };
    const next = applyCareerUnderstandingPatch({ current, patch });
    expect(next.summary.headline).toBe("Multi headline");
    expect(next.resumeFuel.ready).toHaveLength(1);
  });
});

describe("buildSliceForPatch", () => {
  it("returns only the touched sections in before/after", () => {
    const current = emptyCareerUnderstanding({ userId: "u1" });
    const patch: CareerUnderstandingPatch = {
      section: "summary",
      summary: {
        ...current.summary,
        headline: "h",
        narrative: "n",
      },
    };
    const patched = applyCareerUnderstandingPatch({ current, patch });
    const { before, after } = buildSliceForPatch({ current, patched, patch });
    expect(before.summary).toBeDefined();
    expect(after.summary).toBeDefined();
    expect(before.positioning).toBeUndefined();
    expect(after.positioning).toBeUndefined();
    expect(before.evidenceMap).toBeUndefined();
    expect(before.resumeFuel).toBeUndefined();
  });

  it("returns multiple sections for a multiple patch", () => {
    const current = emptyCareerUnderstanding({ userId: "u1" });
    const patch: CareerUnderstandingPatch = {
      section: "multiple",
      summary: { ...current.summary, headline: "h", narrative: "n" },
      resumeFuel: { ready: [], needsSharpening: [], risks: [], suggestedNextEdits: [] },
    };
    const patched = applyCareerUnderstandingPatch({ current, patch });
    const { before, after } = buildSliceForPatch({ current, patched, patch });
    expect(before.summary).toBeDefined();
    expect(after.summary).toBeDefined();
    expect(before.resumeFuel).toBeDefined();
    expect(after.resumeFuel).toBeDefined();
    expect(before.positioning).toBeUndefined();
    expect(before.evidenceMap).toBeUndefined();
  });
});
