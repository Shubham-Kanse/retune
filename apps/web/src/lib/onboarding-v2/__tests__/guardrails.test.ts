import { describe, expect, it } from "vitest";
import {
  safeParseLLMJson,
  stripPII,
  stripPIIFromExtraction,
  truncateForContext,
  verifyExtractionAgainstSource,
} from "../llm/guardrails";
import { EXPECTED_EXTRACTION, SAMPLE_RESUME_TEXT } from "./fixtures";

function fixtureIdentity() {
  const identity = EXPECTED_EXTRACTION.identity;
  if (!identity) throw new Error("Expected extraction fixture identity");
  return identity;
}

describe("safeParseLLMJson", () => {
  const validator = (p: unknown) => ({
    valid: typeof p === "object" && p !== null,
    result: p as Record<string, unknown>,
    errors: [],
  });

  it("parses plain JSON", () => {
    const r = safeParseLLMJson('{"a":1}', validator);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const r = safeParseLLMJson('```json\n{"a":1}\n```', validator);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    const r = safeParseLLMJson('```\n{"a":1}\n```', validator);
    expect(r.success).toBe(true);
  });

  it("extracts JSON from surrounding prose", () => {
    const r = safeParseLLMJson('Here is the answer: {"x":42} hope that helps!', validator);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ x: 42 });
  });

  it("fails cleanly on garbage", () => {
    const r = safeParseLLMJson("not json", validator);
    expect(r.success).toBe(false);
  });

  it("respects the validator", () => {
    const r = safeParseLLMJson('"plain string"', () => ({
      valid: false,
      result: null,
      errors: ["wrong shape"],
    }));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors).toContain("wrong shape");
  });
});

describe("stripPII", () => {
  it("redacts SSN-style numbers", () => {
    expect(stripPII("My SSN is 123-45-6789.")).toContain("[REDACTED]");
  });

  it("redacts credit card numbers", () => {
    expect(stripPII("Card 4111 1111 1111 1111")).toContain("[REDACTED]");
  });

  it("redacts passport markers", () => {
    expect(stripPII("Passport: AB1234567")).toContain("[REDACTED]");
  });

  it("leaves normal resume text alone", () => {
    const text = "Senior Engineer at Stripe focused on payment APIs.";
    expect(stripPII(text)).toBe(text);
  });
});

describe("stripPIIFromExtraction", () => {
  it("clears phone-like values that match SSN patterns", () => {
    const ext = {
      ...EXPECTED_EXTRACTION,
      identity: { ...fixtureIdentity(), phone: "123-45-6789" },
    };
    const cleaned = stripPIIFromExtraction(ext);
    expect(cleaned.identity?.phone).toBeNull();
  });

  it("leaves real phone numbers untouched", () => {
    const ext = {
      ...EXPECTED_EXTRACTION,
      identity: { ...fixtureIdentity(), phone: "+353 87 123 4567" },
    };
    const cleaned = stripPIIFromExtraction(ext);
    expect(cleaned.identity?.phone).toBe("+353 87 123 4567");
  });
});

describe("truncateForContext", () => {
  it("returns short text unchanged", () => {
    expect(truncateForContext("hello", 100)).toBe("hello");
  });

  it("truncates and inserts a marker", () => {
    const long = "a".repeat(1000);
    const out = truncateForContext(long, 200);
    expect(out).toContain("[... content truncated for processing ...]");
    expect(out.length).toBeLessThan(long.length);
  });
});

describe("verifyExtractionAgainstSource", () => {
  it("passes when all entities exist in source", () => {
    const r = verifyExtractionAgainstSource(EXPECTED_EXTRACTION, SAMPLE_RESUME_TEXT);
    expect(r.verified).toBe(true);
    expect(r.suspiciousFields).toHaveLength(0);
  });

  it("flags hallucinated companies", () => {
    const ext = {
      ...EXPECTED_EXTRACTION,
      experience: [
        {
          ...EXPECTED_EXTRACTION.experience[0],
          company: "TotallyMadeUpCompanyXYZ",
        },
      ],
    };
    const r = verifyExtractionAgainstSource(ext, SAMPLE_RESUME_TEXT);
    expect(r.verified).toBe(false);
    expect(r.suspiciousFields[0]).toContain("TotallyMadeUpCompanyXYZ");
  });

  it("flags hallucinated full names", () => {
    const ext = {
      ...EXPECTED_EXTRACTION,
      identity: { ...fixtureIdentity(), full_name: "Zzqwertasdf" },
    };
    const r = verifyExtractionAgainstSource(ext, SAMPLE_RESUME_TEXT);
    expect(r.verified).toBe(false);
  });
});
