/**
 * StubJdSpanExtractor — regex-based requirement extraction for dev/test.
 *
 * Used when the ML server is unreachable. Parses requirements from the
 * JD text using heuristics and writes them directly to
 * `evidence_graph.requirement_matches` so GapMapper has something to
 * work with without needing the ML pipeline.
 *
 * Handles `extract_spans` goals where source_doc_kind is
 * "rendered_document" (JD). Profile spans are no-op'd — the voice
 * fingerprint extractor handles profile text separately.
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

// ──────────── Keyword extraction helpers ────────────

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "years",
  "year",
  "experience",
  "strong",
  "proficiency",
  "familiarity",
  "knowledge",
  "understanding",
  "ability",
  "skills",
  "skill",
  "working",
  "work",
  "prior",
  "background",
  "demonstrated",
  "proven",
  "solid",
  "good",
  "excellent",
  "great",
  "preferred",
  "required",
  "minimum",
  "plus",
  "include",
  "including",
  "least",
  "more",
  "than",
  "such",
  "as",
  "etc",
  "eg",
  "ie",
  "very",
  "highly",
  "well",
  "also",
]);

/**
 * Extract meaningful keywords from a requirement string.
 * Preserves tech terms with special chars (Node.js, CI/CD, REST APIs, etc.)
 * while removing stop words and short tokens.
 */
function extract_keywords(text: string): string[] {
  // Capture tech terms with special chars: Node.js, CI/CD, REST APIs, gRPC, TypeScript, etc.
  const tech = Array.from(
    text.matchAll(
      /\b[A-Za-z][A-Za-z0-9]*(?:[./+#][A-Za-z0-9]+)+\b|\bCI\/CD\b|\bREST\b|\bgRPC\b|\bSQL\b|\bNoSQL\b|\bAPI[s]?\b/g,
    ),
  ).map((m) => m[0]!.toLowerCase());

  // Regular words (length >= 3, not stop words, not purely numeric)
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  return [...new Set([...tech, ...words])];
}

/**
 * Score a single JD requirement against the candidate profile text.
 * Returns matched pseudo-span IDs (one per matched keyword) and a
 * normalised confidence point.
 */
function score_requirement_against_profile(
  requirement: string,
  profile_text: string,
): { span_ids: string[]; confidence_point: number } {
  const req_kws = extract_keywords(requirement);
  if (req_kws.length === 0) return { span_ids: [], confidence_point: 0 };

  const profile_lower = profile_text.toLowerCase();
  const matched: string[] = [];

  for (const kw of req_kws) {
    // Try exact match first.
    if (profile_lower.includes(kw)) {
      matched.push(randomUUID());
      continue;
    }
    // Try stemmed match (first 5 chars) for morphological variants.
    if (kw.length >= 5) {
      const stem = kw.slice(0, 5);
      if (new RegExp(`\\b${stem}`, "i").test(profile_lower)) {
        matched.push(randomUUID());
      }
    }
  }

  const overlap = matched.length / req_kws.length;
  if (overlap < 0.15) return { span_ids: [], confidence_point: 0 };

  const confidence_point = Math.min(0.92, 0.35 + overlap * 0.65);
  return { span_ids: matched, confidence_point };
}

const HANDLES: readonly GoalKind[] = ["extract_spans"];

// Patterns that signal a requirement line in a JD
const REQUIREMENT_PATTERNS = [
  /^\s*[-•*]\s+(.+)$/, // bullet points
  /^\s*\d+[.)]\s+(.+)$/, // numbered lists
  /^(must have|required|requirements?|qualifications?|you (will|should|must)|we (need|require|expect|are looking for))[:\s]+(.+)$/i,
];

// Minimum length for a line to be considered a requirement
const MIN_REQ_LENGTH = 15;

/**
 * Deterministic stub mirroring JdSpanExtractor's brain-region tagging
 * for offline/dev runs (RETUNE_ML_USE_STUBS=true).
 *
 * @brain temporal cortex: lexical/structural pattern extraction
 * @thinking pattern_extraction
 * @cellType pyramidal
 * @neurotransmitter glutamate
 */
export class StubJdSpanExtractor implements Specialist {
  readonly id = "jd_span_extractor";
  readonly display_name = "JD Span Extractor (stub)";
  readonly brain_region = "temporal_cortex";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0;
  readonly estimated_latency_ms = 2;

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const text = goal.payload?.text;
    const source_doc_kind = goal.payload?.source_doc_kind ?? "profile";

    if (typeof text !== "string" || text.trim().length < 50) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "missing_input",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ refused: true }),
          justification: "extract_spans stub: no text payload",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    // Only extract requirements from JD text; profile spans are handled
    // by VoiceFingerprintExtractor and don't need requirement_matches.
    if (source_doc_kind !== "rendered_document") {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "profile_skip",
          inputs_hash: AuditTrail.hash({ source_doc_kind }),
          output_hash: AuditTrail.hash({ skipped: true }),
          justification: `stub: skipping span extraction for source_doc_kind=${source_doc_kind}`,
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    // If a profile_text was passed alongside the JD, use it to score each
    // requirement and populate evidence_span_ids. This prevents GapMapper
    // from treating all requirements as unmet when the profile clearly
    // contains matching evidence.
    const profile_text: string =
      typeof goal.payload?.profile_text === "string" ? goal.payload.profile_text : "";

    const requirements = extract_requirements(text);
    const span_ids = requirements.map(() => randomUUID());

    const requirement_matches = requirements.map((req, i) => {
      if (profile_text.length > 0) {
        const { span_ids: ev_ids, confidence_point } = score_requirement_against_profile(
          req,
          profile_text,
        );
        const has_evidence = ev_ids.length > 0;
        return {
          requirement_id: span_ids[i]!,
          requirement_text: req,
          disposition: (has_evidence ? "direct_hit" : "missable") as "direct_hit" | "missable",
          evidence_span_ids: ev_ids,
          match_confidence: has_evidence
            ? {
                point: confidence_point,
                lower: Math.max(0, confidence_point - 0.15),
                upper: Math.min(1, confidence_point + 0.08),
              }
            : { point: 0.1, lower: 0.0, upper: 0.25 },
        };
      }
      // No profile text available — fall back to the original stub behaviour
      // (direct_hit with empty evidence, 0.5 confidence).
      return {
        requirement_id: span_ids[i]!,
        requirement_text: req,
        disposition: "direct_hit" as const,
        evidence_span_ids: [] as string[],
        match_confidence: { point: 0.5, lower: 0.3, upper: 0.7 },
      };
    });

    const existing_matches = ctx.blackboard.evidence_graph.requirement_matches ?? [];
    const existing_span_ids = ctx.blackboard.evidence_graph.span_ids ?? [];

    return {
      writes: [
        {
          path: "evidence_graph.requirement_matches",
          value: [...existing_matches, ...requirement_matches],
        },
        {
          path: "evidence_graph.span_ids",
          value: [...existing_span_ids, ...span_ids],
        },
      ],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "stub_extract",
        inputs_hash: AuditTrail.hash({ text_length: text.length }),
        output_hash: AuditTrail.hash({ n_requirements: requirements.length, stub: true }),
        justification: `stub: extracted ${requirements.length} requirements from JD text via regex`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["evidence_graph.requirement_matches", "evidence_graph.span_ids"],
      },
    };
  }
}

function extract_requirements(text: string): string[] {
  const lines = text.split("\n");
  const requirements: string[] = [];
  let in_requirements_section = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Detect section headers that signal requirements
    if (
      /^#+\s*(requirements?|qualifications?|what you.ll (need|bring)|must have|skills|experience)/i.test(
        trimmed,
      )
    ) {
      in_requirements_section = true;
      continue;
    }
    // Reset on new section header
    if (/^#+\s+/.test(trimmed) && in_requirements_section) {
      in_requirements_section = false;
    }

    // Extract bullet/numbered list items
    for (const pattern of REQUIREMENT_PATTERNS) {
      const m = trimmed.match(pattern);
      if (m) {
        const req = (m[m.length - 1] ?? "").trim();
        if (req.length >= MIN_REQ_LENGTH) {
          requirements.push(req);
        }
        break;
      }
    }

    // In a requirements section, also grab plain sentences
    if (in_requirements_section && trimmed.length >= MIN_REQ_LENGTH && !trimmed.startsWith("#")) {
      if (!requirements.includes(trimmed)) {
        requirements.push(trimmed);
      }
    }
  }

  // Fallback: if nothing found, split on sentences and take the first 10
  if (requirements.length === 0) {
    const sentences = text
      .split(/[.!?]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= MIN_REQ_LENGTH)
      .slice(0, 10);
    requirements.push(...sentences);
  }

  return requirements.slice(0, 30); // cap at 30 requirements
}
