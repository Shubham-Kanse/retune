/**
 * Shared helpers for applying an AI-extracted resume payload onto the
 * in-session UserCareerProfile. Used by both the streaming and non-streaming
 * upload routes.
 */
import { attachFieldEdit } from "@/lib/onboarding/career-profile.schema";
import { getOrCreateSession } from "@/lib/onboarding/session-store";
import type { ParseQuality, ProfileEvidence, ProfileField } from "@/lib/onboarding/types";

export function calculateParseQuality(data: Record<string, unknown>, mediaType: string): ParseQuality {
  const hasIdentity = Boolean(data.fullName || data.email);
  const hasExperience = Array.isArray(data.experience) && data.experience.length > 0;
  const hasEducation = Array.isArray(data.education) && data.education.length > 0;
  const skillSources: unknown[] = [
    data.skillsTier1, data.skillsTier2, data.skillsTier3,
    data.technicalSkills, data.tools, data.professionalSkills,
    data.methodologies, data.softSkills, data.domainSkills,
  ];
  const skillCount = skillSources.reduce<number>((sum, v) => sum + (Array.isArray(v) ? v.length : 0), 0);
  const hasSkills = skillCount >= 3;
  const hasProjects = Array.isArray(data.projects) && data.projects.length > 0;
  const weakAreas = [
    !hasIdentity ? "identity" : "",
    !hasExperience ? "experience" : "",
    !hasEducation ? "education" : "",
    !hasSkills ? "skills" : "",
  ].filter(Boolean);
  const score = Math.max(0, Math.min(100, [
    hasIdentity ? 20 : 0, hasExperience ? 30 : 0, hasEducation ? 10 : 0,
    hasSkills ? 25 : 0, hasProjects ? 10 : 0, 5,
  ].reduce((s, v) => s + v, 0)));
  return {
    score,
    textExtractionMethod: mediaType.includes("pdf") ? "pdf_text" : mediaType.includes("word") ? "docx_text" : "openai_file",
    hasIdentity, hasExperience, hasEducation, hasSkills, hasProjects,
    weakAreas,
    warnings: weakAreas.length ? [`Weak extraction areas: ${weakAreas.join(", ")}`] : [],
  };
}

export function applyExtractedProfile(
  stored: Awaited<ReturnType<typeof getOrCreateSession>>,
  data: Record<string, unknown>,
  parseQuality: ParseQuality,
) {
  const { profile } = stored;
  const now = new Date().toISOString();
  const evidenceFor = (quote?: unknown): ProfileEvidence[] => {
    const text = typeof quote === "string" ? quote.trim().slice(0, 500) : "";
    return [{ source: "resume_text", quote: text || undefined, confidence: 0.8 }];
  };
  const field = <T>(current: ProfileField<T>, value: T, confidence = 0.8, quote?: unknown) =>
    attachFieldEdit(current, value, {
      source: "resume", actor: "extractor", reason: "resume_extraction",
      confidence, confirmed: false, evidence: evidenceFor(quote),
    });
  const asStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const splitBullets = (text: string): string[] =>
    text.split(/\r?\n|•|◦|·|\u2022|\u2023|\u25E6|^\s*[-*]\s+/gm).map(s => s.trim()).filter(Boolean);
  const QUANTIFIED_RE = /(\d+[%x×]|\$[\d,.]+|\d+\s*(users|customers|clients|engineers|people|team|members|months|years|days|hours|projects|products|launches|releases|endpoints|services|requests|transactions|records|lines|commits|PRs|tickets|sprints|features|bugs|incidents|deployments|servers|nodes|clusters|regions|accounts|partners|vendors|contracts|deals|leads|conversions|revenue|savings|reduction|improvement|increase|decrease|growth)|\b(led|managed|mentored|coached|supervised)\s+(a\s+)?team\s+of\s+\d+|\d+\s*[kKmMbB]\b)/i;
  const splitBulletsToCategories = (text: string) => {
    const bullets = splitBullets(text);
    const responsibilities: string[] = [], achievements: string[] = [];
    for (const b of bullets) (QUANTIFIED_RE.test(b) ? achievements : responsibilities).push(b);
    return { responsibilities, achievements };
  };
  const extractSkillNames = (values: unknown[]): string[] =>
    values.map(v => v && typeof v === "object" && "name" in v ? String((v as any).name ?? "") : String(v ?? ""))
      .map(s => s.trim()).filter(Boolean);

  if (data.fullName) profile.identity.fullName = field(profile.identity.fullName, asStr(data.fullName), 0.9, data.fullName);
  if (data.email) profile.identity.email = field(profile.identity.email, asStr(data.email), 0.9, data.email);
  if (data.phone) profile.identity.phone = field(profile.identity.phone, asStr(data.phone), 0.85, data.phone);
  if (data.location) profile.identity.location = field(profile.identity.location, asStr(data.location), 0.85, data.location);
  if (data.linkedin) profile.identity.linkedin = field(profile.identity.linkedin, asStr(data.linkedin), 0.85, data.linkedin);
  if (data.github) profile.identity.github = field(profile.identity.github, asStr(data.github), 0.85, data.github);
  if (data.portfolio) profile.identity.portfolio = field(profile.identity.portfolio, asStr(data.portfolio), 0.85, data.portfolio);
  if (data.website) profile.identity.website = field(profile.identity.website, asStr(data.website), 0.85, data.website);

  if (data.currentTitle) profile.professionalProfile.currentTitles = field(profile.professionalProfile.currentTitles, [asStr(data.currentTitle)], 0.8, data.currentTitle);
  if (typeof data.yearsOfExperience === "number") {
    profile.professionalProfile.yearsOfExperience = field(profile.professionalProfile.yearsOfExperience, data.yearsOfExperience);
  } else if (typeof data.experienceLevel === "string") {
    const approx = ({ entry: 0, early: 2, mid: 5, senior: 8, staff: 12 } as Record<string, number>)[data.experienceLevel];
    if (typeof approx === "number") profile.professionalProfile.yearsOfExperience = field(profile.professionalProfile.yearsOfExperience, approx, 0.45, data.experienceLevel);
  }
  if (Array.isArray(data.summarySignals)) profile.professionalProfile.summarySignals = field(profile.professionalProfile.summarySignals, data.summarySignals.map(asStr), 0.75);
  if (Array.isArray(data.domainExperience)) profile.professionalProfile.domainExperience = field(profile.professionalProfile.domainExperience, data.domainExperience.map(asStr), 0.75);
  if (Array.isArray(data.careerHighlights)) profile.professionalProfile.careerHighlights = field(profile.professionalProfile.careerHighlights, data.careerHighlights.map(asStr), 0.75);
  if (typeof data.professionalSummary === "string" && data.professionalSummary.trim()) {
    profile.professionalProfile.summarySignals = field(profile.professionalProfile.summarySignals, [data.professionalSummary.trim()], 0.7, data.professionalSummary);
  }

  if (Array.isArray(data.experience)) {
    profile.experience = field(profile.experience, data.experience.map((e: any, i: number) => {
      let responsibilities: string[], achievements: string[];
      if (Array.isArray(e.responsibilities) && e.responsibilities.length > 0) {
        const categorized = splitBulletsToCategories([...e.responsibilities.map(asStr), ...(Array.isArray(e.achievements) ? e.achievements.map(asStr) : [])].join("\n"));
        responsibilities = categorized.responsibilities; achievements = categorized.achievements;
      } else {
        const categorized = splitBulletsToCategories(asStr(e.description));
        responsibilities = categorized.responsibilities;
        achievements = [...categorized.achievements, ...(Array.isArray(e.achievements) ? e.achievements.map(asStr) : [])];
      }
      return {
        id: e.id ?? `exp-${i}`, title: asStr(e.title), company: asStr(e.company),
        location: e.location ? asStr(e.location) : undefined,
        startDate: e.startDate ? asStr(e.startDate) : undefined,
        endDate: e.endDate ? asStr(e.endDate) : "Present",
        isCurrent: Boolean(e.isCurrent), responsibilities, achievements,
        metrics: Array.isArray(e.metrics) ? e.metrics : [],
        tools: Array.isArray(e.tools) ? e.tools.map(asStr) : [],
        skills: Array.isArray(e.skills) ? e.skills.map(asStr) : [],
        domain: e.domain ? asStr(e.domain) : undefined,
        industry: e.industry ? asStr(e.industry) : undefined,
        teamSize: typeof e.teamSize === "number" ? e.teamSize : undefined,
        confidence: 0.8,
      };
    }), 0.8);
  }

  if (Array.isArray(data.education)) {
    profile.education = field(profile.education, data.education.map((e: any, i: number) => ({
      id: e.id ?? `edu-${i}`, degree: asStr(e.degree), institution: asStr(e.institution),
      fieldOfStudy: e.fieldOfStudy ? asStr(e.fieldOfStudy) : undefined,
      startDate: e.startDate ? asStr(e.startDate) : undefined,
      endDate: e.endDate ? asStr(e.endDate) : undefined,
      graduationYear: asStr(e.graduationYear ?? e.endDate) || undefined,
      location: e.location ? asStr(e.location) : undefined,
      grade: e.grade ? asStr(e.grade) : undefined,
      coursework: Array.isArray(e.coursework) ? e.coursework.map(asStr) : [],
      capstone: e.capstone ? asStr(e.capstone) : undefined,
    })), 0.8);
  }

  if (Array.isArray(data.skillsTier1)) profile.skills.technical = field(profile.skills.technical, extractSkillNames(data.skillsTier1));
  else if (Array.isArray(data.technicalSkills)) profile.skills.technical = field(profile.skills.technical, data.technicalSkills.map(asStr));
  else if (Array.isArray(data.skills)) profile.skills.technical = field(profile.skills.technical, (data.skills as unknown[]).map(asStr));

  if (Array.isArray(data.skillsTier2)) profile.skills.tools = field(profile.skills.tools, extractSkillNames(data.skillsTier2));
  else if (Array.isArray(data.tools)) profile.skills.tools = field(profile.skills.tools, (data.tools as unknown[]).map(asStr));

  if (Array.isArray(data.skillsTier3)) profile.skills.business = field(profile.skills.business, extractSkillNames(data.skillsTier3));
  else if (Array.isArray(data.professionalSkills)) profile.skills.business = field(profile.skills.business, (data.professionalSkills as unknown[]).map(asStr));

  if (Array.isArray(data.softSkills)) profile.skills.softSkills = field(profile.skills.softSkills, (data.softSkills as unknown[]).map(asStr));
  if (Array.isArray(data.methodologies)) profile.skills.methodologies = field(profile.skills.methodologies, (data.methodologies as unknown[]).map(asStr));
  if (Array.isArray(data.domainSkills)) profile.skills.domainSkills = field(profile.skills.domainSkills, (data.domainSkills as unknown[]).map(asStr));

  if (Array.isArray(data.projects)) {
    profile.projects = field(profile.projects, data.projects.map((p: any, i: number) => ({
      id: p.id ? asStr(p.id) : `project-${i}`, title: asStr(p.title ?? p.name),
      description: asStr(p.description),
      techStack: Array.isArray(p.techStack) ? p.techStack.map(asStr) : Array.isArray(p.technologies) ? p.technologies.map(asStr) : Array.isArray(p.tech) ? p.tech.map(asStr) : undefined,
      link: p.link ? asStr(p.link) : p.url ? asStr(p.url) : undefined,
      impact: p.impact ? asStr(p.impact) : p.keyMetric ? asStr(p.keyMetric) : undefined,
      role: p.role ? asStr(p.role) : undefined, year: p.year ? asStr(p.year) : undefined,
    })), 0.75);
  }

  if (Array.isArray(data.certifications)) {
    profile.certifications = field(profile.certifications, data.certifications.map((c: any, i: number) => {
      if (typeof c === "string") return { id: `cert-${i}`, name: c, issuer: "" };
      return { id: c.id ? asStr(c.id) : `cert-${i}`, name: asStr(c.name ?? c.title), issuer: asStr(c.issuer ?? c.organization ?? ""), year: c.year ? asStr(c.year) : c.date ? asStr(c.date) : undefined, expiresAt: c.expiresAt ? asStr(c.expiresAt) : undefined };
    }), 0.75);
  }

  if (Array.isArray(data.languages)) profile.languages = field(profile.languages, (data.languages as unknown[]).map(asStr), 0.75);
  if (Array.isArray(data.awards)) profile.awards = field(profile.awards, (data.awards as unknown[]).map(asStr), 0.75);
  if (Array.isArray(data.publications)) profile.publications = field(profile.publications, (data.publications as unknown[]).map(asStr), 0.75);
  if (Array.isArray(data.volunteering)) profile.volunteering = field(profile.volunteering, (data.volunteering as unknown[]).map(asStr), 0.75);

  if (Array.isArray(data.targetRoles) && data.targetRoles.length > 0) {
    profile.careerIntent.interestedRoles = field(profile.careerIntent.interestedRoles, (data.targetRoles as unknown[]).map(asStr), 0.55);
  }

  if (typeof data.summary === "string" && data.summary.trim()) {
    profile.resumeWritingPreferences.emphasisAreas = field(profile.resumeWritingPreferences.emphasisAreas, [data.summary.trim()], 0.55, data.summary);
  } else if (typeof data.voiceNotes === "string" && data.voiceNotes.trim()) {
    profile.resumeWritingPreferences.emphasisAreas = field(profile.resumeWritingPreferences.emphasisAreas, [data.voiceNotes.trim()], 0.55, data.voiceNotes);
  }

  profile.onboarding.parseQuality = parseQuality;
  profile.updatedAt = now;
}
