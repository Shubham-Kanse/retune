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
    profile.onboarding.resumeUploaded = true;
    profile.onboarding.resumeParsed = true;
    profile.onboarding.resumeSummarized = true;
    profile.onboarding.parseQuality.score = 90;
    profile.experience.value = [{ id: "e1", title: "SWE", company: "Acme", responsibilities: [], achievements: [], tools: [], skills: [] }];
    profile.experience.confirmed = true;
    profile.education.value = [{ id: "ed1", degree: "BSc CS", institution: "MIT" }];
    profile.education.confirmed = true;
    profile.skills.technical.value = ["TypeScript", "React", "Node.js", "SQL", "AWS"];
    profile.professionalProfile.professionalIdentities.value = ["Software Engineer"];
    profile.professionalProfile.professionalIdentities.confirmed = true;
    profile.careerIntent.interestedRoles.confirmed = true;
    profile.careerIntent.interestedRoles.value = ["Software Engineer"];
    profile.careerIntent.preferredMarkets.confirmed = true;
    profile.careerIntent.preferredMarkets.value = ["UK"];
    profile.careerIntent.workPreference.confirmed = true;
    profile.careerIntent.workPreference.value = "hybrid";
    profile.careerIntent.seniorityComfort.value = ["Senior IC"];
    profile.careerIntent.seniorityComfort.confirmed = true;
    profile.resumeWritingPreferences.emphasisAreas.value = ["Backend engineering"];
    profile.resumeWritingPreferences.emphasisAreas.confirmed = true;
    profile.resumeWritingPreferences.deEmphasisAreas.confirmed = true;
    const r = computeReadiness(profile);
    expect(r.canEnterDashboard).toBe(true);
  });

  it("missing name → blocker asks for confirmed identity", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.email.value = "a@b.com";
    profile.identity.location.value = "NYC";
    const r = computeReadiness(profile);
    expect(r.blockers).toContain("Add your full name.");
  });

  it("missing experience → blocker asks for an experience entry", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane";
    const r = computeReadiness(profile);
    expect(r.blockers).toContain("Add or confirm at least one experience or project entry.");
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
