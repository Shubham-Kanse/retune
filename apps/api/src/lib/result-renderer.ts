/**
 * Render a generation's final blackboard into the user-facing payload
 * `{resume, cover_letter, strategy, ...}` consumed by the result page.
 *
 * The cognitive cycle's `SequentialBulletComposer` writes per-bullet drafts
 * into `draft.bullets.<uuid>` and section scaffolds into `draft.sections.<id>`.
 * Cover-letter and application-strategy generation are deferred to v2.1
 * per PRD §6.4, so the corresponding fields are populated when present and
 * left null/undefined when not.
 */

import type { Blackboard, BulletDraft, SectionDraft } from "@retune/types";
import { resultStatusFromMeta } from "./generation-status";

export interface GenerationResultPayload {
  generation_id: string;
  status: "running" | "complete" | "refused" | "error" | "unknown";
  verdict: string | null;
  company: string | null;
  role: string | null;
  resume: string | null;
  cover_letter: string | null;
  strategy: string | null;
  ats_score: number | null;
  interview_ready_score: number | null;
  submission_confidence: number | null;
  outcome_estimate: { point: number; lower: number | null; upper: number | null } | null;
  narrative_arc: { thesis: string; voice: string } | null;
  conflicts: Array<{
    id: string;
    monitor: string;
    severity: string;
    summary: string;
  }>;
  pending_revisions: Array<{ target: string; reason: string }>;
  total_cost_usd: number;
  ticks_executed: number;
  generation_time_ms: number;
  termination: string | null;
  /**
   * SOTA rendered package — list of artifact metadata (id, kind, sha256,
   * parseable, bytes). Populated when ApplicationPackageRenderer ran.
   * 003 §6.8 — lets the result page hydrate from durable storage after
   * process restart.
   */
  rendered_package: {
    finalized: boolean;
    finalized_at: string | null;
    artifacts: Array<{
      id: string;
      kind: string;
      sha256: string | null;
      bytes: number | null;
      parseable: boolean;
      rendered_at: string;
    }>;
  } | null;
}

const SECTION_ORDER: SectionDraft["kind"][] = [
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
];

const SECTION_HEADINGS: Record<SectionDraft["kind"], string> = {
  summary: "Summary",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  education: "Education",
};

export function renderResumeMarkdown(blackboard: Blackboard): string | null {
  const draftAny = blackboard.draft as unknown as Record<string, unknown>;
  const directResume =
    (typeof draftAny.resume_text === "string" ? draftAny.resume_text : null) ??
    (typeof draftAny.resume_markdown === "string" ? draftAny.resume_markdown : null) ??
    (typeof draftAny.final_resume === "string" ? draftAny.final_resume : null) ??
    (typeof draftAny.final_resume_markdown === "string" ? draftAny.final_resume_markdown : null);
  if (directResume && directResume.trim().length > 0) return directResume.trim();

  const sectionMap = blackboard.draft.sections;
  const bulletMap = blackboard.draft.bullets;
  if (!sectionMap || Object.keys(sectionMap).length === 0) return null;

  const lines: string[] = [];

  // Group sections by kind so we can emit them in canonical order.
  const sectionsByKind = new Map<SectionDraft["kind"], SectionDraft[]>();
  for (const section of Object.values(sectionMap)) {
    const arr = sectionsByKind.get(section.kind) ?? [];
    arr.push(section);
    sectionsByKind.set(section.kind, arr);
  }

  for (const kind of SECTION_ORDER) {
    const sections = sectionsByKind.get(kind);
    if (!sections || sections.length === 0) continue;
    lines.push(`## ${SECTION_HEADINGS[kind]}`, "");
    for (const section of sections) {
      if (section.rendered_text) {
        lines.push(section.rendered_text.trim(), "");
        continue;
      }
      const bullets = section.bullet_ids
        .map((id: string) => bulletMap[id])
        .filter((b: BulletDraft | undefined): b is BulletDraft => Boolean(b));
      for (const bullet of bullets) {
        lines.push(`- ${bullet.text.trim()}`);
      }
      if (bullets.length > 0) lines.push("");
    }
  }

  // Emit any non-canonical section kinds instead of dropping them.
  for (const [kind, sections] of sectionsByKind.entries()) {
    if (SECTION_ORDER.includes(kind)) continue;
    const heading = kind
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`## ${heading || "Additional Section"}`, "");
    for (const section of sections) {
      if (section.rendered_text) {
        lines.push(section.rendered_text.trim(), "");
        continue;
      }
      const bullets = section.bullet_ids
        .map((id: string) => bulletMap[id])
        .filter((b: BulletDraft | undefined): b is BulletDraft => Boolean(b));
      for (const bullet of bullets) {
        lines.push(`- ${bullet.text.trim()}`);
      }
      if (bullets.length > 0) lines.push("");
    }
  }

  if (lines.length === 0) return null;
  return lines.join("\n").trimEnd();
}

interface ShipDecisionLike {
  verdict?: string;
  ats_coverage_pct?: number;
  interview_ready_score?: number;
  submission_confidence?: number;
}

interface NarrativeArcLike {
  thesis?: string;
  voice?: string;
}

export function renderResult(
  generation_id: string,
  blackboard: Blackboard | null,
  meta: {
    termination: string | null;
    ticks_executed: number;
    total_cost_usd: number;
    generation_time_ms: number;
  },
): GenerationResultPayload {
  if (!blackboard) {
    return {
      generation_id,
      status: "unknown",
      verdict: null,
      company: null,
      role: null,
      resume: null,
      cover_letter: null,
      strategy: null,
      ats_score: null,
      interview_ready_score: null,
      submission_confidence: null,
      outcome_estimate: null,
      narrative_arc: null,
      conflicts: [],
      pending_revisions: [],
      total_cost_usd: meta.total_cost_usd,
      ticks_executed: meta.ticks_executed,
      generation_time_ms: meta.generation_time_ms,
      termination: meta.termination,
      rendered_package: null,
    };
  }

  const ship_decision = (blackboard.hypotheses as unknown as { ship_decision?: ShipDecisionLike })
    .ship_decision;
  const arc = blackboard.hypotheses.chosen_narrative_arc as NarrativeArcLike | null;

  const verdict = ship_decision?.verdict ?? null;
  const status = resultStatusFromMeta({ verdict, termination: meta.termination });

  const outcome = blackboard.outcome_estimate;

  const companySchema = blackboard.hypotheses.company_schema as { display_name?: string } | null;
  const roleSchema = blackboard.hypotheses.role_schema as { display_name?: string } | null;

  return {
    generation_id,
    status,
    verdict,
    company: companySchema?.display_name ?? null,
    role: roleSchema?.display_name ?? null,
    resume: renderResumeMarkdown(blackboard),
    cover_letter:
      (blackboard.draft as unknown as { cover_letter_text?: string }).cover_letter_text ?? null,
    strategy: (blackboard.draft as unknown as { strategy_text?: string }).strategy_text ?? null,
    ats_score:
      typeof ship_decision?.ats_coverage_pct === "number" ? ship_decision.ats_coverage_pct : null,
    interview_ready_score:
      typeof ship_decision?.interview_ready_score === "number"
        ? ship_decision.interview_ready_score
        : null,
    submission_confidence:
      typeof ship_decision?.submission_confidence === "number"
        ? ship_decision.submission_confidence
        : null,
    outcome_estimate: outcome
      ? {
          point: outcome.point,
          lower: outcome.lower ?? null,
          upper: outcome.upper ?? null,
        }
      : null,
    narrative_arc: arc?.thesis ? { thesis: arc.thesis, voice: arc.voice ?? "" } : null,
    conflicts: (blackboard.conflicts ?? []).map((c) => {
      const payload = (c.payload as Record<string, unknown> | null) ?? null;
      const summary =
        (payload?.summary as string | undefined) ??
        (payload?.message as string | undefined) ??
        (payload?.category as string | undefined) ??
        c.monitor;
      return { id: c.id, monitor: c.monitor, severity: c.severity, summary };
    }),
    pending_revisions: (blackboard.draft.pending_revisions ?? []).map((p) => ({
      target: p.target,
      reason: p.reason,
    })),
    total_cost_usd: meta.total_cost_usd,
    ticks_executed: meta.ticks_executed,
    generation_time_ms: meta.generation_time_ms,
    termination: meta.termination,
    rendered_package: extractRenderedPackage(blackboard),
  };
}

function extractRenderedPackage(
  blackboard: Blackboard,
): GenerationResultPayload["rendered_package"] {
  const sota = (blackboard as unknown as { sota?: Record<string, unknown> }).sota;
  if (!sota || typeof sota !== "object") return null;
  const pkg = (sota as { rendered_package?: unknown }).rendered_package as
    | { finalized?: boolean; finalized_at?: string | null; artifacts?: unknown }
    | undefined;
  if (!pkg) return null;
  const artifactsRaw = Array.isArray(pkg.artifacts) ? pkg.artifacts : [];
  return {
    finalized: !!pkg.finalized,
    finalized_at: pkg.finalized_at ?? null,
    artifacts: artifactsRaw
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({
        id: String(a.id ?? ""),
        kind: String(a.kind ?? ""),
        sha256: typeof a.sha256 === "string" ? a.sha256 : null,
        bytes: typeof a.bytes === "number" ? a.bytes : null,
        parseable: a.parseable !== false,
        rendered_at: typeof a.rendered_at === "string" ? a.rendered_at : "",
      })),
  };
}
