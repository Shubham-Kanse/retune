import type { ProfileReadiness, UserCareerProfile } from "./types";

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
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

  const experienceDone = profile.experience.value.length > 0 ? 1 : 0;
  const educationDone = profile.education.value.length > 0 ? 1 : 0;
  const skillCount =
    profile.skills.technical.value.length +
    profile.skills.tools.value.length +
    profile.skills.business.value.length +
    profile.skills.methodologies.value.length +
    profile.skills.softSkills.value.length +
    profile.skills.domainSkills.value.length;
  const skillsDone = skillCount >= 5 ? 1 : 0;
  const professionalDone = profile.professionalProfile.professionalIdentities.value.length > 0 ? 1 : 0;
  const careerDone = [
    profile.careerIntent.interestedRoles.value.length > 0,
    profile.careerIntent.preferredMarkets.value.length > 0,
    Boolean(profile.careerIntent.workPreference.value),
  ].filter(Boolean).length;
  const writingDone = profile.resumeWritingPreferences.emphasisAreas.value.length > 0 ? 1 : 0;

  const completedCategories = {
    identity: pct(identityDone, 3),
    experience: pct(experienceDone, 1),
    education: pct(educationDone, 1),
    skills: pct(skillsDone, 1),
    professionalProfile: pct(professionalDone, 1),
    careerIntent: pct(careerDone, 3),
    resumeWritingSignals: pct(writingDone, 1),
  };

  if (completedCategories.identity < 70) blockers.push("Confirm your name, email, and location.");
  if (completedCategories.experience < 100) blockers.push("Add or confirm at least one experience entry.");
  if (completedCategories.education < 100) blockers.push("Add or confirm education.");
  if (completedCategories.skills < 100) blockers.push("Confirm at least 5 core skills.");
  if (completedCategories.professionalProfile < 100) blockers.push("Choose your professional identity.");
  if (completedCategories.careerIntent < 70) blockers.push("Choose interested roles, market, and work preference.");

  if (!profile.identity.phone.value) warnings.push("Phone number is missing.");
  if (!profile.identity.linkedin.value) warnings.push("LinkedIn is missing.");
  if (completedCategories.resumeWritingSignals === 0) {
    suggestions.push("Add emphasis areas so future resumes can be better positioned.");
  }

  const score = Math.round(
    completedCategories.identity * 0.15 +
      completedCategories.experience * 0.2 +
      completedCategories.education * 0.1 +
      completedCategories.skills * 0.15 +
      completedCategories.professionalProfile * 0.15 +
      completedCategories.careerIntent * 0.2 +
      completedCategories.resumeWritingSignals * 0.05,
  );

  return {
    canEnterDashboard: blockers.length === 0 && score >= 75,
    score,
    blockers,
    warnings,
    suggestions,
    completedCategories,
  };
}

export const computeReadiness = calculateProfileReadiness;
