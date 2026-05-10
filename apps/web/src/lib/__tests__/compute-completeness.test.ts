import { computeCompletenessScore } from "@retune/db/compute-completeness";
import { describe, expect, it } from "vitest";

describe("computeCompletenessScore", () => {
  it("returns 0 for empty profile", () => {
    expect(computeCompletenessScore({})).toBe(0);
  });

  it("returns 100 for fully populated profile", () => {
    const full = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+353 87 123 4567",
      linkedin: "https://linkedin.com/in/janedoe",
      location: "Dublin, Ireland",
      currentTitle: "Senior Engineer",
      targetRoles: ["Software Engineer"],
      experience: [{ company: "Acme", title: "Engineer" }],
      education: [{ degree: "BSc", institution: "UCD" }],
      skillsTier1: [{ name: "TypeScript", evidence: "daily" }],
      voiceNotes: "I love building products.",
    };
    expect(computeCompletenessScore(full)).toBe(100);
  });

  it("never exceeds 100", () => {
    const overloaded = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      phone: "+353 87 123 4567",
      linkedin: "https://linkedin.com/in/janedoe",
      location: "Dublin",
      currentTitle: "Engineer",
      targetRoles: ["A", "B", "C"],
      experience: [{ company: "A" }, { company: "B" }],
      education: [{ degree: "BSc" }],
      skillsTier1: [{ name: "TS" }],
      voiceNotes: "notes",
      summary: "summary",
      profileMarkdown: "markdown",
    };
    expect(computeCompletenessScore(overloaded)).toBeLessThanOrEqual(100);
  });

  it("never goes below 0", () => {
    expect(computeCompletenessScore({})).toBeGreaterThanOrEqual(0);
  });

  it("awards points for each field independently", () => {
    const nameOnly = computeCompletenessScore({ fullName: "Jane Doe" });
    const emailOnly = computeCompletenessScore({ email: "jane@example.com" });
    const both = computeCompletenessScore({ fullName: "Jane Doe", email: "jane@example.com" });
    expect(both).toBe(nameOnly + emailOnly);
  });

  it("treats empty arrays as missing", () => {
    const withEmpty = computeCompletenessScore({
      targetRoles: [],
      experience: [],
      skillsTier1: [],
    });
    expect(withEmpty).toBe(0);
  });

  it("awards experience points for non-empty array", () => {
    const score = computeCompletenessScore({ experience: [{ company: "Acme" }] });
    expect(score).toBe(20);
  });

  it("awards voiceNotes points when summary is provided instead", () => {
    const withSummary = computeCompletenessScore({ summary: "I am a developer" });
    const withVoice = computeCompletenessScore({ voiceNotes: "I am a developer" });
    expect(withSummary).toBe(withVoice);
  });

  it("score is monotonically non-decreasing as fields are added", () => {
    const base = computeCompletenessScore({ fullName: "Jane" });
    const withEmail = computeCompletenessScore({ fullName: "Jane", email: "j@x.com" });
    const withLocation = computeCompletenessScore({
      fullName: "Jane",
      email: "j@x.com",
      location: "Dublin",
    });
    expect(withEmail).toBeGreaterThanOrEqual(base);
    expect(withLocation).toBeGreaterThanOrEqual(withEmail);
  });
});
