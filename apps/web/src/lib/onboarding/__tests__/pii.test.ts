import { describe, expect, it } from "vitest";
import { scrubPii } from "../pii";

describe("scrubPii", () => {
  it("scrubs email addresses", () => {
    const result = scrubPii({ message: "Contact john@example.com for details" });
    expect(result.message).toBe("Contact <email> for details");
  });

  it("scrubs phone numbers", () => {
    const result = scrubPii({ info: "Call +1 555-123-4567 or 0851234567" });
    expect(result.info).not.toContain("555-123-4567");
    expect(result.info).toContain("<phone>");
  });

  it("scrubs fullName fields", () => {
    const result = scrubPii({ fullName: "John Doe", email: "test@test.com" });
    expect(result.fullName).toBe("J***");
    expect(result.email).toBe("<email>");
  });

  it("scrubs name field", () => {
    const result = scrubPii({ name: "Jane Smith" });
    expect(result.name).toBe("J***");
  });

  it("handles nested objects", () => {
    const result = scrubPii({ user: { fullName: "Bob", email: "bob@test.com" } });
    expect((result.user as any).fullName).toBe("B***");
    expect((result.user as any).email).toBe("<email>");
  });

  it("handles arrays", () => {
    const result = scrubPii({ contacts: ["john@test.com", "plain text"] });
    expect((result.contacts as string[])[0]).toBe("<email>");
    expect((result.contacts as string[])[1]).toBe("plain text");
  });

  it("passes through non-PII fields unchanged", () => {
    const result = scrubPii({ filename: "resume.pdf", size: 1024 });
    expect(result.filename).toBe("resume.pdf");
    expect(result.size).toBe(1024);
  });

  it("handles empty name field", () => {
    const result = scrubPii({ fullName: "" });
    expect(result.fullName).toBe("<redacted>");
  });
});
