/**
 * Deterministic CandidateModel builder (003 §6.2).
 *
 * Projects a CareerProfileV1 JSON document or a free-form profile_text
 * string into the typed CandidateModel that downstream specialists
 * read. No LLM call — this stage is pure, reproducible, and cheap so
 * the whole cognitive cycle has a stable evidence floor before any
 * non-deterministic drafting starts.
 *
 * Inputs:
 *   - `profile_text`: optional raw markdown / text (legacy path)
 *   - `career_profile`: optional full CareerProfileV1 JSON (preferred)
 *   - `user_id`: caller-supplied authenticated user id
 *
 * Output:
 *   - CandidateModel with identity, skills, metrics, achievements,
 *     leadership, domains, credentials, preferences, and timeline.
 */

import { randomUUID } from "node:crypto";
import {
  type CandidateModel,
  CandidateModelSchema,
  type IdentityField,
  type LeadershipInventoryEntry,
  type MetricInventoryEntry,
  type PreferenceModel,
  type SkillInventoryEntry,
  type CareerTimelineEntry,
} from "@retune/types";

export interface BuildCandidateModelInput {
  user_id: string;
  career_profile?: unknown;
  profile_text?: string;
}

export interface BuildCandidateModelResult {
  candidate_model: CandidateModel;
  source_records: Array<{ id: string; kind: "career_profile" | "profile_markdown" | "user_message" }>;
  warnings: string[];
}

const METRIC_RE = /(\d+(?:[.,]\d+)?\s?(?:%|x|×|\+|k|m|b|bn|million|billion|million\/yr|users|clients|hours|days|weeks|months|qps|rps|tps|nodes|teams|engineers|reports|customers))/gi;
const LEADERSHIP_RE = /\b(led|managed|directed|owned|coached|mentored|hired|spun up|stood up|architect(?:ed)?)\s+(?:a\s+)?(?:team|org|cohort|group|guild|chapter|squad|workstream|crew|of)\b/gi;
const ACHIEVEMENT_VERBS = [
  "shipped",
  "launched",
  "delivered",
  "increased",
  "decreased",
  "reduced",
  "built",
  "designed",
  "created",
  "improved",
  "optimised",
  "optimized",
  "saved",
  "drove",
  "scaled",
  "migrated",
  "rebuilt",
];

export function buildCandidateModelDeterministic(
  input: BuildCandidateModelInput,
): BuildCandidateModelResult {
  const warnings: string[] = [];
  const source_records: BuildCandidateModelResult["source_records"] = [];

  const identity = emptyIdentity();
  const career_timeline: CareerTimelineEntry[] = [];
  const skill_inventory: SkillInventoryEntry[] = [];
  const metric_inventory: MetricInventoryEntry[] = [];
  const leadership_inventory: LeadershipInventoryEntry[] = [];
  const achievement_inventory: CandidateModel["achievement_inventory"] = [];
  const credential_inventory: CandidateModel["credential_inventory"] = [];
  const constraint_inventory: CandidateModel["constraint_inventory"] = [];
  const domain_inventory: string[] = [];
  let preference_model: PreferenceModel = emptyPreferences();

  // ── 1. CareerProfileV1 path (preferred) ──────────────────────────────────
  if (input.career_profile && typeof input.career_profile === "object") {
    const profile = input.career_profile as Record<string, unknown>;
    const career_profile_id = `career_profile:${(profile.id as string | undefined) ?? input.user_id}`;
    source_records.push({ id: career_profile_id, kind: "career_profile" });

    // Identity fields
    const idObj = profile.identity as Record<string, IdentityFieldRaw> | undefined;
    if (idObj) {
      identity.full_name = liftIdentity(idObj.fullName, [career_profile_id]);
      identity.email = liftIdentity(idObj.email, [career_profile_id]);
      identity.phone = liftIdentity(idObj.phone, [career_profile_id]);
      identity.location = liftIdentity(idObj.location, [career_profile_id]);
      identity.linkedin = liftIdentity(idObj.linkedin, [career_profile_id]);
      identity.github = liftIdentity(idObj.github, [career_profile_id]);
      identity.portfolio = liftIdentity(idObj.portfolio, [career_profile_id]);
    }

    // Experience → career timeline + leadership + metrics
    const expField = (profile.experience as { value?: unknown[] } | undefined)?.value;
    if (Array.isArray(expField)) {
      for (const e of expField) {
        if (!e || typeof e !== "object") continue;
        const x = e as Record<string, unknown>;
        career_timeline.push({
          id: (x.id as string | undefined) ?? randomUUID(),
          kind: "role",
          title: (x.title as string | undefined) ?? "",
          organization: (x.company as string | undefined) ?? null,
          start_iso: normaliseDate(x.startDate),
          end_iso: normaliseDate(x.endDate),
          seniority: inferSeniority(String(x.title ?? "")),
          description: typeof x.description === "string" ? x.description : null,
          source_ids: [career_profile_id],
        });

        // Metrics inside the experience entry.
        const metrics = (x.metrics as Array<Record<string, unknown>> | undefined) ?? [];
        for (const m of metrics) {
          const mv = (m.metric as string | undefined) ?? (m.value as string | undefined);
          if (!mv) continue;
          metric_inventory.push({
            id: randomUUID(),
            metric: mv,
            value: (m.value as string | undefined) ?? "",
            unit: null,
            context: (m.context as string | undefined) ?? null,
            direction: "neutral",
            window: null,
            source_ids: [career_profile_id],
            user_confirmed: true,
          });
        }

        // Free-text mining on responsibilities + achievements.
        const buckets = [
          ...((x.responsibilities as string[] | undefined) ?? []),
          ...((x.achievements as string[] | undefined) ?? []),
        ];
        for (const text of buckets) {
          if (typeof text !== "string") continue;
          mineMetrics(text, metric_inventory, [career_profile_id]);
          mineLeadership(text, leadership_inventory, [career_profile_id]);
          mineAchievement(text, achievement_inventory, [career_profile_id]);
        }
      }
    }

    // Skills
    const skillsObj = profile.skills as Record<string, { value?: unknown[] }> | undefined;
    if (skillsObj) {
      for (const [category, payload] of Object.entries(skillsObj)) {
        const list = Array.isArray(payload?.value) ? payload.value : [];
        for (const s of list) {
          if (typeof s !== "string" || !s.trim()) continue;
          skill_inventory.push({
            id: randomUUID(),
            name: s.trim(),
            category,
            years: null,
            evidence_tier: "self_described",
            source_ids: [career_profile_id],
            recency_iso: null,
          });
        }
      }
    }

    // Credentials
    const certsField = (profile.certifications as { value?: unknown[] } | undefined)?.value;
    if (Array.isArray(certsField)) {
      for (const c of certsField) {
        if (!c || typeof c !== "object") continue;
        const cx = c as Record<string, unknown>;
        credential_inventory.push({
          id: (cx.id as string | undefined) ?? randomUUID(),
          name: (cx.name as string | undefined) ?? "",
          issuer: (cx.issuer as string | undefined) ?? null,
          issued_iso: normaliseDate(cx.year),
          source_ids: [career_profile_id],
        });
      }
    }

    // Domains
    const domainsField = (profile.professionalProfile as Record<string, { value?: unknown[] }> | undefined)?.domainExperience?.value;
    if (Array.isArray(domainsField)) {
      for (const d of domainsField) if (typeof d === "string") domain_inventory.push(d);
    }

    // Preferences (resumeWritingPreferences + careerIntent)
    preference_model = liftPreferences(profile, [career_profile_id]);
  }

  // ── 2. Fallback: profile_text (markdown / plain) ─────────────────────────
  if (input.profile_text && input.profile_text.length >= 50) {
    const profile_md_id = `profile_markdown:${input.user_id}`;
    source_records.push({ id: profile_md_id, kind: "profile_markdown" });

    // We only mine for metrics/leadership/achievements when CareerProfileV1
    // was not present — otherwise we'd double-count.
    if (!input.career_profile) {
      mineMetrics(input.profile_text, metric_inventory, [profile_md_id]);
      mineLeadership(input.profile_text, leadership_inventory, [profile_md_id]);
      mineAchievement(input.profile_text, achievement_inventory, [profile_md_id]);
    }
  }

  if (source_records.length === 0) {
    warnings.push("no_profile_sources");
  }

  const candidate_model: CandidateModel = {
    schema_version: "sota-v3",
    user_id: input.user_id,
    identity,
    career_timeline,
    skill_inventory: dedupeSkills(skill_inventory),
    metric_inventory,
    achievement_inventory,
    leadership_inventory,
    domain_inventory,
    credential_inventory,
    constraint_inventory,
    preference_model,
    voice_model: null,
    edit_memory: [],
    outcome_memory: [],
    prior_packages: [],
    opt_in_global_learning: false,
    hydrated_at: new Date().toISOString(),
  };

  // Validate against the schema before returning so the caller sees
  // typed parse errors here rather than at a later commit boundary.
  return {
    candidate_model: CandidateModelSchema.parse(candidate_model),
    source_records,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface IdentityFieldRaw {
  value?: unknown;
  confirmed?: boolean;
  confidence?: number;
}

function emptyIdentity(): CandidateModel["identity"] {
  const f = (): IdentityField => ({ value: null, source_ids: [], confidence: 0, user_confirmed: false });
  return {
    full_name: f(),
    email: f(),
    phone: f(),
    location: f(),
    linkedin: f(),
    github: f(),
    portfolio: f(),
  };
}

function emptyPreferences(): PreferenceModel {
  return {
    emphasis_areas: [],
    de_emphasis_areas: [],
    tone_signals: [],
    style_constraints: [],
    preferred_markets: [],
    work_preference: "unknown",
    seniority_comfort: [],
    industries_of_interest: [],
    role_dealbreakers: [],
  };
}

function liftIdentity(raw: IdentityFieldRaw | undefined, source_ids: string[]): IdentityField {
  if (!raw) return { value: null, source_ids: [], confidence: 0, user_confirmed: false };
  const v = typeof raw.value === "string" ? raw.value : null;
  return {
    value: v && v.trim() ? v.trim() : null,
    source_ids: v ? source_ids : [],
    confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
    user_confirmed: !!raw.confirmed,
  };
}

function liftPreferences(profile: Record<string, unknown>, source_ids: string[]): PreferenceModel {
  const rwp = profile.resumeWritingPreferences as Record<string, { value?: unknown }> | undefined;
  const ci = profile.careerIntent as Record<string, { value?: unknown }> | undefined;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const wpRaw = (ci?.workPreference?.value as string | undefined) ?? "unknown";
  const wp = ["remote", "hybrid", "onsite", "open"].includes(wpRaw) ? (wpRaw as PreferenceModel["work_preference"]) : "unknown";

  return {
    emphasis_areas: arr(rwp?.emphasisAreas?.value),
    de_emphasis_areas: arr(rwp?.deEmphasisAreas?.value),
    tone_signals: arr(rwp?.toneSignals?.value),
    style_constraints: arr(rwp?.styleConstraints?.value),
    preferred_markets: arr(ci?.preferredMarkets?.value),
    work_preference: wp,
    seniority_comfort: arr(ci?.seniorityComfort?.value),
    industries_of_interest: arr(ci?.industriesOfInterest?.value),
    role_dealbreakers: arr(ci?.roleDealbreakers?.value),
  };
}

function normaliseDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!v) return null;
  // Year-only ("2023") → 2023-01-01.
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  return v;
}

function inferSeniority(title: string): CareerTimelineEntry["seniority"] {
  const t = title.toLowerCase();
  if (/\bintern/.test(t)) return "intern";
  if (/\bjunior|jr\b/.test(t)) return "junior";
  if (/\bvp|vice\s+president/.test(t)) return "vp";
  if (/\bdirector\b/.test(t)) return "director";
  if (/\bmanager|manag(ing|ed)\b/.test(t)) return "manager";
  if (/\bstaff|principal\b/.test(t)) return "ic_staff";
  if (/\bsenior|sr\b/.test(t)) return "ic_senior";
  return "ic_mid";
}

function mineMetrics(text: string, sink: MetricInventoryEntry[], source_ids: string[]): void {
  const matches = text.matchAll(METRIC_RE);
  for (const m of matches) {
    const value = m[1];
    if (!value) continue;
    sink.push({
      id: randomUUID(),
      metric: value,
      value,
      unit: extractUnit(value),
      context: surroundingContext(text, m.index ?? 0, value.length),
      direction: inferDirection(text, m.index ?? 0),
      window: null,
      source_ids,
      user_confirmed: false,
    });
  }
}

function mineLeadership(
  text: string,
  sink: LeadershipInventoryEntry[],
  source_ids: string[],
): void {
  const matches = text.matchAll(LEADERSHIP_RE);
  for (const m of matches) {
    sink.push({
      id: randomUUID(),
      scope: inferScopeFromContext(text, m.index ?? 0),
      team_size: extractTeamSize(text, m.index ?? 0),
      budget_usd: null,
      description: surroundingContext(text, m.index ?? 0, m[0]?.length ?? 0),
      source_ids,
    });
  }
}

function mineAchievement(
  text: string,
  sink: CandidateModel["achievement_inventory"],
  source_ids: string[],
): void {
  const sentences = text.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const lc = s.toLowerCase();
    const verb = ACHIEVEMENT_VERBS.find((v) => lc.startsWith(v) || lc.includes(` ${v} `));
    if (!verb) continue;
    sink.push({
      id: randomUUID(),
      text: s.length > 240 ? s.slice(0, 240) + "…" : s,
      metric_ids: [],
      source_ids,
      defensibility: looksDefensible(s) ? "moderate" : "weak",
    });
  }
}

function extractUnit(value: string): string | null {
  const m = value.match(/(%|x|×|\+|k|m|b|bn|million|billion|qps|rps|tps|nodes|teams|engineers|reports|customers|users|clients)/i);
  return m?.[0]?.toLowerCase() ?? null;
}

function inferDirection(text: string, idx: number): "increase" | "decrease" | "neutral" {
  const win = text.slice(Math.max(0, idx - 60), idx + 60).toLowerCase();
  if (/\b(increased|grew|grew by|up by|boosted|raised|expanded)\b/.test(win)) return "increase";
  if (/\b(reduced|cut|decreased|shrank|down by|saved)\b/.test(win)) return "decrease";
  return "neutral";
}

function surroundingContext(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 80);
  const end = Math.min(text.length, idx + len + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function inferScopeFromContext(text: string, idx: number): LeadershipInventoryEntry["scope"] {
  const win = text.slice(Math.max(0, idx - 80), idx + 80).toLowerCase();
  if (/\b(org|organisation|organization|company)\b/.test(win)) return "org";
  if (/\b(multi[-\s]?team|cross[-\s]?team|department|chapter)\b/.test(win)) return "multi_team";
  if (/\b(team|squad|guild|workstream|cohort)\b/.test(win)) return "team";
  return "small_team";
}

function extractTeamSize(text: string, idx: number): number | null {
  const win = text.slice(Math.max(0, idx - 60), idx + 80);
  const m = win.match(/(\d{1,3})\s+(?:engineers?|reports|directs|people|members?|developers|designers)/i);
  if (m && m[1]) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n < 10_000) return n;
  }
  return null;
}

function looksDefensible(s: string): boolean {
  return /\d/.test(s) || /\b(led|owned|shipped|launched)\b/i.test(s);
}

function dedupeSkills(list: SkillInventoryEntry[]): SkillInventoryEntry[] {
  const seen = new Map<string, SkillInventoryEntry>();
  for (const s of list) {
    const key = `${s.category}:${s.name.toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing) seen.set(key, s);
    else {
      // Merge source_ids.
      existing.source_ids = Array.from(new Set([...existing.source_ids, ...s.source_ids]));
    }
  }
  return Array.from(seen.values());
}
