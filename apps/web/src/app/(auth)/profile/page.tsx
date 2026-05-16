import { CareerProfilePage } from "@/components/profile/career-profile-page";
import type { ProfileEditorData } from "@/components/profile/profile-editor";
import {
  type CareerUnderstandingV1,
  isCareerUnderstandingV1,
  isUnderstandingStale,
} from "@/lib/career-understanding";
import { careerProfileFingerprint } from "@/lib/career-understanding/fingerprint";
import { buildPlaceholderUnderstanding } from "@/lib/career-understanding/service";
import { safeQuery } from "@/lib/errors";
import { isCareerProfileV1 } from "@/lib/onboarding/career-profile.schema";
import type { CareerProfileV1, ProfileReadiness } from "@/lib/onboarding/types";
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

  const profileRows = await safeQuery(
    () => db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1),
    [] as Array<typeof profiles.$inferSelect>,
  );
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
        // NEW fields — sourced from careerProfile JSONB when available
        github: careerProfile?.identity.github.value ?? "",
        portfolio: careerProfile?.identity.portfolio.value ?? "",
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
        languages: careerProfile?.languages.value ?? [],
        awards: careerProfile?.awards.value ?? [],
        publications: careerProfile?.publications.value ?? [],
        volunteering: careerProfile?.volunteering.value ?? [],
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
    : {
        fullName: session.fullName ?? "",
        email: session.email,
        phone: "",
        linkedin: "",
        location: "",
        visaStatus: "",
        relocationPreferences: [],
        targetRoles: [],
        currentTitle: "",
        experienceLevel: "mid" as const,
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
        careerDirection: "" as const,
        preferredMarkets: [],
        workPreference: "" as const,
        seniorityComfort: [],
        industriesOfInterest: [],
        roleDealbreakers: [],
        toneSignals: [],
        styleConstraints: [],
        emphasisAreas: [],
        deEmphasisAreas: [],
      };

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
      : null);
  const understandingPersisted = persistedUnderstanding !== null;

  const profileFingerprint = careerProfile ? careerProfileFingerprint(careerProfile) : null;
  const staleAtLoad = careerProfile
    ? isUnderstandingStale(persistedUnderstanding, careerProfile)
    : false;

  const canGenerateUnderstanding = (() => {
    // Primary: check CareerProfileV1 structure
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
    // Fallback: check legacy profile columns
    if (!profile) return false;
    const hasName = !!profile.fullName;
    const hasExperience = (() => { try { return JSON.parse(profile.experience ?? "[]").length > 0; } catch { return false; } })();
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
    />
  );
}
