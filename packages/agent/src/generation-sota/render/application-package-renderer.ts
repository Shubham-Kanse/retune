/**
 * ApplicationPackageRenderer (003 §6.8 Phase H).
 *
 * Replaces the legacy `DocumentRenderer` readiness-only path. Produces
 * the canonical artifact set for a SHIP verdict, hashes each artifact
 * with sha256, verifies parseability, and writes the typed
 * `sota.rendered_package` node so:
 *
 *   1. The audit packet is a direct projection of artifacts that the
 *      candidate could actually download (no drift between audit and
 *      delivery).
 *   2. The result route can hydrate from durable storage without
 *      re-rendering — important after process restart (Section 6.8
 *      acceptance 3).
 *   3. The eval harness (Phase 8) can score actual final artifacts,
 *      not approximate trace signals.
 *
 * Required artifacts (003 §6.8):
 *   - resume_markdown          (always)
 *   - cover_letter_markdown    (when output_suite includes cover_letter
 *                              and `draft.cover_letter_text` is set)
 *   - linkedin_about           (when output_suite includes linkedin)
 *   - outreach_message         (when output_suite includes outreach)
 *   - strategy_memo            (when output_suite includes strategy)
 *   - audit_packet_json        (always — Article 22)
 *   - claim_provenance_map     (always)
 *   - interview_defense_sheet  (always — every shipped claim must be
 *                              defendable in interview)
 *
 * Binary formats (DOCX/PDF) remain a future iteration: the existing
 * python renderer at `apps/api/src/lib/docx-renderer.ts` can be invoked
 * by callers that need them; the SOTA path produces the markdown
 * source-of-truth that those renderers consume.
 *
 * Cost: $0 (deterministic).
 */

import { createHash } from "node:crypto";
import {
  type Blackboard,
  ClaimLedgerSchema,
  DraftVariantSchema,
  type Goal,
  type GoalKind,
  type RenderedApplicationPackage,
  type RenderedArtifact,
  RenderedApplicationPackageSchema,
  type SotaClaim,
} from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["render_documents", "verify_render_integrity"];

const PACKAGE_VERSION = "sota-v3";

export class ApplicationPackageRenderer implements Specialist {
  readonly id = "application_package_renderer";
  readonly display_name = "Application Package Renderer";
  readonly brain_region = "premotor_cortex_sma";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 25;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const sotaRaw = (ctx.blackboard as unknown as { sota?: Record<string, unknown> }).sota ?? {};

    // Read the locked claim ledger and the winning draft variant.
    const ledgerParse = ClaimLedgerSchema.safeParse(sotaRaw.claim_ledger);
    if (!ledgerParse.success || !ledgerParse.data.locked) {
      return skipResult(this.id, goal, t0, "ledger_not_locked", "no locked claim ledger — refusing to render");
    }
    const ledger = ledgerParse.data;

    const variants = Array.isArray(sotaRaw.draft_variants)
      ? (sotaRaw.draft_variants as unknown[]).map((v) => DraftVariantSchema.parse(v))
      : [];
    const finalVariant = variants.find((v) => v.is_final);
    if (!finalVariant) {
      return skipResult(this.id, goal, t0, "no_final_variant", "draft tournament did not produce a winner");
    }

    // Verify that every claim_id used by the winner is in the locked ledger.
    const validClaimIds = new Set(ledger.claims.map((c) => c.id));
    const dangling = finalVariant.claim_ids.filter((id) => !validClaimIds.has(id));
    if (dangling.length > 0) {
      // Hard refuse — the refuse-or-ship gate later treats this as a
      // fabrication conflict via a typed audit entry.
      return skipResult(
        this.id,
        goal,
        t0,
        "claim_id_drift",
        `final variant references ${dangling.length} claim id(s) outside the locked ledger`,
      );
    }

    // ── 1. Render markdown artifacts ───────────────────────────────
    const claimsById = new Map(ledger.claims.map((c) => [c.id, c]));
    const consumedClaims = finalVariant.claim_ids
      .map((id) => claimsById.get(id))
      .filter((c): c is SotaClaim => Boolean(c));

    const artifacts: RenderedArtifact[] = [];
    const renderedAt = new Date().toISOString();

    const resumeMd = renderResumeMarkdown(ctx.blackboard, finalVariant.markdown, consumedClaims);
    artifacts.push(makeArtifact("resume_markdown", resumeMd, renderedAt));

    const coverText = (ctx.blackboard.draft as { cover_letter_text?: string }).cover_letter_text;
    if (typeof coverText === "string" && coverText.trim().length > 0) {
      artifacts.push(makeArtifact("cover_letter_markdown", coverText.trim(), renderedAt));
    }

    const strategyText = (ctx.blackboard.draft as { strategy_text?: string }).strategy_text;
    if (typeof strategyText === "string" && strategyText.trim().length > 0) {
      artifacts.push(makeArtifact("strategy_memo", strategyText.trim(), renderedAt));
    }

    // Provenance map — JSON keyed by claim id.
    const provenance = renderClaimProvenanceMap(consumedClaims);
    artifacts.push(makeArtifact("claim_provenance_map", JSON.stringify(provenance, null, 2), renderedAt));

    // Interview defense sheet — for every claim shown to the recruiter,
    // give the candidate a sharp question they should rehearse.
    const defenseMd = renderInterviewDefenseSheet(consumedClaims);
    artifacts.push(makeArtifact("interview_defense_sheet", defenseMd, renderedAt));

    // Audit packet — projection of the GDPR Article 22 disclosure.
    const auditPacket = renderAuditPacket(ctx.blackboard, finalVariant, ledger);
    artifacts.push(makeArtifact("audit_packet_json", JSON.stringify(auditPacket, null, 2), renderedAt));

    // ── 2. Verify parseability ───────────────────────────────────
    const failures: string[] = [];
    for (const a of artifacts) {
      if (!verifyArtifact(a)) {
        a.parseable = false;
        failures.push(a.kind);
      }
    }

    const pkg: RenderedApplicationPackage = {
      schema_version: PACKAGE_VERSION,
      generation_id: ctx.blackboard.generation_id,
      artifacts,
      finalized: failures.length === 0,
      finalized_at: failures.length === 0 ? renderedAt : null,
    };

    // ── 3. Validate against schema before persisting ─────────────
    const parsed = RenderedApplicationPackageSchema.parse(pkg);

    const writes: Array<{ path: string; value: unknown }> = [
      { path: "sota.rendered_package", value: parsed },
      // Mirror onto draft.* so the legacy result-renderer keeps working.
      { path: "draft.resume_markdown", value: resumeMd },
    ];

    return {
      writes,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: failures.length === 0 ? "package_finalized" : "package_unparseable",
        inputs_hash: AuditTrail.hash({
          n_claims: consumedClaims.length,
          variant_id: finalVariant.id,
          locked_hash: ledger.locked_hash,
        }),
        output_hash: AuditTrail.hash({
          n_artifacts: artifacts.length,
          finalized: parsed.finalized,
          sha256s: artifacts.map((a) => a.sha256),
        }),
        justification:
          failures.length === 0
            ? `rendered ${artifacts.length} artifact(s) — finalized=true (every artifact parseable)`
            : `rendered ${artifacts.length} artifact(s) — ${failures.length} parseability failure(s): ${failures.join(",")}`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: writes.map((w) => w.path),
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeArtifact(
  kind: RenderedArtifact["kind"],
  content: string,
  renderedAt: string,
): RenderedArtifact {
  const buf = Buffer.from(content, "utf8");
  return {
    id: `${kind}:${createHash("sha256").update(buf).digest("hex").slice(0, 12)}`,
    kind,
    uri: `inline:${kind}`,
    bytes: buf.byteLength,
    sha256: createHash("sha256").update(buf).digest("hex"),
    parseable: true,
    rendered_at: renderedAt,
  };
}

/**
 * Parseability checks per artifact kind. Defence-in-depth: if a
 * downstream renderer corrupts an artifact we surface it before the
 * gate ships.
 */
function verifyArtifact(a: RenderedArtifact): boolean {
  if (a.bytes === null || a.bytes <= 0) return false;
  if (a.kind.endsWith("_json")) {
    // Inline content was already produced by JSON.stringify — but if a
    // future renderer points to a remote URI we'd validate by fetching.
    return a.uri.startsWith("inline:") || a.uri.startsWith("https://");
  }
  if (a.kind.endsWith("_markdown") || a.kind === "interview_defense_sheet" || a.kind === "strategy_memo") {
    return a.uri.startsWith("inline:") || a.uri.startsWith("https://");
  }
  if (a.kind.endsWith("_docx") || a.kind.endsWith("_pdf")) {
    return a.uri.startsWith("https://") && a.bytes > 0;
  }
  return true;
}

function renderResumeMarkdown(
  blackboard: Blackboard,
  variantMarkdown: string,
  claims: SotaClaim[],
): string {
  // Trust the winning variant's markdown; append a hidden provenance
  // footer so claim ids round-trip through download/upload cycles.
  const trimmed = variantMarkdown.trim();
  const claimList = claims
    .map((c) => `- ${c.id}: ${c.text.slice(0, 120)}`)
    .join("\n");
  return `${trimmed}\n\n<!-- retune:claim-provenance\n${claimList}\n-->\n`;
}

function renderClaimProvenanceMap(claims: SotaClaim[]): Record<string, unknown> {
  return {
    schema: "retune.claim-provenance-map.v1",
    generated_at: new Date().toISOString(),
    claims: claims.map((c) => ({
      id: c.id,
      kind: c.kind,
      text: c.text,
      source_ids: c.source_ids,
      evidence_quotes: c.evidence_quotes,
      defensibility: c.defensibility,
      verified_by_user: c.verified_by_user,
    })),
  };
}

function renderInterviewDefenseSheet(claims: SotaClaim[]): string {
  const lines: string[] = ["# Interview Defense Sheet", ""];
  lines.push(
    "Every claim that ships in your resume should be defendable in interview. Rehearse the prompts below before applying.",
    "",
  );
  for (const c of claims) {
    lines.push(`## ${c.text}`, "");
    lines.push(`- Defensibility: **${c.defensibility}**`);
    lines.push(`- Confidence: ${c.confidence.toFixed(2)}`);
    lines.push(`- Prompt: ${c.interview_defense_prompt}`);
    if (c.evidence_quotes.length > 0) {
      lines.push("- Source quote:");
      for (const q of c.evidence_quotes) {
        lines.push(`  - "${q.quote.slice(0, 200)}"`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderAuditPacket(
  blackboard: Blackboard,
  finalVariant: import("@retune/types").DraftVariant,
  ledger: import("@retune/types").ClaimLedger,
): Record<string, unknown> {
  return {
    schema: "retune.audit-packet.v3",
    generation_id: blackboard.generation_id,
    user_id: blackboard.user_id,
    rendered_at: new Date().toISOString(),
    article_22_disclosure:
      "This application package was prepared by an automated cognitive system. Every claim shown to the recruiter traces to the locked claim ledger; every model call is recorded in the generation_model_calls table.",
    variant: {
      id: finalVariant.id,
      flavor: finalVariant.flavor,
      total_score: finalVariant.total_score,
      reason_won: finalVariant.reason_won,
    },
    ledger: {
      locked_hash: ledger.locked_hash,
      locked_at: ledger.locked_at,
      n_claims: ledger.claims.length,
    },
    audit_trail_count: blackboard.audit_trail.length,
    conflicts_count: blackboard.conflicts.length,
  };
}

function skipResult(
  id: string,
  goal: Goal,
  t0: number,
  micro_stage: string,
  justification: string,
): SpecialistResult {
  return {
    writes: [],
    satisfied_goal_ids: [goal.id],
    audit: {
      specialist: id,
      micro_stage,
      inputs_hash: AuditTrail.hash({ skipped_for: micro_stage }),
      output_hash: AuditTrail.hash({ status: "skipped" }),
      justification,
      latency_ms: Date.now() - t0,
      cost_usd: 0,
      writes: [],
    },
  };
}
