import { createEmptyProfile } from "@/lib/onboarding/session-store";
import { describe, expect, it } from "vitest";
import { buildCareerUnderstandingContext } from "../context";

function richProfile() {
  const p = createEmptyProfile("u1");
  p.identity.fullName.value = "Jane Doe";
  p.identity.location.value = "Dublin";
  p.identity.linkedin.value = "https://linkedin.com/in/jane";
  p.professionalProfile.currentTitles.value = ["Senior Engineer"];
  p.professionalProfile.professionalIdentities.value = ["builder", "AI engineer"];
  p.professionalProfile.summarySignals.value = ["Builds AI workflow products"];
  p.experience.value = [
    {
      id: "e1",
      title: "Senior Engineer",
      company: "Acme",
      responsibilities: Array.from({ length: 12 }, (_, i) => `responsibility ${i}`),
      achievements: ["Cut latency 30%"],
      tools: ["TypeScript", "Postgres"],
      skills: [],
    },
  ];
  p.skills.technical.value = ["TypeScript", "Postgres", "Python"];
  p.careerIntent.interestedRoles.value = ["AI Product Engineer"];
  p.projects.value = [
    {
      id: "p1",
      title: "Workbench",
      description: "AI workbench",
      techStack: ["TypeScript"],
    },
  ];
  return p;
}

describe("buildCareerUnderstandingContext", () => {
  it("populates allowed profile paths", () => {
    const ctx = buildCareerUnderstandingContext({ profile: richProfile(), readiness: null });
    expect(ctx.allowedProfilePaths).toContain("identity.fullName");
    expect(ctx.allowedProfilePaths).toContain("skills.technical");
    expect(ctx.allowedProfilePaths).toContain("experience[0]");
    expect(ctx.allowedProfilePaths).toContain("experience[0].achievements");
    expect(ctx.allowedProfilePaths).toContain("projects[0]");
  });

  it("trims oversized arrays", () => {
    const ctx = buildCareerUnderstandingContext({ profile: richProfile(), readiness: null });
    expect(ctx.experience[0]?.responsibilities.length).toBeLessThanOrEqual(6);
  });

  it("strips empty values", () => {
    const ctx = buildCareerUnderstandingContext({
      profile: createEmptyProfile("u1"),
      readiness: null,
    });
    expect(ctx.identity.fullName).toBeNull();
    expect(ctx.identity.websites).toHaveLength(0);
    expect(ctx.experience).toHaveLength(0);
    expect(ctx.isEmpty).toBe(true);
  });

  it("sets isEmpty=false when there is content", () => {
    const ctx = buildCareerUnderstandingContext({ profile: richProfile(), readiness: null });
    expect(ctx.isEmpty).toBe(false);
  });

  it("respects maxChars by trimming variable-size lists first", () => {
    const profile = richProfile();
    profile.experience.value = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      title: "Senior Engineer",
      company: `Company ${i}`,
      responsibilities: Array.from({ length: 6 }, (_, j) => `responsibility ${i}-${j}`),
      achievements: ["Cut latency 30%"],
      tools: ["TypeScript", "Postgres"],
      skills: [],
    }));
    const before = buildCareerUnderstandingContext({
      profile,
      readiness: null,
    });
    const beforeLen = JSON.stringify(before).length;
    const after = buildCareerUnderstandingContext({
      profile,
      readiness: null,
      maxChars: Math.max(1500, Math.floor(beforeLen / 2)),
    });
    expect(JSON.stringify(after).length).toBeLessThanOrEqual(
      Math.max(1500, Math.floor(beforeLen / 2)),
    );
    expect(after.experience.length).toBeLessThanOrEqual(before.experience.length);
  });

  it("includes readiness when supplied", () => {
    const ctx = buildCareerUnderstandingContext({
      profile: richProfile(),
      readiness: {
        canEnterDashboard: true,
        score: 80,
        blockers: [],
        warnings: ["short summary"],
        suggestions: ["add metrics"],
        completedCategories: {
          identity: 100,
          experience: 100,
          experienceOrProjects: 100,
          education: 100,
          educationOrNotApplicable: 100,
          skills: 100,
          professionalProfile: 100,
          careerIntent: 100,
          resumeWritingSignals: 100,
          resumeWritingPreferences: 100,
          qualityAndConfirmation: 100,
        },
      },
    });
    expect(ctx.readiness?.warnings).toContain("short summary");
    expect(ctx.readiness?.suggestions).toContain("add metrics");
  });
});
