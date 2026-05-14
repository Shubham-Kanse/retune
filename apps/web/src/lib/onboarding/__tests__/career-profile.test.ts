import { describe, expect, it } from "vitest";
import { careerProfileToNormalized, isCareerProfileV1 } from "../career-profile.schema";
import { createEmptyProfile } from "../session-store";

describe("CareerProfileV1 contract", () => {
  it("validates the canonical profile shape", () => {
    const profile = createEmptyProfile("u1");
    expect(isCareerProfileV1(profile)).toBe(true);
    expect(profile.identity.fullName.evidence).toEqual([]);
    expect(profile.identity.fullName.editHistory).toEqual([]);
  });

  it("projects canonical profile into legacy profile fields without dropping key resume data", () => {
    const profile = createEmptyProfile("u1");
    profile.identity.fullName.value = "Jane Doe";
    profile.identity.email.value = "jane@example.com";
    profile.identity.linkedin.value = "https://linkedin.com/in/jane";
    profile.identity.github.value = "https://github.com/jane";
    profile.professionalProfile.currentTitles.value = ["Backend Engineer"];
    profile.professionalProfile.summarySignals.value = ["Builds payment APIs"];
    profile.experience.value = [{
      id: "e1",
      title: "Backend Engineer",
      company: "Acme",
      responsibilities: ["Built APIs"],
      achievements: ["Reduced latency 30%"],
      metrics: [{ metric: "Latency", value: "30%", context: "API response time" }],
      tools: ["Java"],
      skills: ["API design"],
    }];
    profile.projects.value = [{
      id: "p1",
      title: "Payments API",
      description: "Built a payment platform",
      techStack: ["Java", "Postgres"],
      impact: "30% faster",
    }];
    profile.certifications.value = [{ id: "c1", name: "AWS SAA", issuer: "AWS" }];
    profile.skills.technical.value = ["Java", "Postgres", "REST"];
    profile.skills.tools.value = ["Docker"];
    profile.skills.business.value = ["Stakeholder management"];
    profile.careerIntent.interestedRoles.value = ["Backend Engineer"];

    const normalized = careerProfileToNormalized(profile, "fallback@example.com");

    expect(normalized.fullName).toBe("Jane Doe");
    expect(normalized.linkedin).toBe("https://linkedin.com/in/jane");
    expect(normalized.experience[0]?.description).toContain("Reduced latency 30%");
    expect(normalized.projects[0]?.name).toBe("Payments API");
    expect(normalized.certifications).toEqual(["AWS SAA"]);
    expect(normalized.skillsTier1.map((skill) => skill.name)).toContain("Java");
  });
});
