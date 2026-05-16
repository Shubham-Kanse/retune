/**
 * Career-understanding context builder.
 *
 * Compresses the canonical CareerProfileV1 into a bounded JSON object the
 * model can read in a single call. The output is opinionated: identity
 * info that does not help interpretation (phone, address) is stripped,
 * arrays are capped, and free-text fields are truncated.
 *
 * The keys exported here also become the dot-paths in `EvidenceRef.profilePath`.
 * Keep them consistent with `evidenceMap.ts`.
 */

import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";

const DEFAULT_MAX_CHARS = 12_000;

const DEFAULT_TEXT_TRUNC = 360;
const DEFAULT_BULLET_TRUNC = 220;
const DEFAULT_BULLET_LIST_LIMIT = 6;

export interface CareerUnderstandingContext {
  identity: {
    fullName: string | null;
    location: string | null;
    websites: string[];
  };
  professionalProfile: {
    currentTitles: string[];
    professionalIdentities: string[];
    summarySignals: string[];
    domainExperience: string[];
    careerHighlights: string[];
    yearsOfExperience: number | null;
  };
  experience: Array<{
    id: string;
    title: string;
    company: string;
    startDate?: string;
    endDate?: string;
    domain?: string;
    industry?: string;
    isCurrent?: boolean;
    responsibilities: string[];
    achievements: string[];
    metrics: string[];
    tools: string[];
    skills: string[];
  }>;
  education: Array<{
    id: string;
    degree: string;
    institution: string;
    startDate?: string;
    endDate?: string;
    fieldOfStudy?: string;
  }>;
  projects: Array<{
    id: string;
    title: string;
    description: string;
    techStack: string[];
    impact?: string;
  }>;
  certifications: Array<{ id: string; name: string; issuer: string; year?: string }>;
  skills: {
    technical: string[];
    tools: string[];
    business: string[];
    methodologies: string[];
    softSkills: string[];
    domainSkills: string[];
  };
  careerIntent: {
    interestedRoles: string[];
    careerDirection: string;
    preferredMarkets: string[];
    workPreference: string;
    seniorityComfort: string[];
    industriesOfInterest: string[];
    roleDealbreakers: string[];
  };
  resumeWritingPreferences: {
    emphasisAreas: string[];
    deEmphasisAreas: string[];
    toneSignals: string[];
    styleConstraints: string[];
  };
  readiness: {
    score: number;
    blockers: string[];
    warnings: string[];
    suggestions: string[];
  } | null;
  /** Stable list of paths the AI is allowed to reference in EvidenceRef.profilePath. */
  allowedProfilePaths: string[];
  /** True when the profile has effectively no content. */
  isEmpty: boolean;
}

export function buildCareerUnderstandingContext(params: {
  profile: CareerProfileV1;
  readiness: ProfileReadiness | null;
  maxChars?: number;
  textTrunc?: number;
  bulletTrunc?: number;
  bulletListLimit?: number;
}): CareerUnderstandingContext {
  const profile = params.profile;
  const truncTxt = params.textTrunc ?? DEFAULT_TEXT_TRUNC;
  const bulletTrunc = params.bulletTrunc ?? DEFAULT_BULLET_TRUNC;
  const bulletLimit = params.bulletListLimit ?? DEFAULT_BULLET_LIST_LIMIT;

  const trimList = (xs: unknown, max = 12): string[] =>
    Array.isArray(xs)
      ? xs
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim().slice(0, truncTxt))
          .slice(0, max)
      : [];

  const websites = [
    profile.identity.linkedin.value,
    profile.identity.github.value,
    profile.identity.portfolio.value,
    profile.identity.website.value,
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  const allowedProfilePaths: string[] = [
    "identity.fullName",
    "identity.location",
    "professionalProfile.currentTitles",
    "professionalProfile.professionalIdentities",
    "professionalProfile.summarySignals",
    "professionalProfile.domainExperience",
    "professionalProfile.careerHighlights",
  ];

  const experience = (profile.experience.value ?? []).slice(0, 8).map((entry, i) => {
    const id = entry.id ?? `exp-${i}`;
    allowedProfilePaths.push(`experience[${i}]`);
    allowedProfilePaths.push(`experience[${i}].responsibilities`);
    allowedProfilePaths.push(`experience[${i}].achievements`);
    allowedProfilePaths.push(`experience[${i}].metrics`);
    allowedProfilePaths.push(`experience[${i}].tools`);
    allowedProfilePaths.push(`experience[${i}].skills`);
    return {
      id,
      title: (entry.title ?? "").slice(0, truncTxt),
      company: (entry.company ?? "").slice(0, truncTxt),
      startDate: entry.startDate,
      endDate: entry.endDate,
      domain: entry.domain,
      industry: entry.industry,
      isCurrent: entry.isCurrent,
      responsibilities: trimList(entry.responsibilities, bulletLimit).map((s) =>
        s.slice(0, bulletTrunc),
      ),
      achievements: trimList(entry.achievements, bulletLimit).map((s) => s.slice(0, bulletTrunc)),
      metrics: (entry.metrics ?? [])
        .slice(0, bulletLimit)
        .map(
          (m) =>
            [m.metric, m.value, m.context].filter((p) => typeof p === "string" && p).join(": ") ||
            (typeof m.value === "string" ? m.value : ""),
        )
        .filter(Boolean) as string[],
      tools: trimList(entry.tools, bulletLimit),
      skills: trimList(entry.skills, bulletLimit),
    };
  });

  const education = (profile.education.value ?? []).slice(0, 6).map((entry, i) => {
    allowedProfilePaths.push(`education[${i}]`);
    return {
      id: entry.id ?? `edu-${i}`,
      degree: (entry.degree ?? "").slice(0, truncTxt),
      institution: (entry.institution ?? "").slice(0, truncTxt),
      startDate: entry.startDate,
      endDate: entry.endDate ?? entry.graduationYear,
      fieldOfStudy: entry.fieldOfStudy,
    };
  });

  const projects = (profile.projects.value ?? []).slice(0, 8).map((entry, i) => {
    allowedProfilePaths.push(`projects[${i}]`);
    return {
      id: entry.id ?? `prj-${i}`,
      title: (entry.title ?? "").slice(0, truncTxt),
      description: (entry.description ?? "").slice(0, truncTxt),
      techStack: trimList(entry.techStack, bulletLimit),
      impact: entry.impact ? entry.impact.slice(0, truncTxt) : undefined,
    };
  });

  const certifications = (profile.certifications.value ?? []).slice(0, 12).map((entry, i) => {
    allowedProfilePaths.push(`certifications[${i}]`);
    return {
      id: entry.id ?? `cert-${i}`,
      name: (entry.name ?? "").slice(0, truncTxt),
      issuer: (entry.issuer ?? "").slice(0, truncTxt),
      year: entry.year,
    };
  });

  allowedProfilePaths.push(
    "skills.technical",
    "skills.tools",
    "skills.business",
    "skills.methodologies",
    "skills.softSkills",
    "skills.domainSkills",
    "careerIntent.interestedRoles",
    "careerIntent.careerDirection",
    "careerIntent.preferredMarkets",
    "careerIntent.workPreference",
    "careerIntent.seniorityComfort",
    "careerIntent.industriesOfInterest",
    "careerIntent.roleDealbreakers",
    "resumeWritingPreferences.emphasisAreas",
    "resumeWritingPreferences.deEmphasisAreas",
    "resumeWritingPreferences.toneSignals",
    "resumeWritingPreferences.styleConstraints",
    "readiness.warnings",
    "readiness.suggestions",
    "readiness.blockers",
  );

  const isEmpty =
    !profile.identity.fullName.value &&
    experience.length === 0 &&
    projects.length === 0 &&
    profile.skills.technical.value.length === 0 &&
    profile.skills.tools.value.length === 0 &&
    profile.careerIntent.interestedRoles.value.length === 0;

  const context: CareerUnderstandingContext = {
    identity: {
      fullName: profile.identity.fullName.value || null,
      location: profile.identity.location.value || null,
      websites,
    },
    professionalProfile: {
      currentTitles: trimList(profile.professionalProfile.currentTitles.value),
      professionalIdentities: trimList(profile.professionalProfile.professionalIdentities.value),
      summarySignals: trimList(profile.professionalProfile.summarySignals.value, 8).map((s) =>
        s.slice(0, bulletTrunc),
      ),
      domainExperience: trimList(profile.professionalProfile.domainExperience.value),
      careerHighlights: trimList(profile.professionalProfile.careerHighlights.value, 8).map((s) =>
        s.slice(0, bulletTrunc),
      ),
      yearsOfExperience: profile.professionalProfile.yearsOfExperience.value ?? null,
    },
    experience,
    education,
    projects,
    certifications,
    skills: {
      technical: trimList(profile.skills.technical.value, 24),
      tools: trimList(profile.skills.tools.value, 24),
      business: trimList(profile.skills.business.value, 16),
      methodologies: trimList(profile.skills.methodologies.value, 16),
      softSkills: trimList(profile.skills.softSkills.value, 16),
      domainSkills: trimList(profile.skills.domainSkills.value, 16),
    },
    careerIntent: {
      interestedRoles: trimList(profile.careerIntent.interestedRoles.value),
      careerDirection: (profile.careerIntent.careerDirection.value as string) || "",
      preferredMarkets: trimList(profile.careerIntent.preferredMarkets.value),
      workPreference: (profile.careerIntent.workPreference.value as string) || "",
      seniorityComfort: trimList(profile.careerIntent.seniorityComfort.value),
      industriesOfInterest: trimList(profile.careerIntent.industriesOfInterest.value),
      roleDealbreakers: trimList(profile.careerIntent.roleDealbreakers.value),
    },
    resumeWritingPreferences: {
      emphasisAreas: trimList(profile.resumeWritingPreferences.emphasisAreas.value),
      deEmphasisAreas: trimList(profile.resumeWritingPreferences.deEmphasisAreas.value),
      toneSignals: trimList(profile.resumeWritingPreferences.toneSignals.value),
      styleConstraints: trimList(profile.resumeWritingPreferences.styleConstraints.value),
    },
    readiness: params.readiness
      ? {
          score: params.readiness.score,
          blockers: params.readiness.blockers.slice(0, 12),
          warnings: params.readiness.warnings.slice(0, 12),
          suggestions: params.readiness.suggestions.slice(0, 12),
        }
      : null,
    allowedProfilePaths: Array.from(new Set(allowedProfilePaths)),
    isEmpty,
  };

  // Final hard cap: serialise and truncate identifying free-text fields if
  // we exceed maxChars. We don't drop sections — we just shorten arrays to
  // keep the model from running out of room.
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  let serialised = JSON.stringify(context);
  if (serialised.length > maxChars) {
    const dropAllowedFor = (prefix: string, idx: number) => {
      const dotPrefix = `${prefix}[${idx}]`;
      context.allowedProfilePaths = context.allowedProfilePaths.filter(
        (p) => p !== dotPrefix && !p.startsWith(`${dotPrefix}.`),
      );
    };
    while (serialised.length > maxChars && context.experience.length > 0) {
      const idx = context.experience.length - 1;
      context.experience.pop();
      dropAllowedFor("experience", idx);
      serialised = JSON.stringify(context);
    }
    while (serialised.length > maxChars && context.projects.length > 0) {
      const idx = context.projects.length - 1;
      context.projects.pop();
      dropAllowedFor("projects", idx);
      serialised = JSON.stringify(context);
    }
    while (serialised.length > maxChars && context.education.length > 0) {
      const idx = context.education.length - 1;
      context.education.pop();
      dropAllowedFor("education", idx);
      serialised = JSON.stringify(context);
    }
    while (serialised.length > maxChars && context.certifications.length > 0) {
      const idx = context.certifications.length - 1;
      context.certifications.pop();
      dropAllowedFor("certifications", idx);
      serialised = JSON.stringify(context);
    }
  }

  return context;
}
