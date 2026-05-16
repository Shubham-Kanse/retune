/**
 * P0.5 — PII-safe logging (OWASP LLM06 — Sensitive Information Disclosure)
 *
 * Scrubs personally identifiable information from log payloads.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;
const PII_FIELD_NAMES = new Set(["fullName", "full_name", "name", "firstName", "lastName", "first_name", "last_name"]);

export function scrubPii(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PII_FIELD_NAMES.has(key)) {
      if (typeof value === "string" && value.length > 0) {
        out[key] = value[0] + "***";
      } else {
        out[key] = "<redacted>";
      }
    } else if (typeof value === "string") {
      out[key] = value.replace(EMAIL_RE, "<email>").replace(PHONE_RE, "<phone>");
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = scrubPii(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => {
        if (typeof item === "string") return item.replace(EMAIL_RE, "<email>").replace(PHONE_RE, "<phone>");
        if (item && typeof item === "object") return scrubPii(item as Record<string, unknown>);
        return item;
      });
    } else {
      out[key] = value;
    }
  }
  return out;
}
