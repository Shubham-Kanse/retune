import type { ProfileReadiness, UserCareerProfile } from "./types";

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function hasQuantifiedEvidence(profile: UserCareerProfile): boolean {
  return profile.experience.value.some((entry) =>
    entry.achievements.some((achievement) => /\d/.test(achievement)) ||
    (entry.metrics ?? []).some((metric) => metric.value && /\d/.test(metric.value)),
  );
}

function hasIncompleteDates(profile: UserCareerProfile): boolean {
  return profile.experience.value.some((entry) => !entry.startDate || (!entry.endDate && !entry.isCurrent));
}

export function calculateProfileReadiness(profile: UserCareerProfile): ProfileReadiness {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const identityDone = [
    Boolean(profile.identity.fullName.value),
    Boolean(profile.identity.email.value),
    Boolean(profile.identity.location.value),
  ].filter(Boolean).length;
  const identity = pct(identityDone, 3);

  const hasExperience = profile.experience.value.length > 0;
  const hasProject = profile.projects.value.length > 0;
  const experienceOrProjects = hasExperience || hasProject ? 100 : 0;

  const educationOrNotApplicable =
    profile.education.value.length > 0 || profile.education.confirmed || profile.onboarding.educationNotApplicable
      ? 100
      : 0;

  const skillCount =
    profile.skills.technical.value.length +
    profile.skills.tools.value.length +
    profile.skills.business.value.length +
    profile.skills.methodologies.value.length +
    profile.skills.softSkills.value.length +
    profile.skills.domainSkills.value.length;
  const skills = Math.min(100, Math.round((skillCount / 5) * 100));

  const professionalProfile = profile.professionalProfile.professionalIdentities.value.length > 0 ? 100 : 0;

  const careerIntent = pct([
    profile.careerIntent.interestedRoles.value.length > 0,
    profile.careerIntent.preferredMarkets.value.length > 0,
    Boolean(profile.careerIntent.workPreference.value),
    profile.careerIntent.seniorityComfort.value.length > 0,
  ].filter(Boolean).length, 4);

  const resumeWritingPreferences = pct([
    profile.resumeWritingPreferences.emphasisAreas.value.length > 0,
    profile.resumeWritingPreferences.deEmphasisAreas.confirmed,
  ].filter(Boolean).length, 2);

  const qualityAndConfirmation = pct([
    profile.onboarding.resumeUploaded,
    profile.onboarding.resumeParsed,
    profile.onboarding.resumeSummarized,
    profile.experience.confirmed || hasProject,
    profile.skills.technical.confirmed || skillCount >= 5,
  ].filter(Boolean).length, 5);

  if (!profile.onboarding.resumeUploaded || !profile.onboarding.resumeParsed) blockers.push("Upload and parse a resume, or recover by pasting resume details.");
  if (!profile.identity.fullName.value) blockers.push("Add your full name.");
  if (!profile.identity.email.value) blockers.push("Add your email.");
  if (!profile.identity.location.value) blockers.push("Add your location or preferred base location.");
  if (!hasExperience && !hasProject) blockers.push("Add or confirm at least one experience or project entry.");
  if (skillCount < 5) blockers.push("Confirm at least 5 core skills.");
  if (!profile.professionalProfile.professionalIdentities.value.length) blockers.push("Choose your professional identity.");
  if (!profile.careerIntent.interestedRoles.value.length) blockers.push("Choose at least one target role.");
  if (!profile.careerIntent.preferredMarkets.value.length) blockers.push("Choose at least one target market.");
  if (!profile.careerIntent.workPreference.value) blockers.push("Choose a work preference or mark open.");
  if (profile.onboarding.parseQuality.score > 0 && profile.onboarding.parseQuality.score < 55) blockers.push("Recover weak resume parsing before handoff.");

  if (!profile.identity.phone.value) warnings.push("Phone number is missing.");
  if (!profile.identity.linkedin.value) warnings.push("LinkedIn is missing.");
  const technicalCandidate = skillCount > 0 || profile.professionalProfile.professionalIdentities.value.some((identityValue) => /engineer|developer|data|ai|ml|software/i.test(identityValue));
  if (technicalCandidate && !profile.identity.github.value && !profile.identity.portfolio.value && !profile.identity.website.value) {
    warnings.push("GitHub or portfolio is missing for a technical profile.");
  }
  if (!hasQuantifiedEvidence(profile)) warnings.push("No quantified achievements found.");
  if (profile.onboarding.parseQuality.warnings.length) warnings.push(...profile.onboarding.parseQuality.warnings);
  if (hasIncompleteDates(profile)) warnings.push("Some experience dates are incomplete.");

  if (!profile.projects.value.length) suggestions.push("Add projects if they support your target roles.");
  if (!profile.certifications.value.length) suggestions.push("Add certifications if relevant.");
  if (!hasQuantifiedEvidence(profile)) suggestions.push("Add stronger impact metrics.");
  if (!profile.careerIntent.industriesOfInterest.value.length) suggestions.push("Add preferred industries.");
  if (!profile.resumeWritingPreferences.deEmphasisAreas.confirmed) suggestions.push("Add de-emphasis preferences.");

  const completedCategories = {
    identity,
    experience: hasExperience ? 100 : 0,
    experienceOrProjects,
    education: profile.education.value.length > 0 ? 100 : 0,
    educationOrNotApplicable,
    skills,
    professionalProfile,
    careerIntent,
    resumeWritingSignals: resumeWritingPreferences,
    resumeWritingPreferences,
    qualityAndConfirmation,
  };

  const score = Math.round(
    identity * 0.12 +
      experienceOrProjects * 0.18 +
      educationOrNotApplicable * 0.08 +
      skills * 0.15 +
      professionalProfile * 0.12 +
      careerIntent * 0.20 +
      resumeWritingPreferences * 0.08 +
      qualityAndConfirmation * 0.07,
  );

  return {
    canEnterDashboard: blockers.length === 0 && score >= 80,
    score: Math.max(0, Math.min(100, score)),
    blockers,
    warnings,
    suggestions,
    completedCategories,
  };
}

export const computeReadiness = calculateProfileReadiness;
