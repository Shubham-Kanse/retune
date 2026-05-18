// Onboarding V2 — LLM Output Guardrails

import { LONG_RESUME_CHAR_LIMIT } from "../constants";
import type { ExtractionSchema } from "../types";

// --- JSON Parsing Guardrail ---

export function safeParseLLMJson<T>(
  raw: string,
  validator: (parsed: unknown) => { valid: boolean; result: T | null; errors: string[] },
): { success: true; data: T } | { success: false; errors: string[]; rawOutput: string } {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return { success: false, errors: ["Failed to parse JSON from LLM output"], rawOutput: raw };
      }
    } else {
      return { success: false, errors: ["No JSON found in LLM output"], rawOutput: raw };
    }
  }

  const validation = validator(parsed);
  if (!validation.valid || !validation.result) {
    return { success: false, errors: validation.errors, rawOutput: raw };
  }
  return { success: true, data: validation.result };
}

// --- PII Stripping ---

const PII_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN (US)
  /\b\d{9}\b/, // SSN without dashes
  /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card
  /\bPPS\s?\d{7}[A-Z]{1,2}\b/i, // Irish PPS
  /\bpassport\s*:?\s*[A-Z0-9]{6,12}\b/i, // Passport
  /\bnational\s*id\s*:?\s*\S+/i, // National ID
];

export function stripPII(text: string): string {
  let cleaned = text;
  for (const pattern of PII_PATTERNS) {
    cleaned = cleaned.replace(pattern, "[REDACTED]");
  }
  return cleaned;
}

export function stripPIIFromExtraction(extraction: ExtractionSchema): ExtractionSchema {
  if (!extraction.identity) return extraction;
  const identity = { ...extraction.identity };
  // Remove phone-like fields that match PII patterns
  if (identity.phone) {
    for (const pattern of PII_PATTERNS) {
      if (pattern.test(identity.phone)) {
        identity.phone = null;
        break;
      }
    }
  }
  return { ...extraction, identity };
}

// --- Token Limit / Truncation ---

export function truncateForContext(
  text: string,
  maxChars: number = LONG_RESUME_CHAR_LIMIT,
): string {
  if (text.length <= maxChars) return text;
  const keepStart = Math.floor(maxChars * 0.6);
  const keepEnd = Math.floor(maxChars * 0.2);
  return `${text.slice(0, keepStart)}\n\n[... content truncated for processing ...]\n\n${text.slice(-keepEnd)}`;
}

// --- Hallucination Check ---

export function verifyExtractionAgainstSource(
  extraction: ExtractionSchema,
  sourceText: string,
): { verified: boolean; suspiciousFields: string[] } {
  const suspicious: string[] = [];
  const sourceLower = sourceText.toLowerCase();

  for (const exp of extraction.experience || []) {
    if (exp.company && !sourceLower.includes(exp.company.toLowerCase().slice(0, 5))) {
      suspicious.push(`experience.company: "${exp.company}"`);
    }
  }

  for (const edu of extraction.education || []) {
    if (edu.institution && !sourceLower.includes(edu.institution.toLowerCase().slice(0, 5))) {
      suspicious.push(`education.institution: "${edu.institution}"`);
    }
  }

  if (extraction.identity?.full_name) {
    const parts = extraction.identity.full_name.toLowerCase().split(/\s+/);
    const found = parts.some((p) => p.length > 2 && sourceLower.includes(p));
    if (!found) suspicious.push(`identity.full_name: "${extraction.identity.full_name}"`);
  }

  return { verified: suspicious.length === 0, suspiciousFields: suspicious };
}
