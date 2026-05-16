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
    { title: "Technical skills", subtitle: "Primary positioning", skills: profile.skills.technical.value },
    { title: "Tools & platforms", subtitle: "Supporting tools", skills: profile.skills.tools.value },
    { title: "Business skills", subtitle: "Business strengths", skills: profile.skills.business.value },
    { title: "Methodologies", subtitle: "Processes & frameworks", skills: profile.skills.methodologies.value },
    { title: "Soft skills", subtitle: "Interpersonal strengths", skills: profile.skills.softSkills.value },
    { title: "Domain skills", subtitle: "Industry-specific", skills: profile.skills.domainSkills.value },
  ];

  return groups
    .map(({ title, subtitle, skills }) => ({
      type: "skill_group" as const,
      id: title.toLowerCase().replace(/\s+/g, "_"),
      title,
      subtitle: `${subtitle} · ${skills.length} found`,
      metadata: [...new Set(skills)].slice(0, 20),
      status: profile.skills.technical.confirmed ? "confirmed" as const : "extracted" as const,
    }))
    .filter((card) => card.metadata.length > 0);
}

export function buildProjectCertificationCards(profile: UserCareerProfile): DisplayCard[] {
  const projects = profile.projects.value.map((project, i) => ({
    type: "project" as const,
    id: project.id ?? `project-${i}`,
    title: project.title || "Project not detected",
    subtitle: [project.role, project.year].filter(Boolean).join(" · "),
    metadata: [
      ...(project.techStack ?? []).slice(0, 6),
      project.impact ?? "",
      project.link ?? "",
    ].filter(Boolean),
    status: profile.projects.confirmed ? "confirmed" as const : "extracted" as const,
  }));

  const certifications = profile.certifications.value.map((certification, i) => ({
    type: "certification" as const,
    id: certification.id ?? `cert-${i}`,
    title: certification.name || "Certification not detected",
    subtitle: [certification.issuer, certification.year].filter(Boolean).join(" · "),
    metadata: [certification.expiresAt ? `Expires ${certification.expiresAt}` : ""].filter(Boolean),
    status: profile.certifications.confirmed ? "confirmed" as const : "extracted" as const,
  }));

  return [...projects, ...certifications];
}

export function buildExtrasCards(profile: UserCareerProfile): DisplayCard[] {
  const cards: DisplayCard[] = [];
  if (profile.languages.value.length > 0) {
    cards.push({ type: "language", id: "languages", title: "Languages", metadata: profile.languages.value, status: profile.languages.confirmed ? "confirmed" : "extracted" });
  }
  if (profile.awards.value.length > 0) {
    cards.push({ type: "award", id: "awards", title: "Awards", metadata: profile.awards.value, status: profile.awards.confirmed ? "confirmed" : "extracted" });
  }
  if (profile.publications.value.length > 0) {
    cards.push({ type: "publication", id: "publications", title: "Publications", metadata: profile.publications.value, status: profile.publications.confirmed ? "confirmed" : "extracted" });
  }
  if (profile.volunteering.value.length > 0) {
    cards.push({ type: "volunteering", id: "volunteering", title: "Volunteering", metadata: profile.volunteering.value, status: profile.volunteering.confirmed ? "confirmed" : "extracted" });
  }
  return cards;
}

export function buildSummaryCards(profile: UserCareerProfile): DisplayCard[] {
  return [
    buildIdentityCard(profile),
    ...buildExperienceCards(profile),
    ...buildEducationCards(profile),
    ...buildSkillCards(profile),
    ...buildProjectCertificationCards(profile),
  ].filter((card) => card.type !== "skill_group" || (card.metadata?.length ?? 0) > 0);
}
