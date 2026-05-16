/**
 * Schema-validated profile writer.
 *
 * Consumes a RouterDecision from text-router.ts and applies it to the
 * profile ONLY if the value passes the field's schema check. Layer 3 of
 * the SOTA onboarding pipeline.
 *
 * Every successful write:
 *   - sets source: "user", confidence: 1, confirmed: true
 *   - stamps lastUpdatedAt
 *   - returns a human-readable summary so the copywriter can echo it back
 *
 * Every rejected write returns a structured reason so the planner can
 * react (re-ask, clarify, etc.) instead of silently dropping input.
 */
import type { RouterDecision, RouterField } from "./text-router";
import type {
  EducationEntry,
  ExperienceEntry,
  SessionState,
  UserCareerProfile,
} from "./types";
import { attachFieldEdit } from "./career-profile.schema";

export type ApplyResult =
  | { ok: true; field: RouterField; summary: string; previousValue: unknown }
  | { ok: false; field?: RouterField; reason: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^(https?:\/\/|www\.|linkedin\.com\/)/i;

const WORK_PREFERENCES = new Set(["remote", "hybrid", "onsite", "open"]);
const CAREER_DIRECTIONS = new Set(["same", "slight_shift", "major_switch", "not_sure"]);

// ─── Public entry point ──────────────────────────────────────────────────────

export function applyRouterDecision(
  stored: SessionState,
  decision: RouterDecision,
): ApplyResult {
  if (decision.intent !== "answer_current" && decision.intent !== "edit_field") {
    return { ok: false, reason: `non_writing_intent:${decision.intent}` };
  }

  const { field, value } = decision;
  const profile = stored.profile;
  const now = new Date().toISOString();

  switch (field) {
    case "identity.fullName":
      return writeString(profile, ["identity", "fullName"], value, now, "name", (v) => v.length >= 2);
    case "identity.email":
      return writeString(profile, ["identity", "email"], value, now, "email", (v) => EMAIL_RE.test(v));
    case "identity.phone":
      return writeString(profile, ["identity", "phone"], value, now, "phone", (v) => /[\d]/.test(v) && v.length >= 5);
    case "identity.location":
      return writeString(profile, ["identity", "location"], value, now, "location", (v) => v.length >= 2);
    case "identity.linkedin":
      return writeString(profile, ["identity", "linkedin"], value, now, "LinkedIn", (v) => URL_RE.test(v) || v.length >= 3);

    case "professionalProfile.professionalIdentities":
      return writeStringArray(profile, ["professionalProfile", "professionalIdentities"], value, now, "professional identities");
    case "professionalProfile.currentTitles":
      return writeStringArray(profile, ["professionalProfile", "currentTitles"], value, now, "current titles");

    case "careerIntent.interestedRoles":
      return writeStringArray(profile, ["careerIntent", "interestedRoles"], value, now, "interested roles");
    case "careerIntent.preferredMarkets":
      return writeStringArray(profile, ["careerIntent", "preferredMarkets"], value, now, "preferred markets");
    case "careerIntent.workPreference":
      return writeEnum(profile, ["careerIntent", "workPreference"], value, now, "work preference", WORK_PREFERENCES);
    case "careerIntent.careerDirection":
      return writeEnum(profile, ["careerIntent", "careerDirection"], value, now, "career direction", CAREER_DIRECTIONS);
    case "careerIntent.seniorityComfort":
      return writeStringArray(profile, ["careerIntent", "seniorityComfort"], value, now, "seniority comfort");
    case "careerIntent.industriesOfInterest":
      return writeStringArray(profile, ["careerIntent", "industriesOfInterest"], value, now, "industries of interest");

    case "resumeWritingPreferences.emphasisAreas":
      return writeStringArray(profile, ["resumeWritingPreferences", "emphasisAreas"], value, now, "emphasis areas");
    case "resumeWritingPreferences.deEmphasisAreas":
      return writeStringArray(profile, ["resumeWritingPreferences", "deEmphasisAreas"], value, now, "de-emphasis areas");
    case "resumeWritingPreferences.toneSignals":
      return writeStringArray(profile, ["resumeWritingPreferences", "toneSignals"], value, now, "tone signals");

    case "resumeWritingPreferences.styleConstraints":
      return writeStringArray(profile, ["resumeWritingPreferences", "styleConstraints"], value, now, "style constraints");

    case "careerIntent.roleDealbreakers":
      return writeStringArray(profile, ["careerIntent", "roleDealbreakers"], value, now, "role dealbreakers");

    case "skills":
      return writeSkills(profile, value, now);
    case "experience":
      return writeExperience(profile, value, now);
    case "education":
      return writeEducation(profile, value, now);

    default:
      return { ok: false, field, reason: "unsupported_field" };
  }
}

// ─── Field writers ───────────────────────────────────────────────────────────

function writeString(
  profile: UserCareerProfile,
  path: [string, string],
  raw: unknown,
  now: string,
  human: string,
  validate: (v: string) => boolean,
): ApplyResult {
  if (typeof raw !== "string") return { ok: false, reason: `expected_string:${human}` };
  const trimmed = raw.trim();
  if (!validate(trimmed)) return { ok: false, reason: `invalid_${human.replace(/\s+/g, "_")}` };

  const owner = (profile as any)[path[0]];
  const previous = owner[path[1]]?.value;
  owner[path[1]] = attachFieldEdit(owner[path[1]], trimmed, { source: "user", actor: "router", reason: `text:${human}`, confidence: 1, confirmed: true });
  return {
    ok: true,
    field: `${path[0]}.${path[1]}` as RouterField,
    summary: `Updated your ${human} to ${trimmed}.`,
    previousValue: previous,
  };
}

function writeStringArray(
  profile: UserCareerProfile,
  path: [string, string],
  raw: unknown,
  now: string,
  human: string,
): ApplyResult {
  const list = coerceStringArray(raw);
  if (!list.length) return { ok: false, reason: `empty_${human.replace(/\s+/g, "_")}` };

  const owner = (profile as any)[path[0]];
  const previous = owner[path[1]]?.value;
  owner[path[1]] = attachFieldEdit(owner[path[1]], list, { source: "user", actor: "router", reason: `text:${human}`, confidence: 1, confirmed: true });
  return {
    ok: true,
    field: `${path[0]}.${path[1]}` as RouterField,
    summary: `Updated your ${human} to ${list.join(", ")}.`,
    previousValue: previous,
  };
}

function writeEnum(
  profile: UserCareerProfile,
  path: [string, string],
  raw: unknown,
  now: string,
  human: string,
  allowed: Set<string>,
): ApplyResult {
  if (typeof raw !== "string") return { ok: false, reason: `expected_string:${human}` };
  const v = raw.trim().toLowerCase();
  if (!allowed.has(v)) return { ok: false, reason: `invalid_${human.replace(/\s+/g, "_")}_value` };

  const owner = (profile as any)[path[0]];
  const previous = owner[path[1]]?.value;
  owner[path[1]] = attachFieldEdit(owner[path[1]], v, { source: "user", actor: "router", reason: `text:${human}`, confidence: 1, confirmed: true });
  return {
    ok: true,
    field: `${path[0]}.${path[1]}` as RouterField,
    summary: `Set your ${human} to ${v}.`,
    previousValue: previous,
  };
}

function writeSkills(profile: UserCareerProfile, raw: unknown, now: string): ApplyResult {
  // Accepts either:
  //   { technical: string[], tools: string[], business: string[] }
  // or a flat string[] which becomes technical-only.
  let buckets: { technical: string[]; tools: string[]; business: string[] };
  if (Array.isArray(raw)) {
    buckets = { technical: coerceStringArray(raw), tools: [], business: [] };
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    buckets = {
      technical: coerceStringArray(obj.technical),
      tools: coerceStringArray(obj.tools),
      business: coerceStringArray(obj.business),
    };
  } else {
    return { ok: false, reason: "expected_skills_object_or_array" };
  }

  const total = buckets.technical.length + buckets.tools.length + buckets.business.length;
  if (total === 0) return { ok: false, reason: "no_skills_provided" };

  const previous = {
    technical: profile.skills.technical.value,
    tools: profile.skills.tools.value,
    business: profile.skills.business.value,
  };

  profile.skills.technical = attachFieldEdit(profile.skills.technical, buckets.technical, { source: "user", actor: "router", reason: "text:skills", confidence: 1, confirmed: true });
  profile.skills.tools = attachFieldEdit(profile.skills.tools, buckets.tools, { source: "user", actor: "router", reason: "text:skills", confidence: 1, confirmed: true });
  profile.skills.business = attachFieldEdit(profile.skills.business, buckets.business, { source: "user", actor: "router", reason: "text:skills", confidence: 1, confirmed: true });

  const parts = [
    buckets.technical.length ? `${buckets.technical.length} technical` : "",
    buckets.tools.length ? `${buckets.tools.length} tool` : "",
    buckets.business.length ? `${buckets.business.length} business` : "",
  ].filter(Boolean);
  return {
    ok: true,
    field: "skills",
    summary: `Updated your skills (${parts.join(", ")}).`,
    previousValue: previous,
  };
}

function writeExperience(profile: UserCareerProfile, raw: unknown, now: string): ApplyResult {
  if (!Array.isArray(raw)) return { ok: false, reason: "expected_experience_array" };
  const entries: ExperienceEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const company = typeof item.company === "string" ? item.company.trim() : "";
    if (!title || !company) continue;
    entries.push({
      id: typeof item.id === "string" ? item.id : `exp-${Date.now()}-${i}`,
      title,
      company,
      location: typeof item.location === "string" ? item.location : undefined,
      startDate: typeof item.startDate === "string" ? item.startDate : undefined,
      endDate: typeof item.endDate === "string" ? item.endDate : undefined,
      isCurrent: typeof item.isCurrent === "boolean" ? item.isCurrent : undefined,
      responsibilities: coerceStringArray(item.responsibilities),
      achievements: coerceStringArray(item.achievements),
      tools: coerceStringArray(item.tools),
      skills: coerceStringArray(item.skills),
      domain: typeof item.domain === "string" ? item.domain : undefined,
      confidence: typeof item.confidence === "number" ? item.confidence : 1,
    });
  }
  if (!entries.length) return { ok: false, reason: "no_valid_experience_entries" };

  const previous = profile.experience.value;
  profile.experience = attachFieldEdit(profile.experience, entries, { source: "user", actor: "router", reason: "text:experience", confidence: 1, confirmed: true });
  return {
    ok: true,
    field: "experience",
    summary: `Updated your experience (${entries.length} role${entries.length === 1 ? "" : "s"}).`,
    previousValue: previous,
  };
}

function writeEducation(profile: UserCareerProfile, raw: unknown, now: string): ApplyResult {
  if (!Array.isArray(raw)) return { ok: false, reason: "expected_education_array" };
  const entries: EducationEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;
    const degree = typeof item.degree === "string" ? item.degree.trim() : "";
    const institution = typeof item.institution === "string" ? item.institution.trim() : "";
    if (!degree || !institution) continue;
    entries.push({
      id: typeof item.id === "string" ? item.id : `edu-${Date.now()}-${i}`,
      degree,
      institution,
      fieldOfStudy: typeof item.fieldOfStudy === "string" ? item.fieldOfStudy : undefined,
      startDate: typeof item.startDate === "string" ? item.startDate : undefined,
      endDate: typeof item.endDate === "string" ? item.endDate : undefined,
      graduationYear:
        typeof item.graduationYear === "string"
          ? item.graduationYear
          : typeof item.endDate === "string"
            ? item.endDate
            : undefined,
      location: typeof item.location === "string" ? item.location : undefined,
      grade: typeof item.grade === "string" ? item.grade : undefined,
    });
  }
  if (!entries.length) return { ok: false, reason: "no_valid_education_entries" };

  const previous = profile.education.value;
  profile.education = attachFieldEdit(profile.education, entries, { source: "user", actor: "router", reason: "text:education", confidence: 1, confirmed: true });
  return {
    ok: true,
    field: "education",
    summary: `Updated your education (${entries.length} entr${entries.length === 1 ? "y" : "ies"}).`,
    previousValue: previous,
  };
}

// ─── Coercion helpers ────────────────────────────────────────────────────────

function coerceStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  }
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter((v): v is string => v.length > 0),
      ),
    ];
  }
  return [];
}
