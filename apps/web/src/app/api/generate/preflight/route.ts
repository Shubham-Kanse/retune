import { withAuth } from "@/lib/api-handler";
import { createPreflightToken } from "@/lib/drift-preflight-token";
import { ensureGenerationPreflightsTable } from "@/lib/preflight-table";
import { canonicalDisplay, canonicalizeSkill, skillMatch } from "@/lib/skill-ontology";
import type { DriftAnswer, DriftLevel, PreflightDetectResponse, StructuredJd } from "@/lib/drift-preflight";
import { AgentError, ValidationError } from "@/lib/errors";
import { assembleSystemPrompt, getModels, getProvider } from "@retune/agent/web";
import { db, generationPreflights, profiles } from "@retune/db";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

const DetectSchema = z.object({
  jd_text: z.string().min(50).max(50000),
});

const ResolveSchema = z.object({
  jd_hash: z.string().min(16).max(128),
  answers: z.array(
    z.object({
      skill: z.string().min(1).max(100),
      level: z.enum(["no", "theory", "basic", "hands_on", "strong", "similar_stack"]),
    }),
  ),
});

const JD_JSON_SCHEMA = {
  role_title: "",
  must_have_skills: [],
  good_to_have_skills: [],
  inferred_skills: [],
  responsibilities: [],
  soft_skills: [],
};

function safeJsonParse(raw: string | null | undefined, fallback: any) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.\- ]/g, "").replace(/\s+/g, " ").trim();
}

function uniqSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const skill of skills) {
    const n = canonicalDisplay(skill);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(skill.trim());
  }
  return out;
}

function extractSkillsDeterministic(jd: string): StructuredJd {
  const text = jd.slice(0, 12000);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const role_title = lines[0]?.slice(0, 120) ?? "Target Role";

  const lexicon = [
    "java",
    "j2ee",
    "spring",
    "springboot",
    "spring boot",
    "rest",
    "rest services",
    "rest apis",
    "cloud",
    "ci/cd",
    "angular",
    "typescript",
    "javascript",
    "agile",
    "test automation",
    "test-driven development",
    "tdd",
    "blockchain",
    "python",
    "kafka",
    "docker",
    "kubernetes",
    "aws",
    "azure",
    "gcp",
    "microservices",
  ];

  const desiredStart = lines.findIndex((l) => /desired skillset/i.test(l));
  const purposeStart = lines.findIndex((l) => /the purpose of your role/i.test(l));
  const skillsWindow =
    desiredStart >= 0
      ? lines.slice(desiredStart + 1, purposeStart > desiredStart ? purposeStart : desiredStart + 15)
      : lines.slice(0, 25);

  const must: string[] = [];
  const good: string[] = [];
  const sourceByCanonical = new Map<string, string>();
  for (const rawLine of skillsWindow) {
    const line = rawLine.toLowerCase();
    const isAdvantage = /\b(advantage|nice to have|good to have|plus|optional|conceptual understanding)\b/.test(line);
    const found: string[] = [];
    for (const term of lexicon) {
      if (line.includes(term)) {
        found.push(term);
      }
    }
    const uniqueFound = uniqSkills(found);
    for (const f of uniqueFound) {
      const c = canonicalDisplay(f);
      if (!sourceByCanonical.has(c)) sourceByCanonical.set(c, rawLine.slice(0, 180));
    }
    if (isAdvantage) good.push(...uniqueFound);
    else must.push(...uniqueFound);
  }

  const mustClean = uniqSkills(must);
  const goodClean = uniqSkills(good);

  return {
    role_title,
    must_have_skills: mustClean.slice(0, 14),
    good_to_have_skills: goodClean.slice(0, 14),
    inferred_skills: [],
    responsibilities: lines.slice(0, 8),
    soft_skills: Array.from(sourceByCanonical.entries()).map(([k, v]) => `${k}::${v}`),
  };
}

function parseProviderJson(text: string): StructuredJd | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  try {
    const parsed = JSON.parse(fenced);
    return {
      role_title: String(parsed.role_title ?? "Target Role").slice(0, 120),
      must_have_skills: uniqSkills(Array.isArray(parsed.must_have_skills) ? parsed.must_have_skills.map(String) : []),
      good_to_have_skills: uniqSkills(
        Array.isArray(parsed.good_to_have_skills) ? parsed.good_to_have_skills.map(String) : [],
      ),
      inferred_skills: uniqSkills(Array.isArray(parsed.inferred_skills) ? parsed.inferred_skills.map(String) : []),
      responsibilities: Array.isArray(parsed.responsibilities)
        ? parsed.responsibilities.map((v: unknown) => String(v)).slice(0, 20)
        : [],
      soft_skills: uniqSkills(Array.isArray(parsed.soft_skills) ? parsed.soft_skills.map(String) : []),
    };
  } catch {
    return null;
  }
}

async function structureJdWithAi(jdText: string): Promise<StructuredJd | null> {
  try {
    const provider = getProvider();
    const system = assembleSystemPrompt({ agentType: "resume-writer" });
    const resp = await provider.createMessage("jd-preflight", {
      model: getModels().fast,
      maxTokens: 2000,
      system: [
        { type: "text", text: `${system}\n\nReturn strict JSON only with keys: ${JSON.stringify(JD_JSON_SCHEMA)}.` },
      ],
      messages: [
        {
          role: "user",
          content: `Structure this JD for truthful resume generation.\n\n${jdText.slice(0, 12000)}`,
        },
      ],
    });
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n");

    return parseProviderJson(text);
  } catch {
    return null;
  }
}

function buildProfileSkills(profile: any): string[] {
  const s1 = safeJsonParse(profile?.skillsTier1, []) as Array<{ name?: string } | string>;
  const s2 = safeJsonParse(profile?.skillsTier2, []) as Array<{ name?: string } | string>;
  const s3 = safeJsonParse(profile?.skillsTier3, []) as Array<{ name?: string } | string>;
  const fromEntry = (entry: { name?: string } | string): string =>
    typeof entry === "string" ? entry : (entry?.name ?? "");

  const direct = [...s1, ...s2, ...s3].map(fromEntry).filter(Boolean);

  const exp = safeJsonParse(profile?.experience, []) as Array<{ tools?: string[]; description?: string }>;
  const fromExp = exp.flatMap((e) => e.tools ?? []);

  return uniqSkills([...direct, ...fromExp]);
}

function levelLabel(level: DriftLevel): string {
  switch (level) {
    case "no":
      return "No";
    case "theory":
      return "Theory only";
    case "basic":
      return "Basic knowledge";
    case "hands_on":
      return "Hands-on";
    case "strong":
      return "Strong";
    case "similar_stack":
      return "Similar stack";
    default:
      return level;
  }
}

function jdHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export const POST = withAuth(async (request, session) => {
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = DetectSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request");
  }

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  const profile = profileRows[0] ?? null;

  const knownSkills = buildProfileSkills(profile);
  const aiStructured = await structureJdWithAi(parsed.data.jd_text);
  const deterministic = extractSkillsDeterministic(parsed.data.jd_text);
  const structured = aiStructured
    ? {
        ...aiStructured,
        must_have_skills: uniqSkills([...deterministic.must_have_skills, ...aiStructured.must_have_skills]).slice(0, 14),
        good_to_have_skills: uniqSkills([...deterministic.good_to_have_skills, ...aiStructured.good_to_have_skills]).slice(0, 14),
        soft_skills: deterministic.soft_skills,
      }
    : deterministic;

  const mentionMap = new Map<string, string>();
  for (const tagged of deterministic.soft_skills) {
    const [k, line] = tagged.split("::");
    if (k && line) mentionMap.set(k, line);
  }
  const matchResult = (skill: string) => skillMatch(skill, knownSkills);
  const missingMust = structured.must_have_skills.filter((s) => !matchResult(s).known);
  const missingGood = structured.good_to_have_skills.filter((s) => !matchResult(s).known);
  const matched = structured.must_have_skills.filter((s) => matchResult(s).known);

  const severity: "none" | "slight" | "major" =
    missingMust.length >= 3 ? "major" : missingMust.length > 0 || missingGood.length > 0 ? "slight" : "none";

  const questions = [...missingMust.map((s) => ({ skill: s, reason: "must_have" as const })), ...missingGood.map((s) => ({ skill: s, reason: "good_to_have" as const }))]
    .slice(0, 12)
    .map((q) => ({
      skill: q.skill,
      reason: q.reason,
      prompt: `JD asks for ${q.skill}. What's your current level?`,
      options: ["no", "theory", "basic", "hands_on", "strong", "similar_stack"] as const,
      why_flagged: `${matchResult(q.skill).reason ?? "No profile match found."}${
        mentionMap.get(canonicalDisplay(q.skill))
          ? ` JD context: "${mentionMap.get(canonicalDisplay(q.skill))}".`
          : ""
      }`,
    }));

  const response: PreflightDetectResponse = {
    structured_jd: {
      ...structured,
      soft_skills: aiStructured?.soft_skills ?? [],
    },
    drift_summary: {
      severity,
      missing_must_have: missingMust,
      missing_good_to_have: missingGood,
      matched_skills: matched,
    },
    questions,
    profile_snapshot: {
      current_title: profile?.currentTitle ?? "",
      known_skills: knownSkills,
    },
  };

  return NextResponse.json({
    ...response,
    jd_hash: jdHash(parsed.data.jd_text),
  });
});

export const PATCH = withAuth(async (request, session) => {
  await ensureGenerationPreflightsTable();
  const body = await request.json().catch(() => {
    throw new ValidationError("Invalid JSON body");
  });
  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request");
  }

  const profileRows = await db.select().from(profiles).where(eq(profiles.userId, session.userId)).limit(1);
  const profile = profileRows[0];
  if (!profile) {
    throw new AgentError("Profile not found. Complete onboarding first.");
  }

  const skillsTier2 = safeJsonParse(profile.skillsTier2, []) as Array<{ name?: string; evidence?: string }>;
  const existingNorm = new Set(
    [
      ...((safeJsonParse(profile.skillsTier1, []) as Array<{ name?: string }>).map((s) => s?.name ?? "")),
      ...skillsTier2.map((s) => s?.name ?? ""),
      ...((safeJsonParse(profile.skillsTier3, []) as Array<{ name?: string }>).map((s) => s?.name ?? "")),
    ]
      .filter(Boolean)
      .map((s) => canonicalizeSkill(s).canonical),
  );

  const driftNoteLines: string[] = [];
  const nextTier2 = [...skillsTier2];

  for (const answer of parsed.data.answers) {
    driftNoteLines.push(`- ${answer.skill}: ${levelLabel(answer.level)}`);
    if (answer.level === "no") continue;
    const n = canonicalizeSkill(answer.skill).canonical;
    if (existingNorm.has(n)) continue;
    nextTier2.push({
      name: answer.skill,
      evidence:
        answer.level === "similar_stack"
          ? "self-reported via drift check: similar stack"
          : `self-reported via drift check: ${levelLabel(answer.level).toLowerCase()}`,
    });
    existingNorm.add(n);
  }

  const driftBlock =
    driftNoteLines.length > 0
      ? `\n\n## Drift Clarifications\n${driftNoteLines.join("\n")}`
      : "";

  const profileMarkdown = `${profile.profileMarkdown ?? ""}${driftBlock}`.slice(0, 20000);

  await db
    .update(profiles)
    .set({
      skillsTier2: JSON.stringify(nextTier2),
      profileMarkdown,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, session.userId));

  const [preflightRow] = await db
    .insert(generationPreflights)
    .values({
      userId: session.userId,
      jdHash: parsed.data.jd_hash,
      severity: "none",
      missingMustHave: [],
      missingGoodToHave: [],
      answers: parsed.data.answers,
      resolvedAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      updatedAt: new Date(),
    })
    .returning();

  if (!preflightRow?.id) {
    throw new AgentError("Could not persist drift preflight");
  }

  const token = createPreflightToken({
    preflight_id: preflightRow.id,
    user_id: session.userId,
    jd_hash: parsed.data.jd_hash,
    resolved_at: Date.now(),
    expires_at: Date.now() + 15 * 60 * 1000,
  });

  return NextResponse.json({ ok: true, updatedSkills: nextTier2.length, preflight_token: token });
});
