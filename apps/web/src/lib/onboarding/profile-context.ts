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
  if (profile.identity.github.value) lines.push(`  GitHub: ${profile.identity.github.value}`);
  if (profile.identity.portfolio.value || profile.identity.website.value) lines.push(`  Portfolio: ${profile.identity.portfolio.value || profile.identity.website.value}`);

  // Experience
  if (profile.experience.value.length > 0) {
    lines.push("Experience:");
    for (const e of profile.experience.value) {
      lines.push(`  - ${e.title} at ${e.company} (${e.startDate ?? "?"}\u2013${e.endDate ?? "Present"})`);
      if (e.responsibilities.length) lines.push(`    Responsibilities: ${e.responsibilities.slice(0, 3).join("; ")}`);
      if (e.achievements.length) lines.push(`    Achievements: ${e.achievements.slice(0, 3).join("; ")}`);
      if (e.metrics?.length) lines.push(`    Metrics: ${e.metrics.slice(0, 3).map((m) => [m.metric, m.value].filter(Boolean).join(": ")).join("; ")}`);
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

  if (profile.projects.value.length > 0) {
    lines.push(`Projects: ${profile.projects.value.slice(0, 5).map((p) => p.title).join(", ")}`);
  }
  if (profile.certifications.value.length > 0) {
    lines.push(`Certifications: ${profile.certifications.value.slice(0, 5).map((c) => c.name).join(", ")}`);
  }

  // Career intent (if collected)
  if (profile.careerIntent.interestedRoles.value.length > 0) {
    lines.push(`Interested roles: ${profile.careerIntent.interestedRoles.value.join(", ")}`);
  }
  if (profile.careerIntent.preferredMarkets.value.length > 0) {
    lines.push(`Preferred markets: ${profile.careerIntent.preferredMarkets.value.join(", ")}`);
  }
  if (profile.careerIntent.seniorityComfort.value.length > 0) {
    lines.push(`Seniority comfort: ${profile.careerIntent.seniorityComfort.value.join(", ")}`);
  }
  if (profile.careerIntent.industriesOfInterest.value.length > 0) {
    lines.push(`Industries: ${profile.careerIntent.industriesOfInterest.value.join(", ")}`);
  }
  if (profile.resumeWritingPreferences.deEmphasisAreas.value.length > 0) {
    lines.push(`De-emphasize: ${profile.resumeWritingPreferences.deEmphasisAreas.value.join(", ")}`);
  }

  return lines.join("\n");
}
