import type { PreflightDetectResponse } from "@/lib/drift-preflight";
import { describe, expect, it } from "vitest";
import { computeVerdict } from "../match-verdict";

function preflight(overrides: {
  matched?: string[];
  missingMust?: string[];
  missingGood?: string[];
}): PreflightDetectResponse {
  return {
    structured_jd: {
      role_title: "Senior Engineer",
      must_have_skills: [],
      good_to_have_skills: [],
      inferred_skills: [],
      responsibilities: [],
      soft_skills: [],
    },
    drift_summary: {
      severity: "none",
      matched_skills: overrides.matched ?? [],
      missing_must_have: overrides.missingMust ?? [],
      missing_good_to_have: overrides.missingGood ?? [],
    },
    questions: [],
    profile_snapshot: { current_title: "", known_skills: [] },
  };
}

describe("computeVerdict", () => {
  it("full coverage is a strong match at 100%", () => {
    const v = computeVerdict(preflight({ matched: ["java", "kafka", "aws"] }));
    expect(v.tone).toBe("strong");
    expect(v.matchPercent).toBe(100);
  });

  it("three or more missing must-haves is a weak match", () => {
    const v = computeVerdict(
      preflight({ matched: ["java"], missingMust: ["kafka", "aws", "terraform"] }),
    );
    expect(v.tone).toBe("weak");
    expect(v.matchPercent).toBeLessThan(60);
    expect(v.detail).toContain("3 required skills");
  });

  it("one or two missing must-haves is a fair match", () => {
    const v = computeVerdict(preflight({ matched: ["java", "aws"], missingMust: ["kafka"] }));
    expect(v.tone).toBe("fair");
    expect(v.matchPercent).toBeGreaterThan(60);
  });

  it("only nice-to-have gaps stays fair, not weak", () => {
    const v = computeVerdict(
      preflight({ matched: ["java", "aws"], missingGood: ["graphql", "rust"] }),
    );
    expect(v.tone).toBe("fair");
    expect(v.detail).toContain("nice-to-have");
  });

  it("good-to-have penalty is capped so it can never dominate", () => {
    const many = Array.from({ length: 20 }, (_, i) => `skill-${i}`);
    const v = computeVerdict(preflight({ matched: ["java"], missingGood: many }));
    expect(v.matchPercent).toBeGreaterThanOrEqual(70);
  });

  it("empty JD (no skills extracted) defaults to full must coverage", () => {
    const v = computeVerdict(preflight({}));
    expect(v.tone).toBe("strong");
  });
});
