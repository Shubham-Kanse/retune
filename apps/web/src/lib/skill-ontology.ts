import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type SkillRow = {
  name: string;
  synonyms?: string[];
  impliesKnowingSkills?: string[];
};

type AliasHit = {
  canonical: string;
  kind: "canonical" | "synonym";
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+#.\-/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSkillsPath(): string {
  // In Next.js route handlers, process.cwd() is often apps/web.
  // Try local-first, then monorepo-root relative.
  const candidates = [
    resolve(process.cwd(), "packages/agent/assets/__aggregated_skills.json"),
    resolve(process.cwd(), "../packages/agent/assets/__aggregated_skills.json"),
    resolve(process.cwd(), "../../packages/agent/assets/__aggregated_skills.json"),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p, "utf8");
      return p;
    } catch {
      // continue
    }
  }
  throw new Error(
    `Could not locate __aggregated_skills.json. Tried: ${candidates.join(", ")}`,
  );
}

const SKILLS_PATH = resolveSkillsPath();
const RAW_SKILLS = JSON.parse(readFileSync(SKILLS_PATH, "utf8")) as SkillRow[];

const aliasIndex = new Map<string, AliasHit>();
const impliesIndex = new Map<string, Set<string>>();

for (const row of RAW_SKILLS) {
  const canonical = normalize(row.name);
  if (!canonical) continue;
  if (!aliasIndex.has(canonical)) aliasIndex.set(canonical, { canonical, kind: "canonical" });

  for (const syn of row.synonyms ?? []) {
    const key = normalize(syn);
    if (!key || aliasIndex.has(key)) continue;
    aliasIndex.set(key, { canonical, kind: "synonym" });
  }
}

for (const row of RAW_SKILLS) {
  const src = canonicalizeSkill(row.name).canonical;
  const set = impliesIndex.get(src) ?? new Set<string>();
  for (const implied of row.impliesKnowingSkills ?? []) {
    const target = canonicalizeSkill(implied).canonical;
    if (target) set.add(target);
  }
  impliesIndex.set(src, set);
}

export function canonicalizeSkill(skill: string): { canonical: string; kind: "canonical" | "synonym" | "unknown" } {
  const key = normalize(skill);
  const hit = aliasIndex.get(key);
  if (hit) return { canonical: hit.canonical, kind: hit.kind };
  return { canonical: key, kind: "unknown" };
}

function tokenSet(v: string): Set<string> {
  return new Set(v.split(/[ /\-]+/g).filter(Boolean));
}

function tokenSubset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export function skillMatch(
  wantedRaw: string,
  knownRawSkills: string[],
): { known: boolean; reason?: string } {
  const wanted = canonicalizeSkill(wantedRaw);
  const wantedTokens = tokenSet(wanted.canonical);

  for (const knownRaw of knownRawSkills) {
    const known = canonicalizeSkill(knownRaw);
    if (!known.canonical) continue;

    if (known.canonical === wanted.canonical) {
      if (wanted.kind === "synonym") {
        return {
          known: true,
          reason: `Matched via ontology synonym (${wantedRaw} maps to ${wanted.canonical}).`,
        };
      }
      return { known: true, reason: `Exact ontology skill match (${wantedRaw}).` };
    }

    const knownImplies = impliesIndex.get(known.canonical);
    if (knownImplies?.has(wanted.canonical)) {
      return {
        known: true,
        reason: `Ontology implication: ${knownRaw} implies ${wantedRaw}.`,
      };
    }

    const knownTokens = tokenSet(known.canonical);
    if (tokenSubset(wantedTokens, knownTokens) || tokenSubset(knownTokens, wantedTokens)) {
      return {
        known: true,
        reason: `Semantic token overlap: ${knownRaw} matches ${wantedRaw}.`,
      };
    }
  }

  return { known: false, reason: `No ontology or semantic match found in your profile skills.` };
}

export function canonicalDisplay(skill: string): string {
  return canonicalizeSkill(skill).canonical || normalize(skill);
}
