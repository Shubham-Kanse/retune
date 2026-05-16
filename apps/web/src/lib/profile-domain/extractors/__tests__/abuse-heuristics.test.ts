import { describe, expect, it } from "vitest";
import { detectAbuse } from "../abuse-heuristics";

describe("detectAbuse", () => {
  it("passes normal resume text", () => {
    const text = "John Doe\njohn@email.com\nSenior Engineer at Google\n" + "Built payment systems. ".repeat(20);
    const result = detectAbuse({ buffer: Buffer.from(text), rawText: text });
    expect(result.rejected).toBe(false);
  });

  it("rejects text exceeding 50k chars", () => {
    const text = "x".repeat(51_000);
    const result = detectAbuse({ buffer: Buffer.from(text), rawText: text });
    expect(result.rejected).toBe(true);
    expect(result.flags).toContain("text_too_long");
  });

  it("rejects highly repetitive content", () => {
    const line = "This is a repeated line for token grinding purposes.";
    const text = Array.from({ length: 100 }, () => line).join("\n");
    const result = detectAbuse({ buffer: Buffer.from(text), rawText: text });
    expect(result.rejected).toBe(true);
    expect(result.flags).toContain("high_repetition");
  });

  it("rejects binary-like content (high avg word length)", () => {
    const text = Array.from({ length: 50 }, () => "a".repeat(20)).join(" ");
    const result = detectAbuse({ buffer: Buffer.from(text), rawText: text });
    expect(result.rejected).toBe(true);
    expect(result.flags).toContain("high_avg_word_length");
  });

  it("passes content with some repetition below threshold", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Line ${i}: unique content here`);
    lines.push(lines[0]!); // One duplicate
    const text = lines.join("\n");
    const result = detectAbuse({ buffer: Buffer.from(text), rawText: text });
    expect(result.rejected).toBe(false);
  });
});
