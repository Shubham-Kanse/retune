import { describe, it, expect } from "vitest";
import { inferRolesFromProfile } from "../role-inference";
import { createEmptyProfile } from "../session-store";

describe("inferRolesFromProfile", () => {
  it("profile with Java/Spring Boot skills → includes backend role", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.technical.value = ["Java", "Spring Boot", "REST API"];
    const roles = inferRolesFromProfile(profile);
    expect(roles.some(r => r.includes("Software Engineer") || r.includes("Backend Developer"))).toBe(true);
  });

  it("profile with SQL/Power BI skills → includes data role", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.tools.value = ["SQL", "Power BI", "Tableau"];
    const roles = inferRolesFromProfile(profile);
    expect(roles.some(r => r.includes("Data Analyst") || r.includes("BI Analyst"))).toBe(true);
  });

  it("profile with React/TypeScript skills → includes Frontend Developer", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.technical.value = ["React", "TypeScript", "CSS"];
    const roles = inferRolesFromProfile(profile);
    expect(roles.some(r => r.includes("Frontend Developer"))).toBe(true);
  });

  it("empty skills → returns empty array", () => {
    const profile = createEmptyProfile("u1");
    const roles = inferRolesFromProfile(profile);
    expect(roles).toEqual([]);
  });

  it("returns max 5 results", () => {
    const profile = createEmptyProfile("u1");
    profile.skills.technical.value = ["Java", "Spring Boot", "React", "TypeScript", "Python", "PyTorch", "Terraform", "Kubernetes"];
    profile.skills.tools.value = ["SQL", "Power BI", "Docker", "AWS"];
    profile.experience.value = [
      { id: "e1", title: "Full Stack Developer", company: "X", responsibilities: [], achievements: [], tools: [], skills: [] },
      { id: "e2", title: "Data Analyst", company: "Y", responsibilities: [], achievements: [], tools: [], skills: [] },
      { id: "e3", title: "DevOps Engineer", company: "Z", responsibilities: [], achievements: [], tools: [], skills: [] },
    ];
    const roles = inferRolesFromProfile(profile);
    expect(roles.length).toBeLessThanOrEqual(5);
  });
});
