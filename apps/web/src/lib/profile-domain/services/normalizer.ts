import type { ProfileNormalized, SkillEntry } from "../contracts";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  const v = asString(value);
  return v.length ? v : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const v = asString(item);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function splitBullets(text: string): string[] {
  if (!text) return [];
  const normalized = text.includes("\n") ? text : text.split(/(?<=[.!?])\s+(?=[A-Z])/).join("\n");
  return normalized
    .split("\n")
    .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);
}

function dedupeSkills(value: unknown): SkillEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: SkillEntry[] = [];
  for (const raw of value) {
    const name = asString((raw as { name?: unknown })?.name);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name });
  }
  return out;
}

function inferTargetRoles(input: {
  currentTitle: string | null;
  experience: Array<{ title?: string | null }>;
}): string[] {
  const bag = [input.currentTitle ?? "", ...input.experience.map((e) => e.title ?? "")]
    .join(" ")
    .toLowerCase();
  const out: string[] = [];

  const add = (role: string) => {
    if (!out.includes(role)) out.push(role);
  };

  if (bag.includes("software engineer") || bag.includes("backend") || bag.includes("full stack")) {
    add("Software Engineer");
  }
  if (bag.includes("backend")) add("Backend Engineer");
  if (bag.includes("full stack") || bag.includes("fullstack")) add("Full Stack Engineer");
  if (bag.includes("frontend") || bag.includes("front end")) add("Frontend Engineer");
  if (bag.includes("devops") || bag.includes("platform")) add("Platform Engineer");
  if (bag.includes("data")) add("Data Engineer");
  if (bag.includes("mobile") || bag.includes("android") || bag.includes("ios")) add("Mobile Engineer");

  if (out.length === 0 && input.currentTitle) add(input.currentTitle);
  return out;
}

export function mergeProfiles(base: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  return {
    ...base,
    ...incoming,
    experience: [...(Array.isArray(base.experience) ? base.experience : []), ...(Array.isArray(incoming.experience) ? incoming.experience : [])],
    education: [...(Array.isArray(base.education) ? base.education : []), ...(Array.isArray(incoming.education) ? incoming.education : [])],
    certifications: [...(Array.isArray(base.certifications) ? base.certifications : []), ...(Array.isArray(incoming.certifications) ? incoming.certifications : [])],
    skillsTier1: [...(Array.isArray(base.skillsTier1) ? base.skillsTier1 : []), ...(Array.isArray(incoming.skillsTier1) ? incoming.skillsTier1 : [])],
    skillsTier2: [...(Array.isArray(base.skillsTier2) ? base.skillsTier2 : []), ...(Array.isArray(incoming.skillsTier2) ? incoming.skillsTier2 : [])],
    skillsTier3: [...(Array.isArray(base.skillsTier3) ? base.skillsTier3 : []), ...(Array.isArray(incoming.skillsTier3) ? incoming.skillsTier3 : [])],
  };
}

export function normalizeProfile(raw: Record<string, unknown>, fallbackEmail: string, fallbackName = ""): ProfileNormalized {
  const experienceMap = new Map<string, Record<string, unknown>>();
  for (const item of Array.isArray(raw.experience) ? raw.experience : []) {
    const e = item && typeof item === "object" ? { ...(item as Record<string, unknown>) } : {};
    const company = asString(e.company);
    const title = asString(e.title);
    if (!company && !title) continue;
    const key = `${company.toLowerCase()}::${title.toLowerCase()}`;
    const description = splitBullets(asString(e.description)).join("\n");
    if (!experienceMap.has(key)) {
      experienceMap.set(key, { ...e, company, title, description });
      continue;
    }
    const prev = experienceMap.get(key) ?? {};
    const mergedDescription = splitBullets(`${asString(prev.description)}\n${description}`).join("\n");
    experienceMap.set(key, { ...prev, ...e, company, title, description: mergedDescription });
  }

  const educationMap = new Map<string, Record<string, unknown>>();
  for (const item of Array.isArray(raw.education) ? raw.education : []) {
    const e = item && typeof item === "object" ? { ...(item as Record<string, unknown>) } : {};
    const degree = asString(e.degree);
    const institution = asString(e.institution);
    if (!degree && !institution) continue;
    const key = `${degree.toLowerCase()}::${institution.toLowerCase()}`;
    if (!educationMap.has(key)) educationMap.set(key, { ...e, degree, institution });
  }

  const level = asString(raw.experienceLevel);
  const experienceLevel = (["entry", "early", "mid", "senior", "staff"] as const).includes(level as any)
    ? (level as ProfileNormalized["experienceLevel"])
    : "mid";

  const normalizedExperience = Array.from(experienceMap.values()) as unknown as ProfileNormalized["experience"];
  const normalizedCurrentTitle = asStringOrNull(raw.currentTitle);
  const normalizedTargetRoles = asStringArray(raw.targetRoles);
  const inferredRoles =
    normalizedTargetRoles.length > 0
      ? normalizedTargetRoles
      : inferTargetRoles({
          currentTitle: normalizedCurrentTitle,
          experience: normalizedExperience.map((e) => ({ title: (e as { title?: string }).title })),
        });

  return {
    fullName: asString(raw.fullName) || fallbackName,
    email: asString(raw.email) || fallbackEmail,
    phone: asStringOrNull(raw.phone),
    linkedin: asStringOrNull(raw.linkedin),
    github: asStringOrNull(raw.github),
    portfolio: asStringOrNull(raw.portfolio),
    website: asStringOrNull(raw.website),
    location: asString(raw.location),
    visaStatus: asStringOrNull(raw.visaStatus),
    currentTitle: normalizedCurrentTitle,
    yearsOfExperience: typeof raw.yearsOfExperience === "number" ? raw.yearsOfExperience : null,
    professionalSummary: asStringOrNull(raw.professionalSummary),
    summarySignals: asStringArray(raw.summarySignals),
    domainExperience: asStringArray(raw.domainExperience),
    careerHighlights: asStringArray(raw.careerHighlights),
    relocationPreferences: asStringArray(raw.relocationPreferences),
    targetRoles: inferredRoles,
    experienceLevel,
    experience: normalizedExperience,
    education: Array.from(educationMap.values()) as unknown as ProfileNormalized["education"],
    certifications: asStringArray(raw.certifications),
    projects: (Array.isArray(raw.projects) ? raw.projects : []) as ProfileNormalized["projects"],
    languages: asStringArray(raw.languages),
    awards: asStringArray(raw.awards),
    publications: asStringArray(raw.publications),
    volunteering: asStringArray(raw.volunteering),
    technicalSkills: asStringArray(raw.technicalSkills),
    tools: asStringArray(raw.tools),
    methodologies: asStringArray(raw.methodologies),
    softSkills: asStringArray(raw.softSkills),
    domainSkills: asStringArray(raw.domainSkills),
    professionalSkills: asStringArray(raw.professionalSkills),
    skillsTier1: dedupeSkills(raw.skillsTier1),
    skillsTier2: dedupeSkills(raw.skillsTier2),
    skillsTier3: dedupeSkills(raw.skillsTier3),
    voiceNotes: asStringOrNull(raw.voiceNotes) ?? asStringOrNull(raw.summary),
    summary: asString(raw.summary) || undefined,
  };
}
