const INJECTION_PATTERNS = [
  /ignore.*(?:previous|above|system)/gi,
  /you are now/gi,
  /system prompt/gi,
  /\[SYSTEM/gi,
  /\[CONTEXT/gi,
];

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
];

export function applyInputGuardrails(text: string): { text: string; blocked: boolean; reason?: string } {
  if (!text.trim()) return { text: "", blocked: true, reason: "empty_input" };
  let result = text.length > 2000 ? text.slice(0, 2000) : text;
  for (const pat of INJECTION_PATTERNS) result = result.replace(pat, "");
  for (const pat of PII_PATTERNS) result = result.replace(pat, "[REDACTED]");
  return { text: result, blocked: false };
}

export function stripOutputLeaks(text: string): string {
  return text.replace(/\[(?:CONTEXT|SYSTEM|PROFILE CONTEXT|QUESTION|ROLE|OUTPUT RULES|IMPORTANT)[^\]]*\]/g, "").trim();
}

export function isDuplicateMessage(newMsg: string, lastMsg: string | undefined): boolean {
  if (!lastMsg) return false;
  return newMsg.trim().toLowerCase() === lastMsg.trim().toLowerCase();
}
