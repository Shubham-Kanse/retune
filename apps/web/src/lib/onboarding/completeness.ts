import type { UserCareerProfile, ProfileReadiness } from "./types";
import { createEmptyProfile } from "./session-store";

export function computeReadiness(profile: UserCareerProfile): ProfileReadiness {
  // Safety: ensure profile has the expected structure
  if (!profile?.identity) profile = createEmptyProfile(profile?.userId ?? "");

  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Identity
  let identityScore = 0;
  if (profile.identity.fullName.value) identityScore += 33;
  else blockers.push("Full name missing");
  if (profile.identity.email.value) identityScore += 33;
  else blockers.push("Email missing");
  if (profile.identity.location.value) identityScore += 34;
  else blockers.push("Location missing");
  if (!profile.identity.phone.value) warnings.push("No phone number");
  if (!profile.identity.linkedin.value) suggestions.push("Add LinkedIn for better visibility");

  // Experience
  let experienceScore = 0;
  if (profile.experience.value.length > 0) {
    const hasBasics = profile.experience.value.every(e => e.title && e.company);
    experienceScore = hasBasics ? 80 : 50;
    if (profile.experience.confirmed) experienceScore = 100;
  } else {
    blockers.push("No experience entries");
  }

  // Education
  let educationScore = 0;
  if (profile.education.value.length > 0) {
    educationScore = profile.education.confirmed ? 100 : 80;
  } else {
    blockers.push("No education entries");
  }

  // Skills
  const skillCount = profile.skills.technical.value.length + profile.skills.tools.value.length + profile.skills.business.value.length;
  let skillsScore = Math.min(100, skillCount * 15);
  if (skillCount === 0) blockers.push("No skills found");

  // Professional profile
  let profScore = 0;
  if (profile.professionalProfile.professionalIdentities.confirmed) profScore = 100;
  else if (profile.professionalProfile.professionalIdentities.value.length > 0) profScore = 50;
  else blockers.push("Professional identity not set");

  // Career intent
  let intentScore = 0;
  if (profile.careerIntent.interestedRoles.confirmed) intentScore += 40;
  if (profile.careerIntent.preferredMarkets.confirmed) intentScore += 30;
  if (profile.careerIntent.workPreference.confirmed) intentScore += 30;
  if (intentScore === 0) blockers.push("Career intent not set");

  // Resume writing signals
  let writingScore = profile.resumeWritingPreferences.emphasisAreas.confirmed ? 100 : 0;

  const categories = {
    identity: identityScore,
    experience: experienceScore,
    education: educationScore,
    skills: skillsScore,
    professionalProfile: profScore,
    careerIntent: intentScore,
    resumeWritingSignals: writingScore,
  };

  const totalScore = Math.round(Object.values(categories).reduce((a, b) => a + b, 0) / 7);
  const canEnterDashboard = blockers.length === 0;

  return { canEnterDashboard, score: totalScore, blockers, warnings, suggestions, completedCategories: categories };
}
