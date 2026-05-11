import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("web runtime boundaries", () => {
  it("does not import Temporal workflow/worker modules in apps/web", () => {
    const out = execSync(
      "rg -n \"(from\\s+['\\\"]@temporalio/(workflow|worker|activity)['\\\"]|require\\(['\\\"]@temporalio/(workflow|worker|activity)['\\\"]\\))\" src next.config.ts || true",
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });
});
