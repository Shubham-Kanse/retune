/**
 * field-parser.ts
 * Deterministic extraction of structured fields from free-form user text.
 * No AI involved — regex + keyword matching only.
 * Only fall through to AI if these return null.
 */

import type { ExperienceLevel } from "@/lib/profile-domain/enums";

export interface ParsedFields {
  fullName?: string;
  currentTitle?: string;
  company?: string;
  location?: string;
  experienceLevel?: ExperienceLevel;
  yearsHint?: number;
  targetRoles?: string[];
  visaStatus?: string;
  linkedin?: string;
  phone?: string;
  email?: string;
}

// ─── Experience level ─────────────────────────────────────────────────────────

const LEVEL_PATTERNS: Array<[RegExp, ExperienceLevel]> = [
  [/\b(0|1|2)\s*(?:year|yr)/i, "entry"],
  [/\bentry[\s-]?level\b/i, "entry"],
  [/\bjunior\b/i, "entry"],
  [/\b(2|3|4)\s*(?:year|yr)/i, "early"],
  [/\bearly[\s-]?career\b/i, "early"],
  [/\b(4|5|6|7)\s*(?:year|yr)/i, "mid"],
  [/\bmid[\s-]?level\b/i, "mid"],
  [/\b(7|8|9|10)\s*(?:year|yr)/i, "senior"],
  [/\bsenior\b/i, "senior"],
  [/\b(10|11|12|13|14|15|\d{2})\s*(?:year|yr)/i, "staff"],
  [/\b(staff|principal|lead|architect)\b/i, "staff"],
];

export function parseExperienceLevel(text: string): ExperienceLevel | null {
  for (const [re, level] of LEVEL_PATTERNS) {
    if (re.test(text)) return level;
  }
  return null;
}

// ─── Years hint ───────────────────────────────────────────────────────────────

export function parseYearsHint(text: string): number | null {
  const m = text.match(/\b(\d+)\s*(?:\+\s*)?(?:year|yr)/i);
  return m?.[1] != null ? parseInt(m[1], 10) : null;
}

// ─── Location ─────────────────────────────────────────────────────────────────

export function parseLocation(text: string): string | null {
  const m = text.match(/\b(?:based|located|living|from|in)\s+(?:in\s+)?([A-Z][a-zA-Z\s,]+?)(?:\.|,|$)/);
  return m?.[1]?.trim() ?? null;
}

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

export function parseLinkedin(text: string): string | null {
  const m = text.match(/(?:linkedin\.com\/in\/)([\w-]+)/i);
  return m ? `https://linkedin.com/in/${m[1]}` : null;
}

// ─── Email ────────────────────────────────────────────────────────────────────

export function parseEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// ─── Phone ────────────────────────────────────────────────────────────────────

export function parsePhone(text: string): string | null {
  const m = text.match(/(?:\+?\d[\d\s\-().]{7,}\d)/);
  return m ? m[0].trim() : null;
}

// ─── Company from "at <Company>" ─────────────────────────────────────────────

export function parseCompany(text: string): string | null {
  const m = text.match(/\bat\s+([A-Z][a-zA-Z0-9\s&.,'-]{1,60}?)(?:\s+(?:for|since|from|as|where|,|\.|$))/);
  return m?.[1]?.trim() ?? null;
}

// ─── Title from "I'm a/an X" or "I work as X" ────────────────────────────────

const TITLE_PATTERNS = [
  /\bI(?:'m| am)\s+(?:a|an)\s+([A-Z][a-zA-Z\s]+?)(?:\s+at|\s+with|\s+for|,|\.|$)/i,
  /\bwork(?:ing)?\s+as\s+(?:a|an)?\s*([A-Z][a-zA-Z\s]+?)(?:\s+at|\s+with|,|\.|$)/i,
  /\bmy\s+(?:current\s+)?(?:role|title|position)\s+is\s+([A-Z][a-zA-Z\s]+?)(?:\s+at|,|\.|$)/i,
];

export function parseTitle(text: string): string | null {
  for (const re of TITLE_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ─── Visa / work auth ─────────────────────────────────────────────────────────

const VISA_MAP: Array<[RegExp, string]> = [
  [/\bcitizen\b/i, "Citizen"],
  [/\bpermanent\s+resident\b|PR\b/i, "Permanent Resident"],
  [/\bwork\s+visa\b|H-?1B|L-?1/i, "Work Visa"],
  [/\bstudent\s+visa\b|F-?1\b/i, "Student Visa"],
  [/\bneed\s+sponsor/i, "Need Sponsorship"],
  [/\bopen\s+to\s+work\b/i, "Citizen"],
];

export function parseVisaStatus(text: string): string | null {
  for (const [re, status] of VISA_MAP) {
    if (re.test(text)) return status;
  }
  return null;
}

// ─── Aggregate parser ─────────────────────────────────────────────────────────

/**
 * Run all deterministic parsers over a user message.
 * Returns only the fields that were confidently found.
 */
export function parseUserMessage(text: string): ParsedFields {
  const result: ParsedFields = {};

  const level = parseExperienceLevel(text);
  if (level) result.experienceLevel = level;

  const years = parseYearsHint(text);
  if (years !== null) result.yearsHint = years;

  const location = parseLocation(text);
  if (location) result.location = location;

  const linkedin = parseLinkedin(text);
  if (linkedin) result.linkedin = linkedin;

  const email = parseEmail(text);
  if (email) result.email = email;

  const phone = parsePhone(text);
  if (phone) result.phone = phone;

  const company = parseCompany(text);
  if (company) result.company = company;

  const title = parseTitle(text);
  if (title) result.currentTitle = title;

  const visa = parseVisaStatus(text);
  if (visa) result.visaStatus = visa;

  return result;
}
