import type { ProfileNormalized } from "../contracts";

export function buildProfileMarkdown(profile: ProfileNormalized): string {
  const skills = [...profile.skillsTier1, ...profile.skillsTier2, ...profile.skillsTier3]
    .map((s) => s.name)
    .filter(Boolean);

  return [
    profile.fullName ? `# ${profile.fullName}` : "",
    profile.currentTitle ?? "",
    profile.location ? `**Location:** ${profile.location}` : "",
    profile.targetRoles.length ? `**Target Roles:** ${profile.targetRoles.join(", ")}` : "",
    profile.summary ? `## Summary\n${profile.summary}` : "",
    profile.experience.length
      ? `## Experience\n${profile.experience
          .map((e) => {
            const line1 = `### ${e.title || "Role"} — ${e.company || "Company"}`;
            const line2 = [e.startDate, e.endDate].filter(Boolean).join(" – ");
            return [line1, line2, e.description || ""].filter(Boolean).join("\n");
          })
          .join("\n\n")}`
      : "",
    profile.education.length
      ? `## Education\n${profile.education
          .map((e) => `${e.degree || ""}${e.degree && e.institution ? " — " : ""}${e.institution || ""}`)
          .filter(Boolean)
          .join("\n")}`
      : "",
    skills.length ? `## Skills\n${skills.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
