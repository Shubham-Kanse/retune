import type { UserCareerProfile, OnboardingPhase } from "./types";

export function buildProfileContext(profile: UserCareerProfile, phase: OnboardingPhase): string {
  const lines: string[] = ["[PROFILE CONTEXT]"];

  // Identity
  lines.push("Identity:");
  if (profile.identity.fullName.value) lines.push(`  Name: ${profile.identity.fullName.value}`);
  if (profile.identity.email.value) lines.push(`  Email: ${profile.identity.email.value}`);
  if (profile.identity.phone.value) lines.push(`  Phone: ${profile.identity.phone.value}`);
  if (profile.identity.location.value) lines.push(`  Location: ${profile.identity.location.value}`);
  if (profile.identity.linkedin.value) lines.push(`  LinkedIn: ${profile.identity.linkedin.value}`);

  // Experience
  if (profile.experience.value.length > 0) {
    lines.push("Experience:");
    for (const e of profile.experience.value) {
      lines.push(`  - ${e.title} at ${e.company} (${e.startDate ?? "?"}\u2013${e.endDate ?? "Present"})`);
      if (e.responsibilities.length) lines.push(`    Responsibilities: ${e.responsibilities.slice(0, 3).join("; ")}`);
      if (e.tools.length) lines.push(`    Tools: ${e.tools.join(", ")}`);
    }
  }

  // Education
  if (profile.education.value.length > 0) {
    lines.push("Education:");
    for (const e of profile.education.value) {
      lines.push(`  - ${e.degree} from ${e.institution}${e.graduationYear ? " (" + e.graduationYear + ")" : ""}`);
    }
  }

  // Skills
  const allSkills = [...profile.skills.technical.value, ...profile.skills.tools.value, ...profile.skills.business.value];
  if (allSkills.length > 0) {
    lines.push(`Skills: ${allSkills.slice(0, 15).join(", ")}`);
  }

  // Career intent (if collected)
  if (profile.careerIntent.interestedRoles.value.length > 0) {
    lines.push(`Interested roles: ${profile.careerIntent.interestedRoles.value.join(", ")}`);
  }
  if (profile.careerIntent.preferredMarkets.value.length > 0) {
    lines.push(`Preferred markets: ${profile.careerIntent.preferredMarkets.value.join(", ")}`);
  }

  return lines.join("\n");
}
