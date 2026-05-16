/**
 * SOTA artifact scoring (003 §6.9 Phase I + §13).
 *
 * Replaces the trace-approximation scoring used by the legacy
 * `run_live_case` with a strict check against the persisted final
 * artifacts (`sota.rendered_package`, `sota.claim_ledger`,
 * `sota.draft_variants`).
 *
 * Hard rules (any failure → eval refuses):
 *   1. Every claim id referenced by the winning draft variant MUST
 *      resolve to the locked claim ledger.
 *   2. Every metric appearing in the winning resume markdown MUST be
 *      grounded in an evidence_quote on a metric-kind claim, OR be a
 *      direct copy of a claim's `text` field.
 *   3. The claim ledger MUST be locked before scoring runs.
 *   4. The rendered package MUST be finalized (every artifact has
 *      sha256 + parseable=true).
 *
 * Output is a typed `SotaArtifactScore` consumed by the eval runner
 * and the launch criteria gate.
 */

import { z } from "zod";
import {
  ClaimLedgerSchema,
  DraftVariantSchema,
  RenderedApplicationPackageSchema,
} from "@retune/types";

const METRIC_RE = /\b(\d[\d,.]*)\s*(%|x|×|k\b|m\b|b\b|qps|rps|tps|users|customers)/gi;

export interface SotaArtifactScore {
  /** Hard pass/fail. Every gate below must be true to ship. */
  passed: boolean;
  /** Each gate's outcome. */
  gates: {
    ledger_locked: boolean;
    package_finalized: boolean;
    every_claim_resolves: boolean;
    every_metric_grounded: boolean;
    no_unsafe_claim_in_winner: boolean;
  };
  /** Numeric scores in [0,1]. */
  scores: {
    provenance_rate: number;
    grounded_metric_rate: number;
    locked_claim_share: number;
  };
  /** Free-form findings — populated when a gate fails. */
  findings: string[];
}

const ScoreInputSchema = z.object({
  /** Optional sota namespace; missing fields fail gracefully. */
  sota: z
    .object({
      claim_ledger: ClaimLedgerSchema.optional().nullable(),
      draft_variants: z.array(DraftVariantSchema).optional(),
      rendered_package: RenderedApplicationPackageSchema.optional().nullable(),
    })
    .partial()
    .optional(),
});
export type ScoreInput = z.infer<typeof ScoreInputSchema>;

export function score_sota_artifacts(input: unknown): SotaArtifactScore {
  const parsed = ScoreInputSchema.safeParse(input);
  if (!parsed.success) {
    return failClosed(["score_input_schema_invalid"]);
  }
  const sota = parsed.data.sota ?? {};

  const findings: string[] = [];
  const gates = {
    ledger_locked: false,
    package_finalized: false,
    every_claim_resolves: false,
    every_metric_grounded: false,
    no_unsafe_claim_in_winner: false,
  };

  const ledger = sota.claim_ledger ?? null;
  if (!ledger) {
    findings.push("missing_claim_ledger");
    return finalize(gates, findings, { provenance_rate: 0, grounded_metric_rate: 0, locked_claim_share: 0 });
  }
  if (!ledger.locked) {
    findings.push("claim_ledger_not_locked");
    return finalize(gates, findings, { provenance_rate: 0, grounded_metric_rate: 0, locked_claim_share: 0 });
  }
  gates.ledger_locked = true;

  const variants = sota.draft_variants ?? [];
  const winner = variants.find((v) => v.is_final);
  if (!winner) {
    findings.push("no_final_variant");
    return finalize(gates, findings, { provenance_rate: 0, grounded_metric_rate: 0, locked_claim_share: 0 });
  }

  const ledgerById = new Map(ledger.claims.map((c) => [c.id, c]));
  const ledgerIds = new Set(ledgerById.keys());

  // ── Gate: every winner claim_id resolves ──
  const dangling = winner.claim_ids.filter((id) => !ledgerIds.has(id));
  if (dangling.length > 0) {
    findings.push(`claim_ids_dangling:${dangling.length}`);
  } else {
    gates.every_claim_resolves = true;
  }

  // ── Gate: no unsafe claims in the winner ──
  const unsafeInWinner = winner.claim_ids
    .map((id) => ledgerById.get(id))
    .filter((c) => c && c.defensibility === "unsafe");
  if (unsafeInWinner.length > 0) {
    findings.push(`unsafe_claims_in_winner:${unsafeInWinner.length}`);
  } else {
    gates.no_unsafe_claim_in_winner = true;
  }

  // ── Gate: every metric in the rendered markdown is grounded ──
  const consumedClaims = winner.claim_ids
    .map((id) => ledgerById.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const allowedMetricCorpus = consumedClaims
    .filter((c) => c.kind === "metric")
    .flatMap((c) => [c.text, ...c.evidence_quotes.map((q) => q.quote)])
    .join(" ")
    .toLowerCase();

  const metrics = extractMetrics(winner.markdown);
  const ungrounded = metrics.filter((m) => !allowedMetricCorpus.includes(m.toLowerCase().replace(/\s+/g, " ")));
  if (ungrounded.length > 0) {
    findings.push(`ungrounded_metrics:${ungrounded.slice(0, 5).join(",")}`);
  } else {
    gates.every_metric_grounded = true;
  }

  // ── Gate: rendered package finalized ──
  const pkg = sota.rendered_package ?? null;
  if (pkg && pkg.finalized) {
    const allParseable = pkg.artifacts.every((a) => a.parseable && a.sha256 && (a.bytes ?? 0) > 0);
    gates.package_finalized = allParseable;
    if (!allParseable) findings.push("artifact_not_parseable");
  } else {
    findings.push("rendered_package_not_finalized");
  }

  // Numeric scores.
  const provenance_rate =
    winner.claim_ids.length === 0
      ? 0
      : (winner.claim_ids.length - dangling.length) / winner.claim_ids.length;
  const grounded_metric_rate =
    metrics.length === 0 ? 1 : (metrics.length - ungrounded.length) / metrics.length;
  const locked_claim_share = ledger.claims.length === 0 ? 0 : winner.claim_ids.length / ledger.claims.length;

  return finalize(gates, findings, { provenance_rate, grounded_metric_rate, locked_claim_share });
}

function finalize(
  gates: SotaArtifactScore["gates"],
  findings: string[],
  scores: SotaArtifactScore["scores"],
): SotaArtifactScore {
  const passed = Object.values(gates).every(Boolean);
  return { passed, gates, scores, findings };
}

function failClosed(findings: string[]): SotaArtifactScore {
  return {
    passed: false,
    gates: {
      ledger_locked: false,
      package_finalized: false,
      every_claim_resolves: false,
      every_metric_grounded: false,
      no_unsafe_claim_in_winner: false,
    },
    scores: { provenance_rate: 0, grounded_metric_rate: 0, locked_claim_share: 0 },
    findings,
  };
}

function extractMetrics(markdown: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(METRIC_RE.source, "gi");
  while ((m = re.exec(markdown)) !== null) {
    if (m[0]) out.push(m[0]);
  }
  return out;
}
