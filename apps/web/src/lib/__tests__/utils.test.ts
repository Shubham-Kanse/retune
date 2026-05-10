import { cn } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("Utils", () => {
  it("should merge class names correctly", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    expect(cn("p-4", "px-2")).toBe("p-4 px-2");
    expect(cn("text-sm", undefined, "font-bold")).toBe("text-sm font-bold");
  });

  it("should handle conditional classes", () => {
    expect(cn("base", true && "conditional")).toBe("base conditional");
    expect(cn("base", false && "conditional")).toBe("base");
  });
});
