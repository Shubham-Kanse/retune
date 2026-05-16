import { describe, expect, it } from "vitest";
import { validateExtractionOutput } from "../output-validator";

describe("validateExtractionOutput", () => {
  it("passes clean extraction", () => {
    const extracted = {
      fullName: "John Doe",
      email: "john@example.com",
      phone: "+1 555-123-4567",
      technicalSkills: ["Python", "Java"],
      experience: [{ company: "Google", title: "SWE", description: "Built things" }],
    };
    const result = validateExtractionOutput(extracted, "some resume text");
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects AI leakage patterns in string fields", () => {
    const extracted = {
      fullName: "As an AI language model, I cannot extract names",
      email: "john@example.com",
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.sanitized.fullName).toBeNull();
  });

  it("detects fence marker leakage", () => {
    const extracted = {
      fullName: "John ===RESUME_CONTENT_ Doe",
      email: "john@example.com",
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    expect(result.sanitized.fullName).toBeNull();
  });

  it("truncates overly long fields", () => {
    const extracted = {
      fullName: "A".repeat(300),
      email: "john@example.com",
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    expect((result.sanitized.fullName as string).length).toBe(200);
  });

  it("rejects invalid email format", () => {
    const extracted = {
      fullName: "John",
      email: "not-an-email",
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    expect(result.sanitized.email).toBe("");
  });

  it("caps array cardinality", () => {
    const extracted = {
      technicalSkills: Array.from({ length: 150 }, (_, i) => `skill-${i}`),
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    expect((result.sanitized.technicalSkills as string[]).length).toBe(100);
  });

  it("filters leakage from array items", () => {
    const extracted = {
      technicalSkills: ["Python", "I'm sorry but I cannot help", "Java"],
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    expect(result.sanitized.technicalSkills).toEqual(["Python", "Java"]);
  });

  it("filters leakage from experience descriptions", () => {
    const extracted = {
      experience: [
        { company: "Google", title: "SWE", description: "As an AI, I cannot provide this information", achievements: ["Built system", "I apologize for the confusion"] },
      ],
    };
    const result = validateExtractionOutput(extracted, "resume text");
    expect(result.ok).toBe(false);
    const exp = (result.sanitized.experience as any[])[0];
    expect(exp.description).toBe("");
    expect(exp.achievements).toEqual(["Built system"]);
  });
});
