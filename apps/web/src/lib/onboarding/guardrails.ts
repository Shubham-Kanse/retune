const INJECTION_PATTERNS = [
  /ignore.*(?:previous|above|system)/gi,
  /you are now/gi,
  /system prompt/gi,
  /\[SYSTEM/gi,
  /\[CONTEXT/gi,
  /developer message/gi,
  /mark (?:onboarding )?(?:done|complete|completed)/gi,
  /set .*onboarding.*(?:true|complete|completed)/gi,
];

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  /\b(?:sk|pk|rk|ghp|gho|ghu|ghs)_[A-Za-z0-9_]{20,}\b/g,
];

export function applyInputGuardrails(text: string): { text: string; blocked: boolean; reason?: string } {
  if (!text.trim()) return { text: "", blocked: true, reason: "empty_input" };
  const injectionHits = INJECTION_PATTERNS.filter((pat) => pat.test(text)).length;
  for (const pat of INJECTION_PATTERNS) pat.lastIndex = 0;
  if (injectionHits > 0 && text.trim().length < 120 && !looksLikeProfileFact(text)) {
    return { text: "", blocked: true, reason: "prompt_injection" };
  }
  let result = text.length > 2000 ? text.slice(0, 2000) : text;
  for (const pat of INJECTION_PATTERNS) result = result.replace(pat, "");
  for (const pat of PII_PATTERNS) result = result.replace(pat, "[REDACTED]");
  return { text: result, blocked: false };
}

function looksLikeProfileFact(text: string): boolean {
  return /@|linkedin|github|portfolio|worked|built|led|managed|degree|university|college|skill|skills|role|market|remote|hybrid|onsite/i.test(text);
}

export function stripOutputLeaks(text: string): string {
  return text.replace(/\[(?:CONTEXT|SYSTEM|PROFILE CONTEXT|QUESTION|ROLE|OUTPUT RULES|IMPORTANT)[^\]]*\]/g, "").trim();
}

export function isDuplicateMessage(newMsg: string, lastMsg: string | undefined): boolean {
  if (!lastMsg) return false;
  return newMsg.trim().toLowerCase() === lastMsg.trim().toLowerCase();
}
