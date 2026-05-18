import { CareerProfilePage } from "@/components/profile/career-profile-page";
import type { ProfileEditorData } from "@/components/profile/profile-editor";
import {
  type CareerUnderstandingV1,
  isCareerUnderstandingV1,
  isUnderstandingStale,
} from "@/lib/career-understanding";
import { buildUnderstandingFromV2 } from "@/lib/career-understanding/build-from-v2";
import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import { buildPlaceholderUnderstanding } from "@/lib/career-understanding/service";
import { safeQuery } from "@/lib/errors";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
import { loadV2Profile } from "@/lib/onboarding-v2/repository";
import { getSession } from "@/lib/session";
import { db, profiles } from "@retune/db";
import { eq } from "drizzle-orm";

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeArrayParse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string" && parsed) return [parsed];
    return [];
  } catch {
    return [];
  }
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) return null;

  // Load both v1 and v2 data in parallel — v2 wins for the new sections,
  // v1 still drives the existing "Best Angles" / "Evidence" / "Resume Fuel"
  // surfaces until those are fully migrated.
  const [profileRows, v2Profile] = await Promise.all([
    safeQuery(
      () => db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1),
      [] as Array<typeof profiles.$inferSelect>,
    ),
    loadV2Profile(session.userId),
  ]);

  const profile = profileRows[0];

  const careerProfileRaw = (profile as { careerProfile?: unknown } | undefined)?.careerProfile;
  const careerProfile: CareerProfileV1 | null = isCareerProfileV1(careerProfileRaw)
    ? careerProfileRaw
    : null;

  const profileData: ProfileEditorData = profile
    ? {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone ?? "",
        linkedin: profile.linkedin ?? "",
        location: profile.location,
        visaStatus: profile.visaStatus ?? "",
        relocationPreferences: safeArrayParse(profile.relocationPreferences),
        targetRoles: safeArrayParse(profile.targetRoles),
        currentTitle: profile.currentTitle ?? "",
        experienceLevel: profile.experienceLevel ?? "mid",
        experience: safeJsonParse<ProfileEditorData["experience"]>(profile.experience, []),
        education: safeJsonParse<ProfileEditorData["education"]>(profile.education, []),
        certifications: safeJsonParse<string[]>(profile.certifications, []),
        projects: safeJsonParse<ProfileEditorData["projects"]>(profile.projects, []),
        skillsTier1: safeJsonParse<ProfileEditorData["skillsTier1"]>(profile.skillsTier1, []),
        skillsTier2: safeJsonParse<ProfileEditorData["skillsTier2"]>(profile.skillsTier2, []),
        skillsTier3: safeJsonParse<ProfileEditorData["skillsTier3"]>(profile.skillsTier3, []),
        tools: [],
        voiceNotes: profile.voiceNotes ?? "",
        profileMarkdown: profile.profileMarkdown,
        completenessScore: profile.completenessScore,
        github: careerProfile?.identity.github.value ?? v2Profile?.profile.github_url ?? "",
        portfolio: careerProfile?.identity.portfolio.value ?? v2Profile?.profile.portfolio_url ?? "",
        website: careerProfile?.identity.website.value ?? "",
        yearsOfExperience: careerProfile?.professionalProfile.yearsOfExperience.value ?? null,
        professionalSummary: (careerProfile?.professionalProfile.currentTitles.value ?? []).join(", "),
        summarySignals: careerProfile?.professionalProfile.summarySignals.value ?? [],
        domainExperience: careerProfile?.professionalProfile.domainExperience.value ?? [],
        careerHighlights: careerProfile?.professionalProfile.careerHighlights.value ?? [],
        skillsTechnical: careerProfile?.skills.technical.value ?? [],
        skillsTools: careerProfile?.skills.tools.value ?? [],
        skillsBusiness: careerProfile?.skills.business.value ?? [],
        skillsMethodologies: careerProfile?.skills.methodologies.value ?? [],
        skillsSoft: careerProfile?.skills.softSkills.value ?? [],
        skillsDomain: careerProfile?.skills.domainSkills.value ?? [],
        languages: careerProfile?.languages.value ?? v2Profile?.extras.languages ?? [],
        awards: careerProfile?.awards.value ?? v2Profile?.extras.awards ?? [],
        publications: careerProfile?.publications.value ?? v2Profile?.extras.publications ?? [],
        volunteering:
          careerProfile?.volunteering.value ?? v2Profile?.extras.volunteering ?? [],
        interestedRoles: careerProfile?.careerIntent.interestedRoles.value ?? [],
        careerDirection: careerProfile?.careerIntent.careerDirection.value ?? "",
        preferredMarkets: careerProfile?.careerIntent.preferredMarkets.value ?? [],
        workPreference: careerProfile?.careerIntent.workPreference.value ?? "",
        seniorityComfort: careerProfile?.careerIntent.seniorityComfort.value ?? [],
        industriesOfInterest: careerProfile?.careerIntent.industriesOfInterest.value ?? [],
        roleDealbreakers: careerProfile?.careerIntent.roleDealbreakers.value ?? [],
        toneSignals: careerProfile?.resumeWritingPreferences.toneSignals.value ?? [],
        styleConstraints: careerProfile?.resumeWritingPreferences.styleConstraints.value ?? [],
        emphasisAreas: careerProfile?.resumeWritingPreferences.emphasisAreas.value ?? [],
        deEmphasisAreas: careerProfile?.resumeWritingPreferences.deEmphasisAreas.value ?? [],
      }
    : v2ProfileToEditorData(session, v2Profile);

  const readiness =
    ((profile as { profileReadiness?: ProfileReadiness | null } | undefined)
      ?.profileReadiness as ProfileReadiness | null) ?? null;
  const persistedUnderstandingRaw = (profile as { careerUnderstanding?: unknown } | undefined)
    ?.careerUnderstanding;
  const persistedUnderstanding: CareerUnderstandingV1 | null = isCareerUnderstandingV1(
    persistedUnderstandingRaw,
  )
    ? (persistedUnderstandingRaw as CareerUnderstandingV1)
    : null;

  const understandingForUI =
    persistedUnderstanding ??
    (careerProfile
      ? buildPlaceholderUnderstanding({ userId: session.userId, profile: careerProfile })
      : v2Profile
        ? buildUnderstandingFromV2(v2Profile, session.userId)
        : null);
  const understandingPersisted =
    persistedUnderstanding !== null || (v2Profile !== null && !careerProfile);

  const profileFingerprint = careerProfile ? careerProfileFingerprint(careerProfile) : null;
  const staleAtLoad = careerProfile
    ? isUnderstandingStale(persistedUnderstanding, careerProfile)
    : false;

  const canGenerateUnderstanding = (() => {
    if (careerProfile) {
      const hasIdentity = !!careerProfile.identity.fullName.value;
      const hasExperienceOrProjects =
        (careerProfile.experience.value?.length ?? 0) > 0 ||
        (careerProfile.projects.value?.length ?? 0) > 0;
      const hasSkills =
        (careerProfile.skills.technical.value?.length ?? 0) +
          (careerProfile.skills.tools.value?.length ?? 0) +
          (careerProfile.skills.business.value?.length ?? 0) +
          (careerProfile.skills.softSkills.value?.length ?? 0) >
        0;
      return hasIdentity && hasExperienceOrProjects && hasSkills;
    }
    if (v2Profile) {
      return Boolean(
        v2Profile.profile.full_name &&
          (v2Profile.experience.length > 0 || v2Profile.projects.length > 0) &&
          v2Profile.skills.raw_list.length > 0,
      );
    }
    if (!profile) return false;
    const hasName = !!profile.fullName;
    const hasExperience = (() => {
      try {
        return JSON.parse(profile.experience ?? "[]").length > 0;
      } catch {
        return false;
      }
    })();
    const hasSkills = !!(profile.skillsTier1 || profile.skillsTier2 || profile.skillsTier3);
    return hasName && (hasExperience || hasSkills);
  })();

  return (
    <CareerProfilePage
      initialProfileData={profileData}
      initialUnderstanding={understandingForUI}
      understandingPersisted={understandingPersisted}
      profileFingerprint={profileFingerprint}
      staleAtLoad={staleAtLoad}
      canGenerateUnderstanding={canGenerateUnderstanding}
      readiness={readiness}
      v2Profile={v2Profile}
    />
  );
}

function v2ProfileToEditorData(
  session: { fullName?: string | null; email: string },
  v2: Awaited<ReturnType<typeof loadV2Profile>>,
): ProfileEditorData {
  if (!v2) {
    return {
      fullName: session.fullName ?? "",
      email: session.email,
      phone: "",
      linkedin: "",
      location: "",
      visaStatus: "",
      relocationPreferences: [],
      targetRoles: [],
      currentTitle: "",
      experienceLevel: "mid",
      experience: [],
      education: [],
      certifications: [],
      projects: [],
      skillsTier1: [],
      skillsTier2: [],
      skillsTier3: [],
      tools: [],
      voiceNotes: "",
      profileMarkdown: "",
      completenessScore: 0,
      github: "",
      portfolio: "",
      website: "",
      yearsOfExperience: null,
      professionalSummary: "",
      summarySignals: [],
      domainExperience: [],
      careerHighlights: [],
      skillsTechnical: [],
      skillsTools: [],
      skillsBusiness: [],
      skillsMethodologies: [],
      skillsSoft: [],
      skillsDomain: [],
      languages: [],
      awards: [],
      publications: [],
      volunteering: [],
      interestedRoles: [],
      careerDirection: "",
      workPreference: "",
      seniorityComfort: [],
      industriesOfInterest: [],
      roleDealbreakers: [],
      toneSignals: [],
      styleConstraints: [],
      emphasisAreas: [],
      deEmphasisAreas: [],
      preferredMarkets: [],
    };
  }

  return {
    fullName: v2.profile.full_name ?? session.fullName ?? "",
    email: v2.profile.email ?? session.email,
    phone: v2.profile.phone ?? "",
    linkedin: v2.profile.linkedin_url ?? "",
    location: v2.profile.location ?? "",
    visaStatus: "",
    relocationPreferences: [],
    targetRoles: v2.profile.target_role ? [v2.profile.target_role] : [],
    currentTitle: v2.experience[0]?.title ?? "",
    experienceLevel: "mid",
    experience: v2.experience.map((e) => ({
      title: e.title ?? "",
      company: e.company ?? "",
      startDate: e.start_date ?? "",
      endDate: e.end_date ?? "",
      bullets: e.bullets ?? [],
    })),
    education: v2.education.map((e) => ({
      institution: e.institution ?? "",
      degree: e.degree ?? "",
      field: e.field ?? "",
      startDate: e.start_date ?? "",
      endDate: e.end_date ?? "",
    })),
    certifications: v2.certifications.map((c) => c.name ?? "").filter(Boolean),
    projects: v2.projects.map((p) => ({
      name: p.name ?? "",
      description: p.description ?? "",
      technologies: p.technologies,
    })),
    skillsTier1: v2.skills.raw_list.slice(0, 5).map((name) => ({ name, level: "expert" as const })),
    skillsTier2: v2.skills.raw_list.slice(5, 12).map((name) => ({ name, level: "proficient" as const })),
    skillsTier3: v2.skills.raw_list.slice(12).map((name) => ({ name, level: "familiar" as const })),
    tools: [],
    voiceNotes: v2.voice?.tone_calibration_summary ?? "",
    profileMarkdown: "",
    completenessScore: v2.profile.completeness_score ?? 0,
    github: v2.profile.github_url ?? "",
    portfolio: v2.profile.portfolio_url ?? "",
    website: "",
    yearsOfExperience: null,
    professionalSummary: v2.profile.inferred_summary ?? "",
    summarySignals: [],
    domainExperience: v2.profile.confirmed_industry ? [v2.profile.confirmed_industry] : [],
    careerHighlights: [],
    skillsTechnical: v2.skills.grouped?.technical ?? [],
    skillsTools: v2.skills.grouped?.tools ?? [],
    skillsBusiness: v2.skills.grouped?.business ?? [],
    skillsMethodologies: v2.skills.grouped?.methodologies ?? [],
    skillsSoft: v2.skills.grouped?.soft_skills ?? [],
    skillsDomain: v2.skills.grouped?.domain ?? [],
    languages: v2.extras.languages,
    awards: v2.extras.awards,
    publications: v2.extras.publications,
    volunteering: v2.extras.volunteering,
    interestedRoles: v2.profile.target_role ? [v2.profile.target_role] : [],
    careerDirection: "",
    preferredMarkets: [],
    workPreference: "",
    seniorityComfort: v2.profile.confirmed_seniority ? [v2.profile.confirmed_seniority] : [],
    industriesOfInterest: v2.profile.confirmed_industry ? [v2.profile.confirmed_industry] : [],
    roleDealbreakers: [],
    toneSignals: Array.isArray(v2.voice?.tone_preferences) ? (v2.voice.tone_preferences as string[]) : [],
    styleConstraints: v2.voice?.tone_aversions ?? [],
    emphasisAreas: [],
    deEmphasisAreas: [],
  };
}
