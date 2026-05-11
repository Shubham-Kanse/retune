import { describe, expect, it } from "vitest";
import {
  assembleProfile,
  findMissingCoreFields,
  normalizeProfileInput,
} from "@/lib/profile-assembly";

describe("ProfileAssemblyModule", () => {
  it("normalizes scalar and array fields consistently", () => {
    const normalized = normalizeProfileInput(
      {
        fullName: "Jane Doe",
        email: "",
        relocationPreferences: "Remote",
        targetRoles: ["Senior Engineer"],
        skillsTier1: [{ name: "TypeScript" }],
      },
      { userEmail: "fallback@example.com" },
    );

    expect(normalized.email).toBe("fallback@example.com");
    expect(normalized.relocationPreferences).toEqual(["Remote"]);
    expect(normalized.targetRoles).toEqual(["Senior Engineer"]);
    expect(normalized.skillsTier1).toEqual([{ name: "TypeScript" }]);
  });

  it("finds missing core fields from partial extraction", () => {
    const missing = findMissingCoreFields({
      fullName: "Jane Doe",
      currentTitle: "",
      location: "Galway",
      targetRoles: [],
    });

    expect(missing).toEqual(["currentTitle", "experienceLevel", "targetRoles"]);
  });

  it("assembles markdown, completeness, and db values from profile", () => {
    const assembled = assembleProfile(
      {
        fullName: "Jane Doe",
        email: "jane@example.com",
        currentTitle: "Software Engineer",
        location: "Galway",
        targetRoles: ["Backend Engineer"],
        experienceLevel: "mid",
        experience: [
          {
            title: "Engineer",
            company: "Acme",
            startDate: "2022-01",
            endDate: "2024-01",
            description: "Built APIs",
          },
        ],
        education: [{ degree: "MSc", institution: "UoG" }],
        skillsTier1: [{ name: "TypeScript" }, { name: "Node.js" }],
        skillsTier2: [],
        skillsTier3: [],
      },
      { userEmail: "fallback@example.com", now: new Date("2026-01-01T00:00:00Z") },
    );

    expect(assembled.profileMarkdown).toContain("# Jane Doe");
    expect(assembled.profileMarkdown).toContain("## Experience");
    expect(assembled.dbValues.experience).toContain("Acme");
    expect(assembled.dbValues.skillsTier1).toContain("TypeScript");
    expect(assembled.completenessScore).toBeGreaterThan(0);
    expect(assembled.dbValues.updatedAt.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
