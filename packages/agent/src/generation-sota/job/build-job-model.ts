/**
 * Deterministic JobModel builder (003 §6.3).
 *
 * Projects a raw JD text into the typed JobModel. Rule-based:
 *
 *   - Sentence-level discourse classification picks up legal,
 *     boilerplate, aspiration, hard-filter, and actual-test sentences.
 *   - Requirements are extracted as bullet-led or "X+ years"
 *     constructs.
 *   - Hidden constraints (security clearance, citizenship, work auth,
 *     drug test, background check) raise typed entries.
 *   - ATS keywords are derived from the requirement list with
 *     normalised forms + section hints.
 *
 * The result is byte-stable for the same input so different call sites
 * (Temporal vs in-memory) reach identical job_model rows.
 */

import { createHash } from "node:crypto";
import {
  type AtsKeyword,
  type HiddenConstraint,
  type JobModel,
  JobModelSchema,
  type Requirement,
  type RequirementGroup,
  type ScorecardLine,
} from "@retune/types";

const HARD_FILTER_PATTERNS = [
  /^must have/i,
  /^required:/i,
  /^minimum/i,
  /\bonly\b.*\bcandidates\b/i,
  /\bmandatory\b/i,
  /\b(?:active|valid)\s+(?:security\s+)?clearance\b/i,
  /\b(?:US|U\.S\.|United States)\s+(?:citizen|citizenship)\b/i,
  /\bauthor[is]z(?:ed|ation)\s+to\s+work\b/i,
];

const BOILERPLATE_PATTERNS = [
  /\bequal opportunity employer\b/i,
  /\breasonable accommodations?\b/i,
  /\bwithout regard to\b/i,
  /\bcompetitive (?:salary|benefits)\b/i,
  /\b(?:401\(?k\)?|health\s+insurance|dental|vision|stock\s+options)\b/i,
  /\bunlimited\s+pto\b/i,
  /\bremote[-\s]?friendly\b/i,
];

const HIDDEN_CONSTRAINT_RULES: Array<{
  category: HiddenConstraint["category"];
  pattern: RegExp;
  severity: HiddenConstraint["severity"];
}> = [
  {
    category: "security_clearance",
    pattern:
      /\b(?:active\s+)?(?:US\s+)?(?:security\s+clearance|secret|top[-\s]?secret|TS\/SCI|SCI|public\s+trust)\b/i,
    severity: "dealbreaker",
  },
  {
    category: "citizenship",
    pattern: /\b(?:US|U\.S\.|United States|UK|British)\s+(?:citizen|citizenship)\b/i,
    severity: "hard",
  },
  {
    category: "work_authorization",
    pattern:
      /\b(?:must\s+)?(?:be\s+)?author[is]z(?:ed|ation)\s+to\s+work|\bH-?1B\b|\bvisa\s+sponsorship\s+not\b/i,
    severity: "hard",
  },
  {
    category: "background_check",
    pattern: /\bbackground\s+check\b|\bcriminal\s+background\b/i,
    severity: "soft",
  },
  { category: "drug_test", pattern: /\bdrug\s+(?:test|screen)\b/i, severity: "soft" },
  { category: "non_compete", pattern: /\bnon[-\s]compete\b/i, severity: "soft" },
  {
    category: "geo_lock",
    pattern: /\bonsite\s+(?:only|required)\b|\bin[-\s]?office\s+(?:only|required)\b/i,
    severity: "soft",
  },
  {
    category: "tenure_min",
    pattern: /\b(\d+)\+?\s+years?\s+(?:minimum|required|of\s+experience)\b/i,
    severity: "hard",
  },
  {
    category: "education_min",
    pattern: /\b(?:bachelor|master|phd|m\.?s\.?|b\.?s\.?)\s+(?:degree|required|preferred)?/i,
    severity: "soft",
  },
  {
    category: "language",
    pattern: /\b(?:fluent|native)\s+in\s+(?:english|german|french|spanish|mandarin|japanese)\b/i,
    severity: "soft",
  },
];

const ROLE_FAMILY_HINTS: Record<string, RegExp> = {
  backend_swe:
    /\b(?:backend|server[-\s]?side|api|distributed\s+systems)\s+(?:engineer|developer)\b/i,
  frontend_swe: /\b(?:frontend|front[-\s]end|web|UI)\s+(?:engineer|developer)\b/i,
  fullstack_swe: /\b(?:full[-\s]?stack)\s+(?:engineer|developer)\b/i,
  mle: /\b(?:machine\s+learning|ML|MLE|AI)\s+(?:engineer|scientist)\b/i,
  data_eng: /\bdata\s+engineer\b/i,
  pm: /\bproduct\s+manager\b/i,
  dev_advocate: /\b(?:developer|dev)\s+(?:advocate|relations|evangelist)\b/i,
  sre: /\b(?:site\s+reliability|SRE|platform\s+engineer)\b/i,
  security: /\bsecurity\s+(?:engineer|analyst|architect)\b/i,
};

const COMMON_SKILL_TERMS = [
  "kubernetes",
  "docker",
  "aws",
  "gcp",
  "azure",
  "terraform",
  "react",
  "next.js",
  "node.js",
  "typescript",
  "javascript",
  "python",
  "go",
  "rust",
  "java",
  "kotlin",
  "swift",
  "graphql",
  "rest",
  "grpc",
  "postgresql",
  "mongodb",
  "redis",
  "kafka",
  "rabbitmq",
  "spark",
  "snowflake",
  "dbt",
  "airflow",
];

export interface BuildJobModelInput {
  jd_id: string;
  jd_text: string;
  jd_title_hint?: string;
  market?: "US" | "UK";
}

export interface BuildJobModelResult {
  job_model: JobModel;
  warnings: string[];
}

export function buildJobModelDeterministic(input: BuildJobModelInput): BuildJobModelResult {
  const warnings: string[] = [];
  const text = input.jd_text.slice(0, 50_000);

  // ── 1. Sentence segmentation + discourse classification ──────────────
  const sentences = splitSentences(text);
  const requirements: Requirement[] = [];
  const requirement_groups: RequirementGroup[] = [];
  const hidden_constraints: HiddenConstraint[] = [];
  const ats_keywords_set = new Map<string, AtsKeyword>();
  const hard_filters: string[] = [];
  const soft_preferences: string[] = [];
  const compensation_signals: string[] = [];
  const location_constraints: string[] = [];
  const work_authorization_constraints: string[] = [];
  const interview_topics: string[] = [];

  let charCursor = 0;
  for (const s of sentences) {
    const ds = classifyDiscourse(s);
    const start = text.indexOf(s, charCursor);
    const end = start >= 0 ? start + s.length : null;
    if (start >= 0) charCursor = end ?? charCursor;

    // ── boilerplate suppression ──
    if (ds === "boilerplate" || ds === "legal") {
      // Hidden constraints can hide inside legal text — still scan them.
    }

    // ── requirement extraction ──
    if (ds === "filter" || ds === "actual_test") {
      const yearsBand = extractYearsBand(s);
      const isHardFilter = HARD_FILTER_PATTERNS.some((p) => p.test(s));
      const reqId = `req:${stableHash(s).slice(0, 12)}`;
      const req: Requirement = {
        id: reqId,
        text: s,
        normalized: normalizeReq(s),
        criticality: isHardFilter ? "hard_filter" : "must_have",
        is_hard_filter: isHardFilter,
        group_id: null,
        years_min: yearsBand?.[0] ?? null,
        years_max: yearsBand?.[1] ?? null,
        discourse_function: ds,
        char_start: start >= 0 ? start : null,
        char_end: end ?? null,
      };
      requirements.push(req);
      if (isHardFilter) hard_filters.push(s);
    }
    if (ds === "aspiration") soft_preferences.push(s);

    // ── hidden constraints ──
    for (const rule of HIDDEN_CONSTRAINT_RULES) {
      if (rule.pattern.test(s)) {
        hidden_constraints.push({
          id: `hc:${stableHash(`${rule.category}:${s}`).slice(0, 12)}`,
          category: rule.category,
          text: s,
          severity: rule.severity,
          source_quote: s,
        });
        if (rule.category === "work_authorization" || rule.category === "citizenship") {
          work_authorization_constraints.push(s);
        }
        if (rule.category === "geo_lock") location_constraints.push(s);
      }
    }

    // ── compensation signals ──
    if (
      /\$\s?\d{2,3}(?:[,]\d{3})?(?:\s*[-–]\s*\$?\d{2,3}(?:[,]\d{3})?)?\s*(?:k|K|\/yr|per\s+year)?/.test(
        s,
      )
    ) {
      compensation_signals.push(s.trim());
    }

    // ── interview topic hints ──
    if (/\b(?:will\s+ask|interview|panel|onsite|technical\s+screen)\b/i.test(s)) {
      interview_topics.push(s.trim());
    }
  }

  // ── 2. ATS keyword extraction ────────────────────────────────────────
  // Pick obvious keywords from requirement text + a curated technology
  // list. The score reflects how often the keyword shows up in
  // requirements (capped at 1.0).
  for (const req of requirements) {
    for (const term of COMMON_SKILL_TERMS) {
      const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
      if (re.test(req.text)) {
        const key = term.toLowerCase();
        const existing = ats_keywords_set.get(key);
        if (existing) {
          existing.weight = Math.min(1, existing.weight + 0.1);
        } else {
          ats_keywords_set.set(key, {
            id: `ats:${key}`,
            surface: term,
            normalized: key,
            variants: variantsFor(term),
            preferred_section: term === "leadership" ? "summary" : "skills",
            weight: 0.6,
          });
        }
      }
    }
  }

  // Promote keywords that appear in hard filters.
  for (const f of hard_filters) {
    for (const term of COMMON_SKILL_TERMS) {
      const re = new RegExp(`\\b${escapeRegex(term)}\\b`, "i");
      if (re.test(f)) {
        const k = term.toLowerCase();
        const existing = ats_keywords_set.get(k);
        if (existing) existing.weight = Math.min(1, existing.weight + 0.2);
      }
    }
  }

  // ── 3. Role family + seniority + scorecards ─────────────────────────
  const roleTitle = input.jd_title_hint ?? findTitle(text) ?? "";
  const roleFamily = inferRoleFamily(text);
  const seniority = inferSeniority(roleTitle + " " + text.slice(0, 500));
  const yoe_band = inferYoeBand(text);

  const recruiter_scorecard = buildRecruiterScorecard(requirements, ats_keywords_set);
  const hiring_manager_scorecard = buildHiringManagerScorecard(requirements);

  // ── 4. Compute posting noise score ───────────────────────────────────
  const total = sentences.length;
  const boilerplate_count = sentences.filter((s) =>
    BOILERPLATE_PATTERNS.some((p) => p.test(s)),
  ).length;
  const noise = total === 0 ? 0 : Math.min(1, boilerplate_count / total);

  // ── 5. Assemble + parse ──────────────────────────────────────────────
  if (requirements.length === 0) warnings.push("no_requirements_extracted");
  if (hidden_constraints.length > 0)
    warnings.push(`${hidden_constraints.length}_hidden_constraints`);

  const job_model: JobModel = {
    schema_version: "sota-v3",
    jd_id: input.jd_id,
    jd_hash: stableHash(text),
    canonical_text: text,
    canonical_text_truncated: input.jd_text.length > 50_000,
    posting_source: detectSource(text),
    role_title_normalized: normalizeReq(roleTitle),
    role_title_raw: roleTitle,
    role_family: roleFamily,
    seniority,
    yoe_band,
    market: input.market ?? "US",
    language: "en",
    requirements,
    requirement_groups,
    hard_filters,
    soft_preferences,
    ats_keywords: Array.from(ats_keywords_set.values()),
    hidden_constraints,
    recruiter_scorecard,
    hiring_manager_scorecard,
    interview_topics,
    compensation_signals,
    location_constraints,
    work_authorization_constraints,
    posting_noise_score: noise,
    built_at: new Date().toISOString(),
  };

  return { job_model: JobModelSchema.parse(job_model), warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z•·\-\*])|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 500);
}

type DiscourseFunction = Requirement["discourse_function"];

function classifyDiscourse(s: string): DiscourseFunction {
  if (BOILERPLATE_PATTERNS.some((p) => p.test(s))) return "boilerplate";
  if (/\b(?:as defined|in accordance with|pursuant to|equal opportunity)\b/i.test(s))
    return "legal";
  if (HARD_FILTER_PATTERNS.some((p) => p.test(s))) return "filter";
  if (/^\s*(?:[•\-\*]\s+|\d+\.\s+)/.test(s)) return "actual_test";
  if (/\b(?:experience\s+with|proficiency\s+in|ability\s+to)\b/i.test(s)) return "actual_test";
  if (/\b(?:nice\s+to\s+have|preferred|bonus|plus|ideal|love|amazing|exciting|culture)\b/i.test(s))
    return "aspiration";
  if (/\b(?:we|our|team|culture|mission)\b/i.test(s) && s.length < 120) return "culture";
  return "actual_test";
}

function extractYearsBand(s: string): [number, number] | null {
  const m = s.match(/(\d+)\s*[-–to]\s*(\d+)\s*\+?\s*years?/i) ?? s.match(/(\d+)\+?\s*years?/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

function findTitle(text: string): string | null {
  for (const line of text.split("\n").slice(0, 30)) {
    const heading = line.match(/^#{1,3}\s+(.{5,100})$/);
    if (heading?.[1]) return heading[1].trim();
    const explicit = line.match(/^(?:job\s+)?title[:\s]+(.{3,80})$/i);
    if (explicit?.[1]) return explicit[1].trim();
  }
  return null;
}

function inferRoleFamily(text: string): string | null {
  for (const [family, re] of Object.entries(ROLE_FAMILY_HINTS)) {
    if (re.test(text)) return family;
  }
  return null;
}

function inferSeniority(text: string): JobModel["seniority"] {
  const t = text.toLowerCase();
  if (/\bintern/.test(t)) return "intern";
  if (/\bjunior|entry[-\s]level\b/.test(t)) return "junior";
  if (/\bvp|vice\s+president/.test(t)) return "vp";
  if (/\bdirector\b/.test(t)) return "director";
  if (/\bmanager|manag(ing|ed)\b/.test(t)) return "manager";
  if (/\bstaff|principal\b/.test(t)) return "ic_staff";
  if (/\bsenior|sr\b/.test(t)) return "ic_senior";
  return "ic_mid";
}

function inferYoeBand(text: string): JobModel["yoe_band"] {
  const m = text.match(/(\d+)\s*\+?\s*years?/i);
  if (m && m[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return [n, n + 5];
  }
  return null;
}

function detectSource(text: string): JobModel["posting_source"] {
  if (/workday|wd\d+\.workday/i.test(text)) return "workday";
  if (/lever\.co/i.test(text)) return "lever";
  if (/greenhouse\.io|boards\.greenhouse/i.test(text)) return "greenhouse";
  if (/linkedin\.com\/jobs/i.test(text)) return "linkedin";
  if (/ashbyhq\.com/i.test(text)) return "ashby";
  if (/URL Source:/i.test(text)) return "ats_other";
  return "user_paste";
}

function buildRecruiterScorecard(
  reqs: Requirement[],
  ats: Map<string, AtsKeyword>,
): ScorecardLine[] {
  const top = Array.from(ats.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  return top.map((k, i) => ({
    id: `recruiter:${k.normalized}`,
    observer: "recruiter" as const,
    rubric: `Resume mentions ${k.surface}`,
    weight: Math.max(0.1, 0.5 - 0.05 * i),
    pass_threshold: 0.5,
  }));
}

function buildHiringManagerScorecard(reqs: Requirement[]): ScorecardLine[] {
  return reqs
    .filter((r) => r.criticality === "hard_filter" || r.criticality === "must_have")
    .slice(0, 5)
    .map((r) => ({
      id: `hm:${r.id}`,
      observer: "hiring_manager" as const,
      rubric: `Candidate can defend "${r.text.slice(0, 60)}" in interview`,
      weight: r.is_hard_filter ? 0.9 : 0.6,
      pass_threshold: 0.6,
    }));
}

function variantsFor(term: string): string[] {
  const out: string[] = [];
  if (term === "kubernetes") out.push("k8s", "kubernetes", "kube");
  if (term === "javascript") out.push("js", "javascript", "ECMAScript");
  if (term === "typescript") out.push("ts", "typescript");
  if (term === "node.js") out.push("node", "node.js", "nodejs");
  if (term === "next.js") out.push("nextjs", "next.js");
  if (term === "postgresql") out.push("postgres", "postgresql", "psql");
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeReq(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "");
}

function stableHash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
