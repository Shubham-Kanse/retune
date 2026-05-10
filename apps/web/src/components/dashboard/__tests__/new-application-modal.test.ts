import { describe, expect, it } from "vitest";

import { validateJobDescriptionInput } from "@/components/dashboard/new-application-modal";

describe("NewApplicationModal validation", () => {
  it("rejects descriptions shorter than minimum length", () => {
    expect(validateJobDescriptionInput("too short")).toBe("Paste at least 50 characters.");
  });

  it("accepts descriptions at or above minimum length after trimming", () => {
    const jd = `   ${"x".repeat(50)}   `;
    expect(validateJobDescriptionInput(jd)).toBeNull();
  });
});
