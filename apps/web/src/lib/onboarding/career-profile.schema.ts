import { z } from "zod";

import type {
  CareerProfileV1,
  ExperienceEntry,
  ProfileField,
  ProfileReadiness,
  UserCareerProfile,
} from "./types";
import type { ProfileNormalized, SkillEntry } from "@/lib/profile-domain/contracts";

export const CAREER_PROFILE_VERSION = "career-profile-v1" as const;

const profileFieldSchema = z.object({
  value: z.unknown(),
  source: z.enum(["resume", "user", "ai_inferred", "system"]),
  confidence: z.number().min(0).max(1),
  confirmed: z.boolean(),
  lastUpdatedAt: z.string(),
  evidence: z.array(z.object({
    source: z.enum(["resume_text", "resume_file", "user_message", "ai_inference"]),
    quote: z.string().optional(),
    page: z.number().optional(),
    messageId: z.string().optional(),
    confidence: z.number().min(0).max(1),
  })).default([]),
  editHistory: z.array(z.object({
    previousValue: z.unknown(),
    nextValue: z.unknown(),
    source: z.enum(["resume", "user", "ai_inferred", "system"]),
    reason: z.string(),
    actor: z.enum(["user", "router", "extractor", "system"]),
    at: z.string(),
  })).default([]),
});

export const careerProfileSchema = z.object({
  schemaVersion: z.literal(CAREER_PROFILE_VERSION),
  id: z.string(),
  userId: z.string(),
  identity: z.object({
    fullName: profileFieldSchema,
    email: profileFieldSchema,
    phone: profileFieldSchema,
    location: profileFieldSchema,
    linkedin: profileFieldSchema,
    github: profileFieldSchema,
    portfolio: profileFieldSchema,
    website: profileFieldSchema,
  }),
  professionalProfile: z.object({
    currentTitles: profileFieldSchema,
    professionalIdentities: profileFieldSchema,
    yearsOfExperience: profileFieldSchema,
    summarySignals: profileFieldSchema,
    domainExperience: profileFieldSchema,
    careerHighlights: profileFieldSchema,
  }),
  experience: profileFieldSchema,
  education: profileFieldSchema,
  skills: z.object({
    technical: profileFieldSchema,
    tools: profileFieldSchema,
    business: profileFieldSchema,
    methodologies: profileFieldSchema,
    softSkills: profileFieldSchema,
    domainSkills: profileFieldSchema,
  }),
  projects: profileFieldSchema,
  certifications: profileFieldSchema,
  languages: profileFieldSchema,
  awards: profileFieldSchema,
  publications: profileFieldSchema,
  volunteering: profileFieldSchema,
  careerIntent: z.object({
    interestedRoles: profileFieldSchema,
    careerDirection: profileFieldSchema,
    preferredMarkets: profileFieldSchema,
    workPreference: profileFieldSchema,
    seniorityComfort: profileFieldSchema,
    industriesOfInterest: profileFieldSchema,
    roleDealbreakers: profileFieldSchema,
  }),
  resumeWritingPreferences: z.object({
    emphasisAreas: profileFieldSchema,
    deEmphasisAreas: profileFieldSchema,
    toneSignals: profileFieldSchema,
    styleConstraints: profileFieldSchema,
  }),
  onboarding: z.object({
    currentPhase: z.string(),
    parseQuality: z.object({
      score: z.number().min(0).max(100),
      textExtractionMethod: z.enum(["pdf_text", "docx_text", "openai_file", "manual_paste", "unknown"]),
      hasIdentity: z.boolean(),
      hasExperience: z.boolean(),
      hasEducation: z.boolean(),
      hasSkills: z.boolean(),
      hasProjects: z.boolean(),
      weakAreas: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
    readiness: z.unknown().nullable(),
    resumeUploaded: z.boolean(),
    resumeParsed: z.boolean(),
    resumeSummarized: z.boolean(),
    educationNotApplicable: z.boolean(),
    completedAt: z.string().nullable(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

export function isCareerProfileV1(value: unknown): value is CareerProfileV1 {
  return careerProfileSchema.safeParse(value).success;
}

export function assertCareerProfileV1(value: unknown): asserts value is CareerProfileV1 {
  const parsed = careerProfileSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid CareerProfileV1: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  }
}

export function emptyParseQuality(): CareerProfileV1["onboarding"]["parseQuality"] {
  return {
    score: 0,
    textExtractionMethod: "unknown",
    hasIdentity: false,
    hasExperience: false,
    hasEducation: false,
    hasSkills: false,
    hasProjects: false,
    weakAreas: [],
    warnings: [],
  };
}

export function attachFieldEdit<T>(
  field: ProfileField<T>,
  nextValue: T,
  params: {
    source: ProfileField<T>["source"];
    actor: "user" | "router" | "extractor" | "system";
    reason: string;
    confidence?: number;
    confirmed?: boolean;
    evidence?: ProfileField<T>["evidence"];
  },
): ProfileField<T> {
  const now = new Date().toISOString();
  return {
    value: nextValue,
    source: params.source,
    confidence: params.confidence ?? field.confidence,
    confirmed: params.confirmed ?? field.confirmed,
    lastUpdatedAt: now,
    evidence: params.evidence ?? field.evidence ?? [],
    editHistory: [
      ...(field.editHistory ?? []),
      {
        previousValue: field.value,
        nextValue,
        source: params.source,
        actor: params.actor,
        reason: params.reason,
        at: now,
      },
    ],
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringOrNull(value: unknown): string | null {
  const valueAsString = asString(value);
  return valueAsString.length > 0 ? valueAsString : null;
}

function skills(values: string[]): SkillEntry[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .map((name) => ({ name }));
}

function describeExperience(entry: ExperienceEntry): string {
  return [
    ...(entry.responsibilities ?? []),
    ...(entry.achievements ?? []),
    ...((entry.metrics ?? []).map((metric) =>
      [metric.metric, metric.value, metric.context].filter(Boolean).join(": "),
    )),
  ].filter(Boolean).join("\n");
}

export function careerProfileToNormalized(
  profile: UserCareerProfile,
  fallbackEmail: string,
  fallbackName = "",
): ProfileNormalized {
  const technical = skills(profile.skills.technical.value);
  const tools = skills([
    ...profile.skills.tools.value,
    ...profile.skills.methodologies.value,
  ]);
  const professional = skills([
    ...profile.skills.business.value,
    ...profile.skills.softSkills.value,
    ...profile.skills.domainSkills.value,
  ]);

  return {
    fullName: profile.identity.fullName.value || fallbackName,
    email: profile.identity.email.value || fallbackEmail,
    phone: asStringOrNull(profile.identity.phone.value),
    linkedin: asStringOrNull(profile.identity.linkedin.value),
    location: profile.identity.location.value,
    visaStatus: null,
    currentTitle: asStringOrNull(profile.professionalProfile.currentTitles.value[0] ?? profile.experience.value[0]?.title),
    relocationPreferences: [],
    targetRoles: profile.careerIntent.interestedRoles.value,
    experienceLevel: "mid",
    experience: profile.experience.value.map((entry) => ({
      company: entry.company,
      title: entry.title,
      startDate: entry.startDate,
      endDate: entry.endDate,
      description: describeExperience(entry),
      metrics: entry.metrics,
      tools: entry.tools,
      teamSize: entry.teamSize,
      industry: entry.industry ?? entry.domain,
    })),
    education: profile.education.value.map((entry) => ({
      degree: entry.degree,
      institution: entry.institution,
      startDate: entry.startDate,
      endDate: entry.endDate ?? entry.graduationYear,
      coursework: entry.coursework,
      capstone: entry.capstone,
    })),
    certifications: profile.certifications.value.map((entry) => entry.name).filter(Boolean),
    projects: profile.projects.value.map((entry) => ({
      name: entry.title,
      description: entry.description,
      technologies: entry.techStack ?? [],
      role: entry.role,
      year: entry.year ? Number.parseInt(entry.year, 10) || undefined : undefined,
      keyMetric: entry.impact,
    })),
    skillsTier1: technical,
    skillsTier2: tools,
    skillsTier3: professional,
    voiceNotes: profile.resumeWritingPreferences.emphasisAreas.value.join(", ") || null,
    summary: [
      ...profile.professionalProfile.summarySignals.value,
      ...profile.professionalProfile.careerHighlights.value,
    ].filter(Boolean).join(" ") || undefined,
  };
}

export function updateProfileOnboardingReadiness(
  profile: UserCareerProfile,
  readiness: ProfileReadiness,
): UserCareerProfile {
  profile.onboarding.readiness = readiness;
  profile.updatedAt = new Date().toISOString();
  return profile;
}
