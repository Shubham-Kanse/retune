/**
 * P0.3 — Output validation (OWASP LLM02 — Insecure Output Handling)
 *
 * Validates AI extraction output BEFORE it reaches storage.
 * Catches prompt leakage, hallucination, and malformed data.
 */

export interface OutputValidationResult {
  ok: boolean;
  violations: string[];
  sanitized: Record<string, unknown>;
}

// Patterns that indicate the model leaked system prompt or got confused
const LEAKAGE_PATTERNS = [
  /as an ai/i,
  /i cannot/i,
  /i'm sorry but/i,
  /as a language model/i,
  /i don't have access/i,
  /i apologize/i,
  /<\|im_start\|>/,
  /<\|im_end\|>/,
  /\bsystem:/i,
  /\bassistant:/i,
  /===RESUME_CONTENT_/,
];

const MAX_FIELD_LENGTHS: Record<string, number> = {
  fullName: 200,
  email: 320,
  phone: 50,
  location: 300,
  currentTitle: 200,
  linkedin: 500,
  github: 500,
  portfolio: 500,
  website: 500,
  visaStatus: 200,
  professionalSummary: 5000,
  summary: 5000,
  voiceNotes: 5000,
};

const MAX_ARRAY_CARDINALITY: Record<string, number> = {
  experience: 30,
  education: 20,
  certifications: 50,
  projects: 50,
  languages: 50,
  awards: 50,
  publications: 50,
  volunteering: 50,
  technicalSkills: 100,
  tools: 100,
  professionalSkills: 100,
  methodologies: 100,
  softSkills: 100,
  domainSkills: 100,
  summarySignals: 50,
  domainExperience: 50,
  careerHighlights: 50,
  targetRoles: 20,
  relocationPreferences: 20,
  skillsTier1: 50,
  skillsTier2: 50,
  skillsTier3: 50,
};

// Simple RFC-ish email check
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkStringForLeakage(value: string): string | null {
  for (const pattern of LEAKAGE_PATTERNS) {
    if (pattern.test(value)) return pattern.source;
  }
  return null;
}

export function validateExtractionOutput(
  extracted: Record<string, unknown>,
  _rawText: string,
): OutputValidationResult {
  const violations: string[] = [];
  const sanitized = { ...extracted };

  // Check string fields for leakage and length
  for (const [key, maxLen] of Object.entries(MAX_FIELD_LENGTHS)) {
    const val = sanitized[key];
    if (typeof val === "string") {
      const leak = checkStringForLeakage(val);
      if (leak) {
        violations.push(`${key}: contains suspicious pattern "${leak}"`);
        sanitized[key] = null; // Drop the field
      } else if (val.length > maxLen) {
        violations.push(`${key}: exceeds max length (${val.length} > ${maxLen})`);
        sanitized[key] = val.slice(0, maxLen);
      }
    }
  }

  // Validate email format
  const email = sanitized.email;
  if (typeof email === "string" && email.length > 0 && !EMAIL_RE.test(email)) {
    violations.push(`email: invalid format "${email}"`);
    sanitized.email = "";
  }

  // Check array cardinality
  for (const [key, maxLen] of Object.entries(MAX_ARRAY_CARDINALITY)) {
    const val = sanitized[key];
    if (Array.isArray(val) && val.length > maxLen) {
      violations.push(`${key}: array too large (${val.length} > ${maxLen}), likely hallucination`);
      sanitized[key] = val.slice(0, maxLen);
    }
  }

  // Check array string items for leakage
  for (const key of ["technicalSkills", "tools", "professionalSkills", "methodologies", "softSkills", "domainSkills", "summarySignals", "domainExperience", "careerHighlights", "targetRoles"]) {
    const arr = sanitized[key];
    if (Array.isArray(arr)) {
      sanitized[key] = arr.filter((item) => {
        if (typeof item !== "string") return true;
        const leak = checkStringForLeakage(item);
        if (leak) {
          violations.push(`${key}[]: item contains suspicious pattern "${leak}"`);
          return false;
        }
        return true;
      });
    }
  }

  // Check experience entries for leakage in descriptions/achievements
  if (Array.isArray(sanitized.experience)) {
    for (const exp of sanitized.experience as Array<Record<string, unknown>>) {
      if (typeof exp.description === "string") {
        const leak = checkStringForLeakage(exp.description);
        if (leak) {
          violations.push(`experience[].description: contains suspicious pattern "${leak}"`);
          exp.description = "";
        }
      }
      if (Array.isArray(exp.achievements)) {
        exp.achievements = (exp.achievements as string[]).filter((a) => {
          if (typeof a !== "string") return true;
          return !checkStringForLeakage(a);
        });
      }
    }
  }

  const ok = violations.length === 0;
  return { ok, violations, sanitized };
}
