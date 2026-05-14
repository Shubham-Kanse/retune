export function normalizeSkill(skill: string): string {
  const map: Record<string, string> = {
    springboot: "Spring Boot",
    "spring boot": "Spring Boot",
    js: "JavaScript",
    reactjs: "React",
    powerbi: "Power BI",
    d365: "Dynamics 365",
  };

  const key = skill.trim().toLowerCase();
  return map[key] ?? skill.trim();
}

export function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];
}
