import type { DisplayCard, UserCareerProfile } from "./types";

export function buildIdentityCard(profile: UserCareerProfile): DisplayCard {
  return {
    type: "identity",
    title: profile.identity.fullName.value || "Name not found",
    subtitle: [profile.identity.email.value, profile.identity.location.value].filter(Boolean).join(" · "),
    metadata: [profile.identity.phone.value, profile.identity.linkedin.value].filter(Boolean),
    status: profile.identity.fullName.confirmed ? "confirmed" : "extracted",
  };
}

export function buildExperienceCards(profile: UserCareerProfile): DisplayCard[] {
  return profile.experience.value.map((exp, i) => ({
    type: "experience",
    id: exp.id ?? `exp-${i}`,
    title: exp.title || "Role not detected",
    subtitle: [exp.company, [exp.startDate, exp.endDate || "Present"].filter(Boolean).join(" – ")]
      .filter(Boolean)
      .join(" · "),
    metadata: [...exp.tools.slice(0, 5), ...exp.skills.slice(0, 5)],
    confidence: exp.confidence,
    status: profile.experience.confirmed ? "confirmed" : "extracted",
  }));
}

export function buildEducationCards(profile: UserCareerProfile): DisplayCard[] {
  return profile.education.value.map((edu, i) => ({
    type: "education",
    id: edu.id ?? `edu-${i}`,
    title: edu.degree || "Degree not detected",
    subtitle: [edu.institution, edu.endDate || edu.graduationYear].filter(Boolean).join(" · "),
    metadata: [edu.fieldOfStudy, edu.location].filter(Boolean) as string[],
    status: profile.education.confirmed ? "confirmed" : "extracted",
  }));
}

export function buildSkillCards(profile: UserCareerProfile): DisplayCard[] {
  const groups = [
    { title: "Tier 1 skills", subtitle: "Primary positioning", skills: profile.skills.technical.value },
    { title: "Tier 2 skills", subtitle: "Supporting tools", skills: profile.skills.tools.value },
    { title: "Tier 3 skills", subtitle: "Additional strengths", skills: profile.skills.business.value },
  ];

  return groups
    .map(({ title, subtitle, skills }) => ({
      type: "skill_group" as const,
      id: title.includes("Tier 1") ? "technical" : title.includes("Tier 2") ? "tools" : "business",
      title,
      subtitle: `${subtitle} · ${skills.length} found`,
      metadata: [...new Set(skills)].slice(0, 20),
      status: profile.skills.technical.confirmed ? "confirmed" as const : "extracted" as const,
    }))
    .filter((card) => card.metadata.length > 0);
}

export function buildSummaryCards(profile: UserCareerProfile): DisplayCard[] {
  return [
    buildIdentityCard(profile),
    ...buildExperienceCards(profile),
    ...buildEducationCards(profile),
    ...buildSkillCards(profile),
  ].filter((card) => card.type !== "skill_group" || (card.metadata?.length ?? 0) > 0);
}
