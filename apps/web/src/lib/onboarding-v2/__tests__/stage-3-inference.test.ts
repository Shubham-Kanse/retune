import { describe, expect, it } from "vitest";
import { generateRoleChips } from "../stages/stage-3-inference";

describe("generateRoleChips", () => {
  it("returns role-family-specific chips for Backend Engineering", () => {
    const chips = generateRoleChips("Backend Engineering");
    expect(chips[0]).toBe("Backend Engineer");
    expect(chips).toContain("Senior Backend Engineer");
    expect(chips[chips.length - 1]).toBe("Something else — I'll type it");
  });

  it("falls back to a generic set for unknown role families", () => {
    const chips = generateRoleChips("Astronaut Engineering");
    expect(chips).toContain("Software Engineer");
    expect(chips[chips.length - 1]).toBe("Something else — I'll type it");
  });

  it("falls back when role family is null", () => {
    const chips = generateRoleChips(null);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips[chips.length - 1]).toBe("Something else — I'll type it");
  });

  it("includes the right specialised chips for ML Engineering", () => {
    const chips = generateRoleChips("ML Engineering");
    expect(chips).toContain("ML Engineer");
    expect(chips).toContain("AI Engineer");
  });

  it("includes manager-track chips for Engineering Management", () => {
    const chips = generateRoleChips("Engineering Management");
    expect(chips).toContain("Engineering Manager");
    expect(chips).toContain("Tech Lead");
  });
});
