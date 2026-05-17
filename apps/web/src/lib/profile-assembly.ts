import { computeCompletenessScore } from "@retune/db";

export type LooseProfile = Record<string, unknown>;

export interface NormalizedProfile {
  fullName: string;
  email: string;
  phone: string | null;
  linkedin: string | null;
  location: string;
  visaStatus: string | null;
  currentTitle: string | null;
  relocationPreferences: string[];
  targetRoles: string[];
  experienceLevel: string;
  experience: unknown[];
  education: unknown[];
  certifications: unknown[];
  projects: unknown[];
  skillsTier1: unknown[];
  skillsTier2: unknown[];
  skillsTier3: unknown[];
  voiceNotes: string | null;
}

export interface AssembledProfile {
  normalized: NormalizedProfile;
  profileMarkdown: string;
  completenessScore: number;
  dbValues: {
    fullName: string;
    email: string;
    phone: string | null;
    linkedin: string | null;
    location: string;
    visaStatus: string | null;
    currentTitle: string | null;
    relocationPreferences: string | null;
    targetRoles: string;
    experienceLevel: string;
    experience: string;
    education: string;
    certifications: string;
    projects: string;
    skillsTier1: string;
    skillsTier2: string;
    skillsTier3: string;
    voiceNotes: string | null;
    profileMarkdown: string;
    completenessScore: number;
    updatedAt: Date;
  };
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "")).filter((x) => x.trim().length > 0);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function toUnknownArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function skillLabel(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "name" in entry) {
    const name = (entry as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

export function normalizeProfileInput(profile: LooseProfile, ctx: { userEmail: string }): NormalizedProfile {
  return {
    fullName: asString(profile.fullName),
    email: asString(profile.email) || ctx.userEmail,
    phone: asStringOrNull(profile.phone),
    linkedin: asStringOrNull(profile.linkedin),
    location: asString(profile.location),
    visaStatus: asStringOrNull(profile.visaStatus),
    currentTitle: asStringOrNull(profile.currentTitle),
    relocationPreferences: toStringArray(profile.relocationPreferences),
    targetRoles: toStringArray(profile.targetRoles),
    experienceLevel: asString(profile.experienceLevel) || "mid",
    experience: toUnknownArray(profile.experience),
    education: toUnknownArray(profile.education),
    certifications: toUnknownArray(profile.certifications),
    projects: toUnknownArray(profile.projects),
    skillsTier1: toUnknownArray(profile.skillsTier1),
    skillsTier2: toUnknownArray(profile.skillsTier2),
    skillsTier3: toUnknownArray(profile.skillsTier3),
    voiceNotes: asStringOrNull(profile.voiceNotes) ?? asStringOrNull(profile.summary),
  };
}

export function buildProfileMarkdown(profile: NormalizedProfile): string {
  return [
    profile.fullName ? `# ${profile.fullName}` : "",
    profile.currentTitle ?? "",
    profile.location ? `**Location:** ${profile.location}` : "",
    profile.targetRoles.length ? `**Target Roles:** ${profile.targetRoles.join(", ")}` : "",
    profile.experience.length
      ? `## Experience\n${profile.experience
          .map((entry) => {
            const e = (entry ?? {}) as {
              title?: string;
              company?: string;
              startDate?: string;
              endDate?: string;
              description?: string;
            };
            return `### ${e.title ?? "Role"} - ${e.company ?? "Company"}\n${[e.startDate, e.endDate]
              .filter(Boolean)
              .join(" – ")}\n${e.description ?? ""}`;
          })
          .join("\n\n")}`
      : "",
    profile.education.length
      ? `## Education\n${profile.education
          .map((entry) => {
            const e = (entry ?? {}) as { degree?: string; institution?: string };
            return `${e.degree ?? ""}${e.degree && e.institution ? " - " : ""}${e.institution ?? ""}`;
          })
          .filter(Boolean)
          .join("\n")}`
      : "",
    profile.skillsTier1.length
      ? `## Skills\n${profile.skillsTier1.map(skillLabel).filter(Boolean).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function assembleProfile(profile: LooseProfile, ctx: { userEmail: string; now?: Date }): AssembledProfile {
  const now = ctx.now ?? new Date();
  const normalized = normalizeProfileInput(profile, { userEmail: ctx.userEmail });
  const profileMarkdown = buildProfileMarkdown(normalized);
  const completenessScore = computeCompletenessScore({
    ...normalized,
    summary: profile.summary,
  });

  return {
    normalized,
    profileMarkdown,
    completenessScore,
    dbValues: {
      fullName: normalized.fullName,
      email: normalized.email,
      phone: normalized.phone,
      linkedin: normalized.linkedin,
      location: normalized.location,
      visaStatus: normalized.visaStatus,
      currentTitle: normalized.currentTitle,
      relocationPreferences: normalized.relocationPreferences.length ? JSON.stringify(normalized.relocationPreferences) : null,
      targetRoles: JSON.stringify(normalized.targetRoles),
      experienceLevel: normalized.experienceLevel,
      experience: JSON.stringify(normalized.experience),
      education: JSON.stringify(normalized.education),
      certifications: JSON.stringify(normalized.certifications),
      projects: JSON.stringify(normalized.projects),
      skillsTier1: JSON.stringify(normalized.skillsTier1),
      skillsTier2: JSON.stringify(normalized.skillsTier2),
      skillsTier3: JSON.stringify(normalized.skillsTier3),
      voiceNotes: normalized.voiceNotes,
      profileMarkdown,
      completenessScore,
      updatedAt: now,
    },
  };
}

export function findMissingCoreFields(profile: LooseProfile): string[] {
  const missing: string[] = [];
  if (!asString(profile.fullName)) missing.push("fullName");
  if (!asString(profile.currentTitle)) missing.push("currentTitle");
  if (!asString(profile.experienceLevel)) missing.push("experienceLevel");
  if (!asString(profile.location)) missing.push("location");
  const roles = toStringArray(profile.targetRoles);
  if (roles.length === 0) missing.push("targetRoles");
  return missing;
}


