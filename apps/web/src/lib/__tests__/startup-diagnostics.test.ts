import { describe, expect, it } from "vitest";
import { resolveAppUrl } from "@/lib/startup-diagnostics";

describe("startup diagnostics", () => {
  it("resolveAppUrl falls back for invalid url", () => {
    const url = resolveAppUrl("not-a-url");
    expect(url.toString()).toBe("https://retuned.cv/");
  });

  it("resolveAppUrl uses configured valid url", () => {
    const url = resolveAppUrl("https://example.com");
    expect(url.toString()).toBe("https://example.com/");
  });
});

