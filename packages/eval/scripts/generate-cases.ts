/**
 * Canonical eval case generator.
 *
 * Produces the 5×8×5 = 200 case matrix from the PRD Appendix A spec.
 * Each case is a synthetic but realistic (JD, profile, expert_package)
 * tuple designed to exercise different pipeline paths.
 *
 * Industries (5): saas, fintech, healthcare, legal, manufacturing
 * Seniority (8): new_grad, junior, mid, senior, staff, principal, executive, experienced
 * Markets (5): US, UK, EU, IN, CA
 *
 * Run: npx tsx packages/eval/scripts/generate-cases.ts > packages/eval/src/canonical/cases.jsonl
 */

const INDUSTRIES = ["saas", "fintech", "healthcare", "legal", "manufacturing"] as const;
const SENIORITY = [
  "new_grad",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "executive",
  "experienced",
] as const;
const MARKETS = ["US", "UK", "EU", "IN", "CA"] as const;

const ROLE_FAMILIES: Record<string, string[]> = {
  saas: ["backend_swe", "frontend", "fullstack", "devops", "product_manager"],
  fintech: ["backend_swe", "ml_engineering", "data_engineering", "security", "quant"],
  healthcare: ["fullstack", "data_science", "ml_engineering", "product_manager", "devops"],
  legal: ["fullstack", "data_engineering", "product_manager", "technical_writer", "backend_swe"],
  manufacturing: ["devops", "embedded", "data_engineering", "fullstack", "backend_swe"],
};

const COMPANIES: Record<string, string[]> = {
  saas: ["Figma", "Notion", "Linear", "Vercel", "Datadog"],
  fintech: ["Stripe", "Plaid", "Revolut", "Wise", "Brex"],
  healthcare: ["Oscar Health", "Flatiron Health", "Tempus", "Veeva", "Noom"],
  legal: ["Clio", "LegalZoom", "Relativity", "Ironclad", "Harvey"],
  manufacturing: ["Siemens", "ABB", "Rockwell", "Honeywell", "Tesla"],
};

const YOE: Record<string, [number, number]> = {
  new_grad: [0, 1],
  junior: [1, 3],
  mid: [3, 5],
  senior: [5, 8],
  staff: [8, 12],
  principal: [12, 18],
  executive: [15, 25],
  experienced: [5, 10],
};

const SKILLS_BY_ROLE: Record<string, string[]> = {
  backend_swe: ["Go", "Python", "PostgreSQL", "Kubernetes", "gRPC", "Redis"],
  frontend: ["React", "TypeScript", "CSS", "Next.js", "Playwright", "Storybook"],
  fullstack: ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker", "GraphQL"],
  devops: ["Terraform", "AWS", "Kubernetes", "CI/CD", "Docker", "Prometheus"],
  ml_engineering: ["PyTorch", "Python", "FAISS", "Spark", "MLflow", "A/B testing"],
  data_engineering: ["Spark", "Airflow", "Python", "SQL", "dbt", "Kafka"],
  data_science: ["Python", "R", "SQL", "Pandas", "Scikit-learn", "Tableau"],
  product_manager: ["SQL", "Figma", "Amplitude", "A/B testing", "Roadmapping", "Stakeholder mgmt"],
  security: ["Penetration testing", "SIEM", "Python", "AWS Security", "OWASP", "Terraform"],
  quant: ["Python", "C++", "Statistics", "Linear algebra", "Time series", "Risk modeling"],
  embedded: ["C", "C++", "RTOS", "ARM", "PCB design", "UART/SPI/I2C"],
  technical_writer: ["Markdown", "API docs", "Swagger", "Git", "Diagramming", "UX writing"],
};

function pick<T>(arr: readonly T[], idx: number): T {
  return arr[idx % arr.length]!;
}

function generateCase(industry: string, seniority: string, market: string, idx: number) {
  const roleFamilies = ROLE_FAMILIES[industry]!;
  const roleFamily = pick(roleFamilies, idx);
  const company = pick(COMPANIES[industry]!, idx);
  const [yoeMin, yoeMax] = YOE[seniority]!;
  const yoe = yoeMin + Math.floor((yoeMax - yoeMin) * ((idx % 7) / 7));
  const skills = SKILLS_BY_ROLE[roleFamily] ?? ["Python", "SQL", "Docker"];
  const id = `eval-${String(idx + 1).padStart(3, "0")}-${seniority}-${roleFamily.replace(/_/g, "")}-${market.toLowerCase()}`;

  const seniorityLabel =
    seniority === "new_grad"
      ? "Junior"
      : seniority === "executive"
        ? "VP/Director"
        : seniority.charAt(0).toUpperCase() + seniority.slice(1);

  const jd = `${seniorityLabel} ${roleFamily.replace(/_/g, " ")} — ${company} (${industry}, ${market}). We're looking for a ${seniorityLabel.toLowerCase()} ${roleFamily.replace(/_/g, " ")} with ${yoeMin}–${yoeMax} years of experience. You'll work on ${industry === "fintech" ? "payments infrastructure" : industry === "healthcare" ? "patient data platform" : industry === "legal" ? "contract intelligence" : industry === "manufacturing" ? "IoT control systems" : "our core product platform"}. Required: ${skills.slice(0, 3).join(", ")}. Nice to have: ${skills.slice(3).join(", ")}. We value clear communication, ownership, and delivering impact.`;

  const name = `Candidate-${idx + 1}`;
  const profileSkills = skills.slice(0, 4).join(", ");
  const metric1 = 10 + idx * 3;
  const metric2 = 5 + (idx % 20);

  const profile = `# ${name}\n\n${yoe} years experience in ${roleFamily.replace(/_/g, " ")}.\n\n## Experience\n- **${company} competitor, ${seniorityLabel} (${2024 - yoe}–present)** — Built production ${skills[0]} systems. Improved ${industry === "fintech" ? "transaction throughput" : "system reliability"} by ${metric2}%. Led team of ${Math.max(2, Math.floor(yoe / 2))}.\n\n## Skills\n${profileSkills}\n\n## Education\n${seniority === "new_grad" ? "BS Computer Science, 2025" : `MS/BS in relevant field, ${2024 - yoe - 4}`}`;

  const callbackExpected = seniority !== "new_grad" || idx % 3 !== 2;

  const bullet1 = `Built production ${skills[0]} service that ${industry === "fintech" ? `processed $${metric1}M in daily transactions` : `served ${metric1}k requests/sec`}.`;
  const bullet2 = `Improved ${industry === "fintech" ? "payment success rate" : "system uptime"} by ${metric2}% through ${skills[1]} optimization.`;

  const summary = `${seniorityLabel} ${roleFamily.replace(/_/g, " ")} with ${yoe} years in ${industry}. ${bullet1.slice(0, -1)} at previous role.`;
  const coverLetter = `I'm drawn to ${company}'s ${industry} mission. With ${yoe} years building ${skills[0]} and ${skills[1]} systems, I bring direct experience in ${industry === "fintech" ? "payments" : industry === "healthcare" ? "health data" : industry === "legal" ? "legal tech" : "industrial systems"}.`;

  return {
    id,
    persona: seniority,
    market,
    industry,
    role_family: roleFamily,
    jd_text: jd,
    profile_markdown: profile,
    expert_package: {
      summary,
      experience_bullets: [
        { text: bullet1, evidence_ids: [`${id}-ev1`, `${id}-ev2`] },
        { text: bullet2, evidence_ids: [`${id}-ev3`] },
      ],
      cover_letter: coverLetter,
    },
    expected_outcome: {
      callback_at_human_baseline: callbackExpected,
      notes: callbackExpected
        ? `${seniorityLabel} with direct ${industry} experience; strong skill match.`
        : "Skill gap or seniority mismatch reduces callback probability.",
    },
    rationale: `Generated case: ${industry}/${seniority}/${market}. Tests ${roleFamily} path.`,
  };
}

// Generate the matrix
let idx = 0;
const cases: unknown[] = [];

for (const industry of INDUSTRIES) {
  for (const seniority of SENIORITY) {
    for (const market of MARKETS) {
      cases.push(generateCase(industry, seniority, market, idx));
      idx++;
    }
  }
}

// Output as JSONL
for (const c of cases) {
  console.log(JSON.stringify(c));
}

process.stderr.write(`Generated ${cases.length} cases\n`);
