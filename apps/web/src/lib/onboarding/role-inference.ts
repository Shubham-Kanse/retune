import type { UserCareerProfile } from "./types";

const ROLE_RULES: Record<string, { titles: string[]; skills: string[]; roles: string[] }> = {
  software: {
    titles: ["software engineer", "developer", "backend developer", "java developer", "full stack"],
    skills: ["java", "spring boot", "rest api", "microservices", "docker", "aws", "node.js", "express", "kubernetes", "ci/cd", "postgresql", "mongodb"],
    roles: ["Software Engineer", "Backend Developer", "Full Stack Developer"],
  },
  frontend: {
    titles: ["frontend developer", "ui developer", "react developer", "front-end"],
    skills: ["react", "typescript", "javascript", "css", "next.js", "vue", "angular", "tailwind", "html"],
    roles: ["Frontend Developer", "UI Engineer", "Full Stack Developer"],
  },
  data: {
    titles: ["data analyst", "bi analyst", "reporting analyst", "analytics"],
    skills: ["sql", "power bi", "tableau", "excel", "dashboard", "reporting", "analytics", "data modeling"],
    roles: ["Data Analyst", "BI Analyst", "Reporting Analyst"],
  },
  businessAnalysis: {
    titles: ["business analyst", "functional consultant", "systems analyst", "ba"],
    skills: ["requirements", "uat", "jira", "confluence", "stakeholder", "process mapping", "agile"],
    roles: ["Business Analyst", "Functional Consultant", "Systems Analyst"],
  },
  ml: {
    titles: ["ml engineer", "ai engineer", "data scientist", "machine learning"],
    skills: ["python", "pytorch", "tensorflow", "ml", "deep learning", "nlp", "scikit-learn", "computer vision"],
    roles: ["AI/ML Engineer", "Data Scientist", "Machine Learning Engineer"],
  },
  devops: {
    titles: ["devops", "sre", "platform engineer", "cloud engineer", "infrastructure"],
    skills: ["terraform", "kubernetes", "docker", "aws", "gcp", "azure", "ci/cd", "monitoring", "ansible"],
    roles: ["DevOps Engineer", "Platform Engineer", "SRE", "Cloud Engineer"],
  },
  d365: {
    titles: ["d365", "dynamics", "crm consultant", "functional consultant"],
    skills: ["dynamics 365", "power platform", "power apps", "dataverse", "d365"],
    roles: ["D365 Functional Consultant", "Power Platform Consultant"],
  },
};

export function inferRolesFromProfile(profile: UserCareerProfile): string[] {
  const titles = profile.experience.value.map(e => e.title.toLowerCase());
  const skills = [
    ...profile.skills.technical.value,
    ...profile.skills.tools.value,
    ...profile.skills.business.value,
  ].map(s => s.toLowerCase());

  const scores: Array<{ group: string; score: number; roles: string[] }> = [];

  for (const [group, rule] of Object.entries(ROLE_RULES)) {
    let score = 0;
    for (const t of rule.titles) {
      if (titles.some(title => title.includes(t))) score += 3;
    }
    for (const s of rule.skills) {
      if (skills.some(skill => skill.includes(s))) score += 1;
    }
    if (score > 0) scores.push({ group, score, roles: rule.roles });
  }

  scores.sort((a, b) => b.score - a.score);
  const result: string[] = [];
  for (const s of scores.slice(0, 3)) {
    for (const r of s.roles) {
      if (!result.includes(r)) result.push(r);
    }
  }
  return result.slice(0, 5);
}
