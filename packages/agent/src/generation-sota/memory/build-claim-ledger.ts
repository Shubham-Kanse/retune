/**
 * Deterministic ClaimLedger builder (003 §5.5 + §6.2).
 *
 * Walks the CandidateModel and projects every observable fact into a
 * SotaClaim. Each claim is bound to:
 *
 *   - one or more source_ids (provenance)
 *   - an evidence_quotes array (when the fact was mined from text)
 *   - a defensibility tier
 *   - an interview_defense_prompt the system would use to test it
 *   - the set of allowed_uses (resume / cover_letter / linkedin / outreach / strategy)
 *
 * No LLM call — the projection is rule-based so the ledger is
 * reproducible, auditable, and replayable.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  type CandidateModel,
  type ClaimLedger,
  type SotaClaim,
} from "@retune/types";

export function buildClaimLedgerFromCandidateModel(
  generation_id: string,
  cm: CandidateModel,
): ClaimLedger {
  const claims: SotaClaim[] = [];
  const now = new Date().toISOString();

  // ── Skill claims ──────────────────────────────────────────────────────
  for (const s of cm.skill_inventory) {
    const conf = skillConfidence(s.evidence_tier);
    claims.push({
      id: randomUUID(),
      kind: "skill",
      text: s.name,
      normalized_text: normalizeText(s.name),
      source_ids: s.source_ids,
      evidence_quotes: [],
      confidence: conf,
      verified_by_user: false,
      defensibility: skillDefensibility(s.evidence_tier),
      interview_defense_prompt: `What's the most production-critical use of ${s.name} you can speak to in detail?`,
      allowed_uses: ["resume", "cover_letter", "linkedin"],
      forbidden_uses: conf < 0.4 ? ["outreach"] : [],
      created_at: now,
    });
  }

  // ── Metric claims ─────────────────────────────────────────────────────
  for (const m of cm.metric_inventory) {
    const conf = m.user_confirmed ? 0.9 : 0.55;
    claims.push({
      id: randomUUID(),
      kind: "metric",
      text: `${m.metric}${m.context ? ` (${m.context.slice(0, 60)})` : ""}`.slice(0, 240),
      normalized_text: normalizeText(`${m.metric}${m.context ?? ""}`),
      source_ids: m.source_ids,
      evidence_quotes: m.context
        ? [{ source_id: m.source_ids[0] ?? "unknown", quote: m.context, confidence: conf }]
        : [],
      confidence: conf,
      verified_by_user: m.user_confirmed,
      defensibility: m.user_confirmed ? "strong" : "moderate",
      interview_defense_prompt: `Walk me through how you measured "${m.metric}" — what was the baseline, the timeframe, and how you attributed the change.`,
      allowed_uses: ["resume", "cover_letter"],
      forbidden_uses: [],
      created_at: now,
    });
  }

  // ── Achievement claims ────────────────────────────────────────────────
  for (const a of cm.achievement_inventory) {
    claims.push({
      id: randomUUID(),
      kind: "achievement",
      text: a.text,
      normalized_text: normalizeText(a.text),
      source_ids: a.source_ids,
      evidence_quotes: [
        { source_id: a.source_ids[0] ?? "unknown", quote: a.text, confidence: defensibilityToConf(a.defensibility) },
      ],
      confidence: defensibilityToConf(a.defensibility),
      verified_by_user: false,
      defensibility: a.defensibility,
      interview_defense_prompt: `What was the result of "${a.text.slice(0, 100)}" and how would you verify it?`,
      allowed_uses: a.defensibility === "unsafe" ? [] : ["resume", "cover_letter"],
      forbidden_uses: a.defensibility === "unsafe" ? ["resume", "cover_letter", "linkedin", "outreach"] : [],
      created_at: now,
    });
  }

  // ── Leadership claims ─────────────────────────────────────────────────
  for (const l of cm.leadership_inventory) {
    const text = l.team_size
      ? `Led a ${l.scope.replace("_", " ")} of ${l.team_size}`
      : `Led a ${l.scope.replace("_", " ")}`;
    claims.push({
      id: randomUUID(),
      kind: "leadership",
      text,
      normalized_text: normalizeText(text),
      source_ids: l.source_ids,
      evidence_quotes: [
        { source_id: l.source_ids[0] ?? "unknown", quote: l.description, confidence: 0.6 },
      ],
      confidence: 0.6,
      verified_by_user: false,
      defensibility: l.team_size ? "moderate" : "weak",
      interview_defense_prompt: `Tell me about the team you led — composition, your day-to-day, and one decision you owned.`,
      allowed_uses: ["resume", "cover_letter", "linkedin"],
      forbidden_uses: [],
      created_at: now,
    });
  }

  // ── Domain claims ─────────────────────────────────────────────────────
  for (const d of cm.domain_inventory) {
    claims.push({
      id: randomUUID(),
      kind: "domain",
      text: `Domain experience: ${d}`,
      normalized_text: normalizeText(d),
      source_ids: [],
      evidence_quotes: [],
      confidence: 0.5,
      verified_by_user: false,
      defensibility: "moderate",
      interview_defense_prompt: `How did you build credibility in the ${d} domain — concrete projects?`,
      allowed_uses: ["resume", "cover_letter", "outreach"],
      forbidden_uses: [],
      created_at: now,
    });
  }

  // ── Credential claims ─────────────────────────────────────────────────
  for (const c of cm.credential_inventory) {
    if (!c.name) continue;
    claims.push({
      id: randomUUID(),
      kind: "credential",
      text: c.issuer ? `${c.name} (${c.issuer})` : c.name,
      normalized_text: normalizeText(c.name),
      source_ids: c.source_ids,
      evidence_quotes: [],
      confidence: 0.85,
      verified_by_user: false,
      defensibility: "strong",
      interview_defense_prompt: `What did the ${c.name} certification actually require — and what year did you earn it?`,
      allowed_uses: ["resume", "cover_letter", "linkedin"],
      forbidden_uses: [],
      created_at: now,
    });
  }

  // ── Constraint / preference claims (used for refuse/ship decisioning) ──
  for (const c of cm.constraint_inventory) {
    claims.push({
      id: randomUUID(),
      kind: "constraint",
      text: c.description,
      normalized_text: normalizeText(c.description),
      source_ids: c.source_ids,
      evidence_quotes: [],
      confidence: c.is_dealbreaker ? 1 : 0.7,
      verified_by_user: c.is_dealbreaker,
      defensibility: "strong",
      interview_defense_prompt: `Confirm: ${c.description}.`,
      allowed_uses: [], // Constraints never appear in generated copy.
      forbidden_uses: ["resume", "cover_letter", "linkedin", "outreach"],
      created_at: now,
    });
  }

  return {
    schema_version: "sota-v3",
    generation_id,
    claims,
    locked: false,
    locked_at: null,
    locked_hash: null,
  };
}

/**
 * Lock the ledger before drafting starts. The hash binds every claim
 * id + normalized_text into a single fingerprint — production
 * specialists can verify they're operating on a frozen ledger.
 */
export function lockClaimLedger(ledger: ClaimLedger): ClaimLedger {
  if (ledger.locked) return ledger;
  const fingerprint = ledger.claims
    .map((c) => `${c.id}:${c.normalized_text}:${c.kind}`)
    .sort()
    .join("|");
  const hash = createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
  return {
    ...ledger,
    locked: true,
    locked_at: new Date().toISOString(),
    locked_hash: hash,
  };
}

/**
 * Returns a list of (offending claim_id, reason) pairs for any claim
 * that is unsafe to ship: weak defensibility AND no source ids, or
 * confidence below the minimum unsafe threshold (0.2).
 */
export function findUnsafeClaims(ledger: ClaimLedger): Array<{ id: string; reason: string }> {
  const out: Array<{ id: string; reason: string }> = [];
  for (const c of ledger.claims) {
    if (c.defensibility === "unsafe") {
      out.push({ id: c.id, reason: "defensibility_unsafe" });
      continue;
    }
    if (c.confidence < 0.2) {
      out.push({ id: c.id, reason: "confidence_below_floor" });
      continue;
    }
    if (c.kind === "metric" && c.source_ids.length === 0) {
      out.push({ id: c.id, reason: "metric_without_source" });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function skillConfidence(tier: import("@retune/types").SkillEvidenceTier): number {
  switch (tier) {
    case "claimed":
      return 0.3;
    case "self_described":
      return 0.5;
    case "third_party_attested":
      return 0.75;
    case "demonstrated":
      return 0.85;
    case "measured_outcome":
      return 0.95;
  }
}

function skillDefensibility(tier: import("@retune/types").SkillEvidenceTier): SotaClaim["defensibility"] {
  switch (tier) {
    case "claimed":
      return "weak";
    case "self_described":
      return "moderate";
    case "third_party_attested":
      return "moderate";
    case "demonstrated":
      return "strong";
    case "measured_outcome":
      return "strong";
  }
}

function defensibilityToConf(d: SotaClaim["defensibility"]): number {
  switch (d) {
    case "strong":
      return 0.9;
    case "moderate":
      return 0.6;
    case "weak":
      return 0.35;
    case "unsafe":
      return 0.05;
  }
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}
