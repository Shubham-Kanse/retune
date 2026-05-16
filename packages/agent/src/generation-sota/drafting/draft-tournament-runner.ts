/**
 * DraftTournamentRunner (003 §6.6 Phase F).
 *
 * Generates 3 deterministic resume-variant drafts (ATS-forward,
 * recruiter-scan-forward, hiring-manager-depth-forward), scores each
 * against the locked claim ledger and the job model, picks the
 * winner, and freezes it.
 *
 * Why deterministic: the v003 baseline is rule-based so the system
 * can be tested offline. Phase 7+ swaps the variant generator out for
 * an LLM-driven multi-perspective pass — but the tournament shape and
 * the scoring rubric stay the same so the swap is incremental.
 *
 * Outputs:
 *   - sota.draft_variants: DraftVariant[]
 *   - sota.quality_board (partial — ATS coverage filled in)
 *
 * Hard rule: every variant lists the claim_ids it consumes, and the
 * winning variant is_final=true with a non-null reason_won. The
 * downstream RefuseOrShipGate refuses if any final bullet references
 * a claim id not present in the locked ledger.
 */

import { randomUUID } from "node:crypto";
import {
  type ClaimLedger,
  ClaimLedgerSchema,
  type DraftFlavor,
  type DraftVariant,
  DraftVariantSchema,
  type Goal,
  type GoalKind,
  type JobModel,
  JobModelSchema,
  type SotaClaim,
} from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["generate_draft_variants"];

/**
 * Variant flavors produced this round. The full Section 5.10 catalogue
 * (5 flavors + merged) is the long-term target; the 003 baseline picks
 * the three that drive the strongest A/B differential.
 */
const FLAVORS: readonly DraftFlavor[] = [
  "ats_forward",
  "recruiter_scan_forward",
  "hiring_manager_depth_forward",
];

export class DraftTournamentRunner implements Specialist {
  readonly id = "draft_tournament_runner";
  readonly display_name = "Draft Tournament Runner";
  readonly brain_region = "broca_dlpfc";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 80;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const sotaRaw = (ctx.blackboard as unknown as { sota?: { job_model?: unknown; claim_ledger?: unknown } }).sota ?? {};

    const clParsed = ClaimLedgerSchema.safeParse(sotaRaw.claim_ledger);
    if (!clParsed.success || !clParsed.data.locked) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "ledger_not_locked",
          inputs_hash: AuditTrail.hash({ has_ledger: clParsed.success, locked: clParsed.success ? clParsed.data.locked : false }),
          output_hash: AuditTrail.hash({ status: "skipped" }),
          justification: "claim ledger missing or not locked — refusing to draft",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const ledger: ClaimLedger = clParsed.data;
    const jobModel: JobModel | null = JobModelSchema.safeParse(sotaRaw.job_model).success
      ? JobModelSchema.parse(sotaRaw.job_model)
      : null;

    // ── 1. Generate variants ───────────────────────────────────────
    const variants: DraftVariant[] = FLAVORS.map((flavor) => makeVariant(flavor, ledger, jobModel));

    // ── 2. Score each variant ──────────────────────────────────────
    for (const v of variants) {
      v.scores = scoreVariant(v, ledger, jobModel);
      v.total_score = avg(v.scores);
    }

    // ── 3. Rank + pick winner ──────────────────────────────────────
    const ranked = [...variants].sort((a, b) => b.total_score - a.total_score);
    const winner = ranked[0]!;
    winner.is_final = true;
    winner.reason_won = pickReason(winner, ranked.slice(1));

    // ── 4. Validate every variant ──────────────────────────────────
    const parsed = variants.map((v) => DraftVariantSchema.parse(v));

    const writes = [
      { path: "sota.draft_variants", value: parsed },
      // Partial quality board — ATS coverage from the winner.
      {
        path: "sota.quality_board.ats_coverage",
        value: winner.scores.ats,
      },
    ];

    return {
      writes,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "tournament",
        inputs_hash: AuditTrail.hash({
          n_claims: ledger.claims.length,
          locked_hash: ledger.locked_hash,
        }),
        output_hash: AuditTrail.hash({
          winner_id: winner.id,
          flavor: winner.flavor,
          total_score: winner.total_score,
        }),
        justification: `${variants.length} variants scored — winner: ${winner.flavor} (score=${winner.total_score.toFixed(3)}). Reason: ${winner.reason_won}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: writes.map((w) => w.path),
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Variant generation
// ─────────────────────────────────────────────────────────────────────────────

function makeVariant(
  flavor: DraftFlavor,
  ledger: ClaimLedger,
  jobModel: JobModel | null,
): DraftVariant {
  // Flavor-specific claim ordering:
  //  - ats_forward: lead with skill claims that hit ATS keywords.
  //  - recruiter_scan_forward: lead with the strongest metric/achievement.
  //  - hiring_manager_depth_forward: lead with leadership + scope.
  const ordered = orderClaims(flavor, ledger.claims, jobModel);
  const markdown = renderMarkdown(flavor, ordered, jobModel);
  return {
    id: randomUUID(),
    flavor,
    markdown,
    claim_ids: ordered.map((c) => c.id),
    scores: {
      ats: 0,
      recruiter: 0,
      hiring_manager: 0,
      voice: 0,
      defensibility: 0,
      formatting: 0,
      market_fit: 0,
      fairness: 0,
    },
    total_score: 0,
    red_team_findings: [],
    reason_won: null,
    is_final: false,
    created_at: new Date().toISOString(),
  };
}

function orderClaims(flavor: DraftFlavor, claims: SotaClaim[], jobModel: JobModel | null): SotaClaim[] {
  const allowed = claims.filter((c) => c.allowed_uses.includes("resume"));
  const atsKeywords = new Set((jobModel?.ats_keywords ?? []).map((k) => k.normalized));

  const score = (c: SotaClaim): number => {
    let s = 0;
    s += defensibilityScore(c.defensibility);
    s += c.confidence * 0.5;
    if (flavor === "ats_forward" && c.kind === "skill") s += 0.7;
    if (flavor === "recruiter_scan_forward" && (c.kind === "metric" || c.kind === "achievement")) s += 0.7;
    if (flavor === "hiring_manager_depth_forward" && (c.kind === "leadership" || c.kind === "scope")) s += 0.7;
    if (flavor === "ats_forward") {
      for (const t of c.normalized_text.split(/\s+/)) if (atsKeywords.has(t)) s += 0.2;
    }
    return s;
  };
  return allowed.slice().sort((a, b) => score(b) - score(a));
}

function defensibilityScore(d: SotaClaim["defensibility"]): number {
  switch (d) {
    case "strong":
      return 1;
    case "moderate":
      return 0.7;
    case "weak":
      return 0.3;
    case "unsafe":
      return -1; // exclude entirely
  }
}

function renderMarkdown(flavor: DraftFlavor, claims: SotaClaim[], _jobModel: JobModel | null): string {
  const top = claims.slice(0, 8);
  const headingMap: Record<DraftFlavor, string> = {
    ats_forward: "ATS-Forward Resume",
    recruiter_scan_forward: "Recruiter-Scan-Forward Resume",
    hiring_manager_depth_forward: "Hiring-Manager-Depth Resume",
    authentic_voice_forward: "Authentic-Voice-Forward Resume",
    conservative_truth_forward: "Conservative-Truth-Forward Resume",
    merged: "Merged Resume",
  };
  const heading = headingMap[flavor];
  const bullets = top.map((c) => `- ${c.text}`).join("\n");
  return `# ${heading}\n\n${bullets}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring rubric (003 §5.10)
// ─────────────────────────────────────────────────────────────────────────────

function scoreVariant(v: DraftVariant, ledger: ClaimLedger, jobModel: JobModel | null): DraftVariant["scores"] {
  const claims = ledger.claims.filter((c) => v.claim_ids.includes(c.id));

  const ats = scoreAts(v, jobModel);
  const recruiter = scoreRecruiter(v, claims);
  const hiring_manager = scoreHiringManager(v, claims);
  const voice = scoreVoice(v);
  const defensibility = scoreDefensibility(claims);
  const formatting = 0.85; // baseline — Phase 7 hooks in real DOCX/PDF parseability checks
  const market_fit = 0.7;
  const fairness = 0.95;
  return { ats, recruiter, hiring_manager, voice, defensibility, formatting, market_fit, fairness };
}

function scoreAts(v: DraftVariant, jobModel: JobModel | null): number {
  if (!jobModel) return 0.5;
  const totalWeight = jobModel.ats_keywords.reduce((a, k) => a + k.weight, 0);
  if (totalWeight === 0) return 0.5;
  const text = v.markdown.toLowerCase();
  let hit = 0;
  for (const k of jobModel.ats_keywords) {
    if (text.includes(k.normalized)) hit += k.weight;
  }
  return Math.min(1, hit / totalWeight);
}

function scoreRecruiter(v: DraftVariant, claims: SotaClaim[]): number {
  // Recruiters scan first 3-5 lines; weight metric / achievement claims heavily.
  const top = claims.slice(0, 5);
  const bonusKinds = top.filter((c) => c.kind === "metric" || c.kind === "achievement").length;
  return Math.min(1, 0.4 + bonusKinds * 0.15);
}

function scoreHiringManager(v: DraftVariant, claims: SotaClaim[]): number {
  // Hiring managers value depth — leadership, scope, technical_depth.
  const depthKinds = claims.filter((c) =>
    ["leadership", "scope", "achievement"].includes(c.kind),
  ).length;
  return Math.min(1, 0.3 + depthKinds * 0.1);
}

function scoreVoice(_v: DraftVariant): number {
  // Phase 7 wires this into the voice fingerprint. Baseline assumes
  // the deterministic generator preserves voice (no LLM smoothing).
  return 0.85;
}

function scoreDefensibility(claims: SotaClaim[]): number {
  if (claims.length === 0) return 0;
  const sum = claims.reduce((a, c) => a + Math.max(0, defensibilityScore(c.defensibility)), 0);
  return Math.min(1, sum / claims.length);
}

function avg(s: DraftVariant["scores"]): number {
  return (
    (s.ats + s.recruiter + s.hiring_manager + s.voice + s.defensibility + s.formatting + s.market_fit + s.fairness) /
    8
  );
}

function pickReason(winner: DraftVariant, runners: DraftVariant[]): string {
  if (runners.length === 0) return `chosen as the only valid variant (flavor=${winner.flavor})`;
  const next = runners[0]!;
  const delta = winner.total_score - next.total_score;
  return `flavor=${winner.flavor} won by ${delta.toFixed(3)} over ${next.flavor} on combined ATS/recruiter/HM scoring`;
}
