import { describe, it, expect } from "vitest";
import { computeReadiness } from "../completeness";
import { createEmptyProfile } from "../session-store";

describe("computeReadiness", () => {
  it("empty profile → canEnterDashboard=false, blockers non-empty", () => {
    const profile = createEmptyProfile("u1");
    const r = computeReadiness(profile);
    expect(r.canEnterDashboard).toBe(false);
    expect(r.blockers.length).toBeGreaterThan(0);
  });

  it("complete profile → canEnterDashboard=true", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane Doe";
    profile.identity.email.value = "jane@example.com";
    profile.identity.location.value = "London, UK";
    profile.experience.value = [{ id: "e1", title: "SWE", company: "Acme", responsibilities: [], achievements: [], tools: [], skills: [] }];
    profile.experience.confirmed = true;
    profile.education.value = [{ id: "ed1", degree: "BSc CS", institution: "MIT" }];
    profile.education.confirmed = true;
    profile.skills.technical.value = ["TypeScript", "React"];
    profile.professionalProfile.professionalIdentities.value = ["Software Engineer"];
    profile.professionalProfile.professionalIdentities.confirmed = true;
    profile.careerIntent.interestedRoles.confirmed = true;
    profile.careerIntent.preferredMarkets.confirmed = true;
    profile.careerIntent.workPreference.confirmed = true;
    const r = computeReadiness(profile);
    expect(r.canEnterDashboard).toBe(true);
  });

  it("missing name → blocker includes 'Full name missing'", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.email.value = "a@b.com";
    profile.identity.location.value = "NYC";
    const r = computeReadiness(profile);
    expect(r.blockers).toContain("Full name missing");
  });

  it("missing experience → blocker includes 'No experience entries'", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane";
    const r = computeReadiness(profile);
    expect(r.blockers).toContain("No experience entries");
  });

  it("score is 0-100 range", () => {
    const profile = createEmptyProfile("u1");
    const r = computeReadiness(profile);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("partial profile → score between 0 and 100", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane";
    profile.identity.email.value = "j@e.com";
    profile.skills.technical.value = ["Python"];
    const r = computeReadiness(profile);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
  });
});
