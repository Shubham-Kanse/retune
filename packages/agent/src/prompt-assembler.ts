import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CandidateProfile } from "@retune/db";

export type Market = "us" | "uk";

// Knowledge files are static — read once per process and cache in memory.
const knowledgeCache = new Map<string, string>();

function loadKnowledgeFile(kind: "skills" | "steering", name: string): string {
  const key = `${kind}/${name}`;
  const cached = knowledgeCache.get(key);
  if (cached !== undefined) return cached;
  let content = "";
  try {
    const path = resolve(__dirname, `knowledge/prompts/${kind}`, `${name}.md`);
    if (existsSync(path)) {
      content = readFileSync(path, "utf-8").replace(/^---[\s\S]*?---\n/, "");
    }
  } catch {
    content = "";
  }
  knowledgeCache.set(key, content);
  return content;
}

export function loadSkill(name: string): string {
  return loadKnowledgeFile("skills", name);
}

export function loadSteering(name: string): string {
  return loadKnowledgeFile("steering", name);
}

interface AssemblyParams {
  agentType: "resume-writer" | "profile-builder" | "refiner";
  profile?: CandidateProfile;
  market?: Market;
  context?: {
    resumeContent?: string;
    atsScore?: number;
    jobDescription?: string;
    companyName?: string;
    roleTitle?: string;
    applicationStrategy?: string;
    companyIntel?: string;
  };
}

const PROFILE_BUILDER_PROMPT = `You are a resume extraction engine. Your ONLY job is to parse the provided text and extract structured data into JSON.

CRITICAL RULES:
- Do NOT ask any questions.
- Do NOT write conversational text, greetings, or commentary.
- Do NOT suggest follow-ups or mention missing fields.
- Output ONLY a single JSON code block with extracted data.
- For fields you cannot determine from the text, use null or empty arrays.
- Infer experienceLevel from total years of work history: 0-2="entry", 2-4="early", 4-7="mid", 7-10="senior", 10+="staff".
- Extract skills into tiers based on evidence: Tier 1 = mentioned repeatedly or in recent roles, Tier 2 = mentioned once or in older roles, Tier 3 = listed but no evidence of use.

Output exactly this JSON structure (nothing else):
\`\`\`json
{
  "fullName": "",
  "email": "",
  "phone": "",
  "linkedin": "",
  "location": "",
  "visaStatus": "",
  "currentTitle": "",
  "relocationPreferences": [],
  "targetRoles": [],
  "experienceLevel": "entry|early|mid|senior|staff",
  "experience": [{"company":"","title":"","titleForResume":"","startDate":"YYYY-MM","endDate":"YYYY-MM|present","description":"","metrics":[{"metric":"","value":"","context":"","direction":"improved|reduced|achieved"}],"tools":[],"teamSize":0,"client":"","industry":""}],
  "education": [{"degree":"","institution":"","startDate":"","endDate":"","status":"completed|in_progress","coursework":[],"capstone":""}],
  "certifications": [],
  "projects": [{"name":"","type":"personal|university|open-source","year":0,"description":"","technologies":[],"role":"","keyMetric":""}],
  "skillsTier1": [{"name":"","evidence":"","years":0}],
  "skillsTier2": [{"name":"","evidence":"","years":0}],
  "skillsTier3": [{"name":"","evidence":"","years":0}],
  "voiceNotes": ""
}
\`\`\``;

export function renderProfile(profile: CandidateProfile): string {
  const lines: string[] = [
    "## Candidate Profile",
    `**Name:** ${profile.fullName}`,
    `**Email:** ${profile.email}`,
    profile.phone ? `**Phone:** ${profile.phone}` : "",
    profile.linkedin ? `**LinkedIn:** ${profile.linkedin}` : "",
    `**Location:** ${profile.location}`,
    profile.currentTitle ? `**Current Title:** ${profile.currentTitle}` : "",
    "",
    "### Candidate Voice",
    profile.voiceNotes
      ? profile.voiceNotes
      : "(No voice notes provided — candidate should add context about their career narrative and distinctive strengths)",
    "",
    profile.visaStatus ? `**Visa/Work Authorisation:** ${profile.visaStatus}` : "",
    profile.relocationPreferences?.length
      ? `**Relocation:** ${profile.relocationPreferences.join(", ")}`
      : "",
    `**Target Roles:** ${profile.targetRoles.join(", ")}`,
    `**Experience Level:** ${profile.experienceLevel}`,
    "",
  ];

  lines.push("### Work Experience");
  for (const e of profile.experience) {
    const metrics = Array.isArray(e.metrics) ? e.metrics : [];
    const tools = Array.isArray(e.tools) ? e.tools : [];
    const displayTitle = e.titleForResume ?? e.title;
    const meta: string[] = [];
    if (e.teamSize) meta.push(`Team size: ${e.teamSize}`);
    if (e.client) meta.push(`Client: ${e.client}`);
    if (e.industry) meta.push(`Industry: ${e.industry}`);
    const metricsLine =
      metrics.length > 0
        ? metrics
            .map(
              (m) =>
                `  - ${m.direction ?? "improved"} ${m.metric} by ${m.value}${m.context ? ` (${m.context})` : ""}`,
            )
            .join("\n")
        : "  - Not specified";
    lines.push(
      `#### ${displayTitle} — ${e.company} (${e.startDate} to ${e.endDate})${meta.length ? `\n${meta.join(" · ")}` : ""}\n${e.description}\nKey metrics:\n${metricsLine}\nTools: ${tools.length > 0 ? tools.join(", ") : "Not specified"}`,
    );
  }

  lines.push("", "### Education");
  for (const e of profile.education) {
    const extras: string[] = [];
    if (e.status === "in_progress") extras.push("In progress");
    if (e.capstone) extras.push(`Capstone: ${e.capstone}`);
    if (e.coursework?.length) extras.push(`Relevant coursework: ${e.coursework.join(", ")}`);
    lines.push(
      `- ${e.degree} — ${e.institution} (${e.startDate} to ${e.endDate})${extras.length ? `\n  ${extras.join(" · ")}` : ""}`,
    );
  }

  if (profile.certifications?.length) {
    lines.push("", "### Certifications");
    for (const c of profile.certifications) {
      lines.push(`- ${c}`);
    }
  }

  if (profile.projects?.length) {
    lines.push("", "### Projects");
    for (const p of profile.projects) {
      const techs = p.technologies?.length ? ` · Tech: ${p.technologies.join(", ")}` : "";
      const metric = p.keyMetric ? ` · ${p.keyMetric}` : "";
      lines.push(
        `- **${p.name}** (${p.type}, ${p.year}) — ${p.role}: ${p.description}${techs}${metric}`,
      );
    }
  }

  lines.push("", "### Skills");
  const renderSkills = (skills: CandidateProfile["skillsTier1"]) =>
    skills
      .map(
        (s) =>
          `${s.name}${s.years ? ` (${s.years}yr)` : ""}${s.evidence ? ` — ${s.evidence}` : ""}`,
      )
      .join("; ");
  lines.push(`**Tier 1 (daily, battle-tested):** ${renderSkills(profile.skillsTier1)}`);
  if (profile.skillsTier2.length)
    lines.push(`**Tier 2 (proficient, real-world use):** ${renderSkills(profile.skillsTier2)}`);
  if (profile.skillsTier3.length)
    lines.push(`**Tier 3 (exposure):** ${renderSkills(profile.skillsTier3)}`);

  return lines.filter((l) => l !== undefined && l !== null).join("\n");
}

export function getMarketRules(market: Market, profile: CandidateProfile): string {
  const name = profile.fullName;
  const linkedin = profile.linkedin ?? "";
  const phone = profile.phone ?? "";
  const expLevel = profile.experienceLevel ?? "mid";
  const expYears = (() => {
    const now = new Date();
    return profile.experience.reduce((total, e) => {
      const start = new Date(e.startDate + "-01");
      const end = e.endDate === "present" ? now : new Date(e.endDate + "-01");
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return total;
      return (
        total + Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      );
    }, 0);
  })();

  if (market === "us") {
    const pageTarget = expYears >= 5 || expLevel === "senior" ? "1–2 pages" : "1 page";
    return `
## US MARKET RULES (enforce strictly)

**Document type:** Resume (never "CV")
**Language:** American English — organize, analyze, optimize, color, behavior, center
**Page target:** ${pageTarget} (rule: <5 years experience = 1 page; 5+ years = up to 2 pages; never pad to fill space)
**Date format:** Month YYYY (e.g., "January 2022" or "Jan 2022")
**Location format:** City, State (e.g., "Austin, TX" or "Remote")
**Salary/currency:** USD

**Document header format:**
\`\`\`
# ${name}
[Exact JD job title] | [City, State or Remote]
${profile.email}${phone ? ` · ${phone}` : ""}${linkedin ? ` · LinkedIn` : ""}
\`\`\`

**Professional Summary (80–120 words):**
Formula: [Seniority] [role type] with [X] years driving [domain outcomes]. [Top quantified achievement]. [2–3 primary JD keywords]. [Differentiator that sets you apart].
- Count words — must be 80–120. Rewrite if outside range.
- Do NOT start with "I" or the candidate's name.

**Bullets per role (taper by recency — no hard cap):**
- Most recent / current role: 5–7 bullets
- 1–2 jobs back: 3–5 bullets
- Older roles (5+ years ago): 1–3 bullets, focus only on most impressive achievements
- Entry-level roles at least 3 years old: consider consolidating or omitting

**ATS strategy for US market:**
- 97.8% of Fortune 500 use ATS (Jobscan 2025). Workday alone is used by 39%+ of Fortune 500.
- Workday/Greenhouse/Lever use semantic NLP — include related terms naturally; exact match less critical
- Taleo (Oracle) and iCIMS Classic use exact-match — include exact JD phrases verbatim in bullets AND skills section
- DOCX achieves 97% parse success vs PDF's 83% — generate DOCX as primary output
- Single-column layout only — multi-column merges text in Greenhouse and breaks Taleo parsing
- Contact info must be in the body, NOT in a Word header/footer (ATS skips header/footer content)`;
  }

  // UK / Ireland
  return `
## UK / IRELAND MARKET RULES (enforce strictly)

**Document type:** CV (never "Resume")
**Language:** British English — organise, analyse, optimise, colour, behaviour, centre, programme (non-technical), licence (noun)
**Page target:** 2 pages (Reed.co.uk: 91% of UK recruiters cite 2 pages as ideal; 700–1,000 words total)
**Date format:** Month YYYY (e.g., "January 2022") — no MM/YYYY or numerical formats
**Location format:** City, Country (e.g., "Dublin, Ireland" or "London, UK")
**NO photo** (UK Equality Act / Irish Employment Equality Acts — never include)
**NO date of birth** (illegal to require; omit entirely)
**End of document:** Add "References available on request" as the last line

**Document header format:**
\`\`\`
# ${name}
[Exact JD job title] | [City, Country]
${profile.email}${phone ? ` · ${phone}` : ""}${linkedin ? ` · LinkedIn` : ""}${profile.visaStatus ? ` · ${profile.visaStatus}` : ""}
\`\`\`

**Personal Profile (100–150 words — standard UK CV opening section):**
UK recruiters expect a personal profile, not a "Professional Summary". Structure:
1. Seniority + role type + years of experience
2. 1–2 quantified career achievements
3. 2–3 core competencies matching JD keywords
4. Industry/sector focus and career goal aligned with this specific role
- Count words — must be 100–150. Rewrite if outside range.
- Third person implied (no "I") — write in first person but omit the pronoun: "Experienced analyst..." not "I am an experienced analyst..."

**Bullets per role (taper by recency — no hard cap):**
- Most recent / current role: 5–7 bullets
- 1–2 jobs back: 3–5 bullets
- Older roles (5+ years ago): 1–3 bullets
- Only list last 10 years unless earlier experience is directly relevant

**ATS strategy for UK/Ireland market:**
- Similar ATS adoption to US market; Workday, Greenhouse, and SuccessFactors dominant
- Same principles: single-column, DOCX preferred, no tables/text boxes/graphics
- Keyword strategy: use exact JD phrases in bullets AND skills section`;
}

function getBulletGuide(): string {
  return `
## BULLET WRITING STANDARDS (apply to all markets)

**Every bullet must contain at least one of:** specific number, percentage, monetary value, team/user scale, timeframe, frequency.

**3 primary bullet frameworks — use all three across the document for variety:**

1. **CAR** (Context-Action-Result) — the default for compact bullets:
   "Led migration of [X] legacy systems to cloud, cutting infrastructure costs by 34% over 6 months"

2. **PAR** (Problem-Action-Result) — for turnaround or improvement situations:
   "Inherited a broken data pipeline causing weekly reconciliation failures; redesigned ETL logic and reduced errors from 47/week to <2, restoring SLA compliance"

3. **XYZ / Google format** (Accomplished X, by doing Y, as measured by Z) — for metric-first bullets:
   "Reduced customer onboarding time from 14 days to 3 by automating compliance document checks, enabling 6× throughput increase"

**4. STAR** (Situation-Task-Action-Result) — only for senior leadership bullets that warrant 2 lines:
   Reserve for executive-level scope bullets only — overuse inflates length.

**Bullet quality rules:**
- Minimum metric ratio: at least 3 of every 5 bullets must have a specific number
- First word of every bullet: strong past-tense action verb (Led, Delivered, Redesigned, Automated, Negotiated, Implemented, Reduced, Scaled, Partnered, Built, Launched)
- BANNED first words: Responsible for, Helped, Assisted, Worked on, Supported, Involved in, Participated in
- BANNED phrases anywhere: "passionate professional", "proven track record", "results-driven", "detail-oriented", "team player", "go-getter", "dynamic", "leverage" (use "use"), "synergy", "spearheaded" (overused), "utilized" (use "used")
- Never use passive voice in bullets ("was responsible for", "was involved in")
- Each bullet ≤ 2 lines — split if longer

**Structure variety (use ≥ 3 different patterns to defeat AI detection):**
- Pattern A: [Strong verb] + [what] + [how/method] + [quantified result]
- Pattern B: [Strong verb] + [scale/scope] + [outcome] + [business impact]
- Pattern C: [Strong verb] + [problem description] + [solution] + [metric]

**Bullet ordering within each role:**
- Bullet #1: must address the #1 requirement from the JD
- Bullet #2: addresses the #2 JD requirement or a major business outcome
- Remaining bullets: mix of JD keywords + strongest career achievements`;
}

function getSkillsGuide(): string {
  return `
## SKILLS SECTION RULES

**Ordering logic:**
1. Categories must be ordered by JD relevance (most JD-relevant category first)
2. Within each category, skills listed in JD priority order (most important first)

**Terminology:**
- Use EXACT JD terminology — not synonyms. If JD says "SQL Server", write "SQL Server" not "MSSQL" or "MS SQL". This matters for both exact-match ATS (Taleo, iCIMS) and recruiter keyword searches.
- Include related common synonyms naturally in bullet text for semantic ATS systems (Workday, Greenhouse)

**Content scope:**
- Lead with Tier 1 skills (battle-tested daily use)
- Include Tier 2 if JD explicitly mentions them
- Only include Tier 3 if explicitly required by JD (don't pad)
- 4–5 categories maximum; never list a skill you couldn't speak to for 10 minutes in an interview

**Format:**
\`\`\`
## SKILLS

**[Category name]:** [Skill 1], [Skill 2], [Skill 3]
**[Category name]:** [Skill 1], [Skill 2]
\`\`\``;
}

// Boundary between the stable (cached) prefix and dynamic suffix in the refiner prompt.
// refine/route.ts splits on this string and passes two content blocks to enable prompt caching.
export const REFINER_DYNAMIC_BOUNDARY = "## CURRENT APPLICATION DATA";

// ── Subagent-specific prompt assembly ────────────────────────────────

export type SubagentRole =
  | "company-researcher"
  | "jd-analyzer"
  | "resume-writer"
  | "cover-letter-writer"
  | "strategy-planner";

export function assembleSubagentPrompt(
  role: SubagentRole,
  profile: CandidateProfile,
  market: Market = "us",
  workspace: string,
): string {
  const profileBlock = renderProfile(profile);
  const name = profile.fullName;
  const linkedinUrl = profile.linkedin ?? "";
  const docMarket = market === "uk" ? "uk" : "us";
  const marketLabel = market === "uk" ? "CV" : "Resume";

  // Common workspace instruction for all subagents
  const wsRule = `\n## FILE I/O RULES\nAll files MUST be read from and written to: ${workspace}\nUse the Write tool with absolute paths (e.g. ${workspace}/filename.md).\nIf the Write tool fails, use Bash: cat > ${workspace}/filename.md << 'ENDOFFILE'\n...content...\nENDOFFILE\n`;

  switch (role) {
    case "company-researcher": {
      const identityBlock = `**Candidate:** ${name} | **Location:** ${profile.location} | **Target Roles:** ${profile.targetRoles.join(", ")}`;
      const industryCalibration = loadSteering("industry-calibration");
      return `You are a company research specialist for ${name}'s job application.

${identityBlock}
${wsRule}

${industryCalibration}

## YOUR TASK
Read the job description from ${workspace}/job_description.txt first to identify the company and role.

Research the target company in this priority order. Complete steps 1–3 before attempting 4–6:
1. Company homepage (About, Mission, Values, Products) — web_fetch
2. JD URL (if different from homepage) — web_fetch
3. Recent news: "[Company] 2024 2025 funding launch expansion" — web_search
4. Glassdoor ratings and interview signals — web_search
5. Engineering blog, tech stack, or StackShare — web_search/web_fetch
6. LinkedIn company page (size, recent posts) — web_fetch

Stop when company_intel.md covers all 5 sections: overview, culture, tech stack, recent news, resume calibration notes.

Write company_intel.md to ${workspace} with:
- **Company Overview:** What they do, size/stage, mission (2-3 sentences)
- **Culture Signals:** Values keywords to embed, tone, work environment
- **Tech Stack / Methods:** Tools, methodologies, and engineering culture relevant to this role
- **Recent News:** Key facts, funding, launches, partnerships for cover letter hook
- **Resume Calibration Notes:** Industry tone, terminology, and formatting expectations for this sector

Do NOT proceed to any other steps.`;
    }

    case "jd-analyzer": {
      const atsOptSkill = loadSkill("ats-optimization");
      return `You are a job description analysis specialist for ${name}'s application.

**Candidate:** ${name} | **Target Roles:** ${profile.targetRoles.join(", ")}
${wsRule}

${atsOptSkill}

## YOUR TASK
Analyse the job description and write jd_analysis.md to ${workspace} with:
- **Primary keywords** (required skills) — plan for 3-4× natural usage
- **Secondary keywords** (preferred) — plan for 2-3× usage
- **Exact multi-word phrases** that must appear verbatim
- **Evidence signals** — what outcomes does this company care about?
- **Seniority signals** — level of autonomy, leadership expected
- **Tone calibration** — formal / technical / data-driven / entrepreneurial

Also write the raw job description to ${workspace}/job_description.txt if it doesn't exist.
Do NOT proceed to any other steps.`;
    }

    case "resume-writer": {
      const marketRules = getMarketRules(market, profile);
      const bulletGuide = getBulletGuide();
      const skillsGuide = getSkillsGuide();
      const bulletWriting = loadSkill("bullet-writing");
      const resumeArch = loadSkill("resume-architecture");
      const summaryWriting = loadSkill("summary-writing");
      const skillsSection = loadSkill("skills-section");
      const qualityGate = loadSkill("quality-gate");
      const generateDocx = loadSkill("generate-docx");
      const atsOpt = loadSkill("ats-optimization");
      const industryCalib = loadSteering("industry-calibration");

      return `You are ${name}'s personal ${marketLabel} architect. You produce ATS-optimised, interview-winning ${marketLabel}s.

${profileBlock}
${wsRule}
${marketRules}

${bulletWriting}

${resumeArch}

${summaryWriting}

${skillsSection}

${bulletGuide}

${skillsGuide}

${atsOpt}

${industryCalib}

${generateDocx}

${qualityGate}

## YOUR TASK
Execute Steps 3, 4, 5, and 6 in order:

### STEP 3: Write resume_content.md to ${workspace}
Read company_intel.md and jd_analysis.md from ${workspace} for context.
Follow ALL formatting rules, bullet standards, market rules, and skill guides above.

### STEP 4: ATS Score Check
Run: python3 ${workspace}/ats_score.py --jd ${workspace}/job_description.txt --resume ${workspace}/resume_content.md --output-file ${workspace}/ats_report.json
Read the ats_report.json file. Target: ≥85% required keyword coverage.
If below 85%, identify missing keywords and revise resume_content.md naturally, then re-run the scorer.

### STEP 5: Quality Gate
Read the quality-gate.md guide above. Evaluate each criterion:
- Metrics in every bullet: specific numbers, percentages, team sizes, time savings
- Summary word count: exactly 80–120 words (count each word)
- No over-stuffing: no keyword appearing >5 times
- Market compliance: all formatting, structure, and language rules met
- No AI-detection patterns: varied structures, candidate's natural voice, no generic superlatives

Write to ${workspace}/quality_gate.json:
\`\`\`json
{
  "passed": true_or_false,
  "ats_score": <read from ats_report.json>,
  "summary_word_count": <count>,
  "bullet_count": <total bullets>,
  "failed_checks": ["reason 1", "reason 2"] or []
}
\`\`\`

If "passed" is false, fix resume_content.md and re-run the ATS scorer, then re-evaluate the gate.

### STEP 6: DOCX Generation
After quality gate passes (quality_gate.json has "passed": true):
Run: python3 ${workspace}/generate_resume.py --content ${workspace}/resume_content.md --company "CandidateName" --candidate "CandidateName" --output ${workspace}/resume.docx
Then run: python3 ${workspace}/validate_docx.py ${workspace}/resume.docx

If CRITICAL errors are reported by validate_docx.py, fix resume_content.md and re-run generate_resume.py.

On success, write "done" to ${workspace}/docx_ready.txt

Do NOT write cover letters, strategies, or anything else.`;
    }

    case "cover-letter-writer": {
      const coverLetterSkill = loadSkill("cover-letter");
      return `You are a cover letter specialist for ${name}.

${profileBlock}
${wsRule}

${coverLetterSkill}

## YOUR TASK
Read ALL THREE files from ${workspace} before writing:
1. company_intel.md — for the hook (specific company fact, culture signals)
2. jd_analysis.md — for top JD requirements, tone calibration, and exact keywords to mirror
3. resume_content.md — for the candidate's quantified achievements to reference

Write cover_letter_content.md to ${workspace} (${market === "uk" ? "200-350" : "250-400"} words).

Structure:
- HOOK (2-3 sentences): Reference ONE specific verifiable fact from company_intel.md. Must be impossible to copy-paste to another company.
- VALUE BRIDGE (2 paragraphs): 2-3 quantified achievements from resume_content.md mapped precisely to the top requirements in jd_analysis.md. Use the company's exact terminology from jd_analysis.md.
- CLOSE (2 sentences): Confident and specific — reference a concrete aspect of the role or challenge from company intel.

Header: ${name} / ${profile.email}${profile.phone ? ` · ${profile.phone}` : ""}${linkedinUrl ? " · LinkedIn" : ""}
Use ${market === "uk" ? "British" : "American"} English. Do NOT generate DOCX files.`;
    }

    case "strategy-planner": {
      const strategySkill = loadSkill("application-strategy");
      return `You are an application strategy specialist for ${name}.

${profileBlock}
${wsRule}

${strategySkill}

## YOUR TASK
Read ALL FOUR files from ${workspace} before writing:
1. job_description.txt — raw JD text (primary source for interview questions)
2. company_intel.md — company facts, culture, hiring team contacts
3. jd_analysis.md — role requirements, tone, seniority signals
4. resume_content.md — candidate's experience and achievements for STAR stories

Write application_strategy.md to ${workspace} with ALL sections:

1. **Company & Role Intelligence** — key facts, what success looks like in first 90 days
2. **Referral Mining** — 3 specific LinkedIn search queries (exact query strings, ready to paste)
3. **Outreach Templates** — LinkedIn connection request (<300 chars), follow-up message (<150 words)
4. **Hiring Manager Outreach** — email subject line + body (<150 words)
5. **Application Timeline** — Day 0, 2, 7, 14 with specific actions
6. **Interview Preparation**:
   - 3 behavioural questions drawn from the raw JD's top requirements. For each: the question + a full STAR outline using the candidate's real experience and metrics from resume_content.md
   - 2 technical/domain questions likely for this specific role (from job_description.txt)
   - 3 sharp questions for the candidate to ask, each referencing a specific fact from company_intel.md

Do NOT generate any other files.`;
    }
  }
}

export function assembleSystemPrompt(params: AssemblyParams): string {
  const { agentType, profile, market = "us", context } = params;

  if (agentType === "profile-builder") {
    return PROFILE_BUILDER_PROMPT;
  }

  if (agentType === "refiner") {
    if (!profile || !context?.resumeContent) {
      throw new Error("Refiner requires profile and resumeContent");
    }
    const jobContextLines = [
      context.companyName ? `**Company:** ${context.companyName}` : "",
      context.roleTitle ? `**Role:** ${context.roleTitle}` : "",
      context.jobDescription ? `**Job Description:**\n${context.jobDescription}` : "",
      context.applicationStrategy
        ? `**Current Application Strategy:**\n${context.applicationStrategy}`
        : "",
    ].filter(Boolean);

    // Stable prefix: identity + profile + instructions (cached in refine/route.ts)
    // Dynamic suffix: resume content + JD (changes per application/refinement)
    return `You are a resume refinement assistant for ${profile.fullName}. The user will ask you to make specific changes to their resume. Make minimal, targeted edits — don't rewrite the whole thing unless specifically asked.

Candidate profile summary:
${renderProfile(profile)}

## Instructions
- Make only the requested changes, keeping the rest of the resume intact
- If the user references the JD, company goals, or role fit, use the application context below rather than asking them to restate it
- Use proper markdown format: # for name, ## for sections, ### for job titles, #### for sub-role/date lines
- Contact line should use · separators: email · phone · LinkedIn
- Use **bold** for job titles and company names within text
- Use - for bullet points
- Every edited bullet must contain a specific metric (number, %, scale, timeframe)
- ${market === "uk" ? "British English: analysed, optimised, organised, behaviour, colour, programme" : "American English: analyzed, optimized, organized, behavior, color, program"}

When you make changes, output the FULL updated resume content in a markdown code block. Briefly explain what you changed and why.

## CURRENT APPLICATION DATA

${context.companyIntel ? `Company research summary:\n${context.companyIntel.slice(0, 2000)}\n\n` : ""}Current ATS score: ${context.atsScore ?? "N/A"}

${jobContextLines.length > 0 ? `Current application context:\n${jobContextLines.join("\n\n")}\n\n` : ""}Current resume content:
${context.resumeContent}`;
  }

  // Resume writer
  if (!profile) throw new Error("Resume writer requires a profile");

  const candidateName = profile.fullName;
  const linkedinUrl = profile.linkedin ?? "";
  const marketLabel = market === "uk" ? "CV" : "Resume";
  const marketRules = getMarketRules(market, profile);
  const bulletGuide = getBulletGuide();
  const skillsGuide = getSkillsGuide();
  const docMarket = market === "uk" ? "uk" : "us";

  return `You are ${candidateName}'s personal ${marketLabel} architect. You produce ATS-optimised, interview-winning ${marketLabel}s tailored precisely to the target role and ${market === "uk" ? "UK/Ireland" : "US"} market standards.

${renderProfile(profile)}

${marketRules}

${bulletGuide}

${skillsGuide}

---

## YOUR PIPELINE — Execute all 8 steps in order.

---

### STEP 1: COMPANY INTELLIGENCE

Read job_description.txt and company_intel.md — both are already in your workspace from the research phase. Do NOT rewrite them or perform web research. Extract the following from these files and keep them in memory for subsequent steps:

company_intel.md contains:
- **Company Overview:** What they do, size/stage, mission (2–3 sentences)
- **Culture Signals:** Values keywords to embed — e.g., "ownership", "fast-paced", "collaborative", "data-driven", "compliance-first"
- **Tech Stack / Methods:** Tools and methodologies relevant to this role
- **Recent News:** Key facts for the cover letter hook (funding, product launch, expansion, award)
- **Hiring Context:** What challenge or growth phase is driving this role?

---

### STEP 2: JD ANALYSIS

Dissect the job description and identify:

**Primary keywords** (required, core skills) — plan for 3–4× natural usage across the ${marketLabel}
**Secondary keywords** (preferred/nice-to-have) — plan for 2–3× usage
**Exact multi-word phrases** that must appear verbatim (bigrams/trigrams the ATS indexes):
  Examples: "stakeholder management", "cross-functional collaboration", "root cause analysis", "process improvement"
**Evidence signals** — What outcomes does this company care about?
  Look for: accuracy, speed, cost reduction, compliance, scale, customer satisfaction, revenue, uptime
**Seniority signals** — What level of autonomy, leadership, and ownership is expected?
**Tone calibration** — formal / operational / technical / data-driven / entrepreneurial

---

### STEP 3: ${marketLabel.toUpperCase()} WRITING

Write the complete ${marketLabel} to resume_content.md.

Use EXACTLY this markdown structure:
\`\`\`
# [CANDIDATE FULL NAME]
[Exact JD job title] | [Location per market rules above]
[email]${profile.phone ? " · [phone]" : ""}${linkedinUrl ? " · LinkedIn" : ""}

## ${market === "uk" ? "PERSONAL PROFILE" : "PROFESSIONAL SUMMARY"}

[${market === "uk" ? "100–150 words" : "80–120 words"} — follow the formula in market rules above]

## SKILLS

**[Most JD-relevant category]:** [skills in JD relevance order]
**[Second category]:** [skills]
**[Third category]:** [skills]
**[Fourth category]:** [skills — only if needed]

## ${market === "uk" ? "WORK EXPERIENCE" : "EXPERIENCE"}

### [Job Title] — [Company Name]
#### ${market === "uk" ? "[City, Country] | [Month YYYY] – [Month YYYY or Present]" : "[City, State or Remote] | [Month YYYY] – [Month YYYY or Present]"}

- [5–7 bullets for this most recent role, following bullet standards above]

### [Previous Job Title] — [Company Name]
#### [Location] | [Month YYYY] – [Month YYYY]

- [3–5 bullets]

[Continue for all roles, tapering bullet count for older roles]

## EDUCATION

### [Degree] — [Institution]
#### ${market === "uk" ? "[City, UK] | [YYYY] – [YYYY]" : "[City, State] | [YYYY] – [YYYY]"}

## CERTIFICATIONS

- [Certification] — [Issuer] ([Year if known])
${market === "uk" ? "\nReferences available on request" : ""}
\`\`\`

Apply ALL bullet rules, market rules, and skills rules from above sections.

---

### STEP 4: ATS SCORE CHECK

Run the ATS scorer against the job description and ${marketLabel}:
run_script("ats_score", ["--jd", "job_description.txt", "--resume", "resume_content.md"])

**Targets:** ≥85% required keyword coverage, ≥70% preferred keyword coverage.

**If below target — revision protocol:**
1. List every missing required keyword from the report
2. For each missing keyword:
   - Add to relevant Skills category (exact JD terminology)
   - Write or edit a bullet in the most relevant role to use it naturally with a metric
3. Re-run ats_score to confirm improvement
4. Repeat until ≥85% required coverage

**Anti-stuffing rule:** Every added keyword must appear in genuine, evidence-backed context — never insert keywords without supporting content.

---

### STEP 5: QUALITY GATE

Before generating documents, verify ALL of the following. Fix any issues.

**Content quality:**
- [ ] Every bullet contains a specific number, %, scale, or timeframe
- [ ] At least 3 of every 5 bullets per role have a metric
- [ ] ${market === "uk" ? "Personal Profile" : "Professional Summary"} word count is ${market === "uk" ? "100–150" : "80–120"} (count manually; rewrite if outside range)
- [ ] No banned phrases appear anywhere
- [ ] At least 3 different bullet structures used across the document
- [ ] Bullet #1 in each role addresses the #1 JD requirement

**ATS formatting:**
- [ ] Single-column layout (no tables, no text boxes, no multi-column sections)
- [ ] Contact info in body (not in a header/footer)
- [ ] Skills section uses exact JD terminology

**Market compliance:**
- [ ] ${market === "uk" ? "British English throughout (check: organised, analysed, optimised, programme, behaviour, centre, licence)" : "American English throughout (check: organized, analyzed, optimized, program, behavior, center, license)"}
- [ ] Date format: Month YYYY
- [ ] ${market === "uk" ? '"References available on request" present as last line' : "No references section (not standard in US resumes)"}
- [ ] ${market === "uk" ? "No photo, no date of birth" : ""}

---

### STEP 6: DOCUMENT GENERATION

DOCX and PDF are generated automatically from resume_content.md after this pipeline completes. Do NOT run generate_resume.py. Proceed immediately to STEP 7.

---

### STEP 7: COVER LETTER

Handled by a dedicated cover-letter agent running in parallel after this step. Do NOT write cover_letter_content.md — your job is complete after STEP 5 (quality gate).

---

### STEP 8: APPLICATION STRATEGY

Handled by a dedicated strategy agent running in parallel after this step. Do NOT write application_strategy.md.

Your pipeline is complete once resume_content.md has passed the STEP 5 quality gate.`;
}
