import { createEmptyProfile } from "@/lib/onboarding/session-store";
import { describe, expect, it } from "vitest";
import { careerProfileFingerprint, emptyCareerUnderstanding, isUnderstandingStale } from "../index";

function withSkill(profile = createEmptyProfile("u1")) {
  profile.skills.technical.value = ["TypeScript", "React"];
  return profile;
}

describe("careerProfileFingerprint", () => {
  it("returns a stable hex string", () => {
    const fp = careerProfileFingerprint(withSkill());
    expect(fp).toMatch(/^[0-9a-f]+$/);
    expect(fp.length).toBeGreaterThan(8);
  });

  it("is stable across edit history changes", () => {
    const a = withSkill();
    const b = withSkill();
    b.identity.fullName.lastUpdatedAt = "2030-01-01T00:00:00Z";
    b.identity.fullName.editHistory = [
      {
        previousValue: "",
        nextValue: "",
        source: "user",
        actor: "user",
        reason: "manual",
        at: "2030-01-01T00:00:00Z",
      },
    ];
    a.updatedAt = "2030-01-01T00:00:00Z";
    b.updatedAt = "2030-01-02T00:00:00Z";
    expect(careerProfileFingerprint(a)).toBe(careerProfileFingerprint(b));
  });

  it("is stable across evidence reorderings", () => {
    const a = withSkill();
    a.identity.fullName.value = "Jane Doe";
    a.identity.fullName.evidence = [
      { source: "resume_text", quote: "Jane", confidence: 0.9 },
      { source: "user_message", quote: "Doe", confidence: 0.8 },
    ];
    const b = withSkill();
    b.identity.fullName.value = "Jane Doe";
    b.identity.fullName.evidence = [];
    expect(careerProfileFingerprint(a)).toBe(careerProfileFingerprint(b));
  });

  it("changes when a skill is added", () => {
    const a = withSkill();
    const b = withSkill();
    b.skills.technical.value = ["TypeScript", "React", "Node"];
    expect(careerProfileFingerprint(a)).not.toBe(careerProfileFingerprint(b));
  });

  it("changes when a target role changes", () => {
    const a = withSkill();
    a.careerIntent.interestedRoles.value = ["Product Engineer"];
    const b = withSkill();
    b.careerIntent.interestedRoles.value = ["Product Manager"];
    expect(careerProfileFingerprint(a)).not.toBe(careerProfileFingerprint(b));
  });

  it("changes when a project changes", () => {
    const a = withSkill();
    a.projects.value = [{ id: "p1", title: "AI Workbench", description: "A workbench" }];
    const b = withSkill();
    b.projects.value = [{ id: "p1", title: "AI Workbench v2", description: "A workbench" }];
    expect(careerProfileFingerprint(a)).not.toBe(careerProfileFingerprint(b));
  });

  it("changes when a writing preference changes", () => {
    const a = withSkill();
    a.resumeWritingPreferences.deEmphasisAreas.value = [];
    const b = withSkill();
    b.resumeWritingPreferences.deEmphasisAreas.value = ["legacy java"];
    expect(careerProfileFingerprint(a)).not.toBe(careerProfileFingerprint(b));
  });
});

describe("isUnderstandingStale", () => {
  it("returns false when there is no understanding", () => {
    const profile = withSkill();
    expect(isUnderstandingStale(null, profile)).toBe(false);
  });

  it("returns true when status is stale", () => {
    const profile = withSkill();
    const u = emptyCareerUnderstanding({
      userId: "u1",
      sourceProfileFingerprint: careerProfileFingerprint(profile),
    });
    u.status = "stale";
    expect(isUnderstandingStale(u, profile)).toBe(true);
  });

  it("returns true when fingerprint mismatches", () => {
    const profile = withSkill();
    const u = emptyCareerUnderstanding({
      userId: "u1",
      sourceProfileFingerprint: "different",
    });
    u.status = "active";
    expect(isUnderstandingStale(u, profile)).toBe(true);
  });

  it("returns false when fingerprint matches and status is active", () => {
    const profile = withSkill();
    const u = emptyCareerUnderstanding({
      userId: "u1",
      sourceProfileFingerprint: careerProfileFingerprint(profile),
    });
    u.status = "active";
    expect(isUnderstandingStale(u, profile)).toBe(false);
  });
});
