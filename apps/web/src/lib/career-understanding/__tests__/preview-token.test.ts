// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { issuePreviewToken, verifyPreviewToken } from "../preview-token";
import type { CareerUnderstandingPatch } from "../types";

const examplePatch: CareerUnderstandingPatch = {
  section: "summary",
  summary: {
    headline: "h",
    narrative: "n",
    confidenceLabel: "medium",
    caveats: [],
    sourceRefs: [],
    confirmed: false,
  },
};

describe("preview-token", () => {
  beforeEach(() => {
    process.env.RETUNE_PREVIEW_SECRET = "test-secret-1234567890";
  });

  it("issues and verifies a token", async () => {
    const issued = await issuePreviewToken({
      previewId: "pv-1",
      userId: "u1",
      profileFingerprint: "fp123",
      understandingRevision: 3,
      patch: examplePatch,
      changeSummary: ["Updated headline"],
    });
    expect(issued.token).toBeTruthy();
    expect(issued.previewId).toBe("pv-1");

    const verified = await verifyPreviewToken(issued.token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe("u1");
    expect(verified?.profileFingerprint).toBe("fp123");
    expect(verified?.understandingRevision).toBe(3);
    expect(verified?.patch).toEqual(examplePatch);
    expect(verified?.changeSummary).toEqual(["Updated headline"]);
  });

  it("rejects an invalid token", async () => {
    const result = await verifyPreviewToken("not-a-token");
    expect(result).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const issued = await issuePreviewToken({
      previewId: "pv-2",
      userId: "u1",
      profileFingerprint: "fp",
      understandingRevision: 0,
      patch: examplePatch,
      changeSummary: [],
    });
    process.env.RETUNE_PREVIEW_SECRET = "different-secret-now";
    const verified = await verifyPreviewToken(issued.token);
    expect(verified).toBeNull();
  });

  it("rejects an expired token", async () => {
    const issued = await issuePreviewToken({
      previewId: "pv-3",
      userId: "u1",
      profileFingerprint: "fp",
      understandingRevision: 0,
      patch: examplePatch,
      changeSummary: [],
      ttlSeconds: 1,
    });
    await new Promise((r) => setTimeout(r, 1500));
    const verified = await verifyPreviewToken(issued.token);
    expect(verified).toBeNull();
  });
});
