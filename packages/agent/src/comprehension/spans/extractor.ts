/**
 * JdSpanExtractor — first specialist to do real cognitive ML work.
 *
 * Calls the ML server's `extractSpans` RPC over the configured transport
 * (HTTP or gRPC) and:
 *   1. validates returned spans (shape + offsets in-bounds),
 *   2. persists them as `evidence_spans` rows (when durability is wired),
 *   3. writes the resulting span ids onto `evidence_graph.span_ids` on
 *      the blackboard, where downstream specialists (gap mapper, evidence
 *      solver) will reference them.
 *
 * Goal kind handled: `extract_spans`.
 *
 * Goal payload (required):
 *   - `text`: string (the JD or profile body to scan)
 *   - `source_doc_kind`: SourceDocKind (e.g. "profile", "rendered_document")
 *
 * Goal payload (optional):
 *   - `span_kinds`: SpanKind[] (filter; empty = extract all)
 *
 * Refusal modes:
 *   - missing/empty `text` → satisfies the goal with zero writes and a
 *     "missing_input" audit entry. Caller is expected to abandon.
 *   - ML transport error → throws (orchestrator's tick-level catch
 *     records it as an error tick).
 *
 */

import { randomUUID } from "node:crypto";
import type { Goal, GoalKind, SourceDocKind, SpanKind } from "@retune/types";
import type { MLClient } from "../../ml-client";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["extract_spans"];

/**
 * Persistence sink for extracted spans. Returns the generated UUIDs in
 * the same order as the input. The pglite-backed
 * `PostgresPersistence.record_extracted_spans` matches this shape.
 *
 * When durability is OFF, the runtime passes a sink that returns
 * randomly-generated UUIDs without persisting — the workbench can still
 * reason about provenance during in-memory development.
 */
export interface ExtractedSpansSink {
  record(input: {
    user_id: string;
    source_document_id: string;
    spans: ReadonlyArray<{
      kind: SpanKind;
      text: string;
      char_start: number;
      char_end: number;
      confidence: number;
      provenance: string;
    }>;
  }): Promise<string[]>;
}

export class JdSpanExtractor implements Specialist {
  readonly id = "jd_span_extractor";
  readonly display_name = "JD Span Extractor";
  readonly brain_region = "temporal_cortex";
  readonly handles_goal_kinds = HANDLES;
  // GLiNER-multitask is ~30ms / paragraph on CPU; budget is conservative.
  readonly estimated_cost_usd = 0.0001;
  readonly estimated_latency_ms = 80;

  constructor(
    private readonly ml_client: MLClient,
    private readonly spans_sink: ExtractedSpansSink,
  ) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const text = read_string(goal.payload?.text);
    const source_doc_kind = read_source_doc_kind(goal.payload?.source_doc_kind);
    const span_kinds = read_span_kinds(goal.payload?.span_kinds);

    if (!text) {
      return missing_input(goal, this.id);
    }

    const inputs_hash = AuditTrail.hash({
      text_length: text.length,
      source_doc_kind,
      span_kinds,
    });

    const res = await this.ml_client.extract_spans(
      { text, source_doc_kind, span_kinds },
      ctx.signal,
    );

    // Defence-in-depth: the ML server is supposed to return offsets that
    // slice back to the matched substring, but we don't trust that across
    // a network boundary. Drop bogus spans rather than poison the graph.
    const valid_spans = res.spans.filter(
      (s) =>
        s.char_start >= 0 &&
        s.char_end <= text.length &&
        s.char_end > s.char_start &&
        text.slice(s.char_start, s.char_end).length > 0,
    );

    const persisted_ids = await this.spans_sink.record({
      user_id: ctx.blackboard.user_id,
      source_document_id: source_document_id_for(ctx, source_doc_kind),
      spans: valid_spans.map((s) => ({
        kind: s.kind,
        text: s.text,
        char_start: s.char_start,
        char_end: s.char_end,
        confidence: s.confidence.point,
        provenance: "extracted",
      })),
    });

    const next_span_ids = [...ctx.blackboard.evidence_graph.span_ids, ...persisted_ids];

    // v2.0 §7.1: chain `classify_discourse` and `map_gaps` so the comprehension
    // and strategy layers run automatically without API-level seeding. Only
    // emit `classify_discourse` for JD bodies (profile spans don't need
    // discourse classification) and only emit `map_gaps` once per generation
    // (downstream specialists are idempotent on re-entry but it's wasted work).
    const new_goals: Goal[] = [];
    if (source_doc_kind === "rendered_document" && text.length >= 50) {
      const now = new Date().toISOString();
      const base_priority = Math.max(0, (goal.priority ?? 75) - 1);
      new_goals.push({
        id: randomUUID(),
        kind: "classify_discourse",
        priority: base_priority,
        emitted_by: this.id,
        payload: { jd_text: text },
        status: "pending",
        satisfied_by: [],
        parent_goal_id: goal.id,
        created_at: now,
        updated_at: now,
      });
      new_goals.push({
        id: randomUUID(),
        kind: "map_gaps",
        priority: Math.max(0, base_priority - 1),
        emitted_by: this.id,
        payload: {},
        status: "pending",
        satisfied_by: [],
        parent_goal_id: goal.id,
        created_at: now,
        updated_at: now,
      });
    }

    return {
      writes: [{ path: "evidence_graph.span_ids", value: next_span_ids }],
      new_goals: new_goals.length > 0 ? new_goals : undefined,
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "ml_extract_and_persist",
        inputs_hash,
        output_hash: AuditTrail.hash({
          model_version: res.model_version,
          n_spans: persisted_ids.length,
          n_dropped: res.spans.length - valid_spans.length,
        }),
        justification: `extracted ${persisted_ids.length} spans (${res.spans.length - valid_spans.length} dropped on offset check) via ${res.model_version}`,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["evidence_graph.span_ids"],
      },
    };
  }
}

// ──────────── helpers ────────────

function read_string(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function read_source_doc_kind(v: unknown): SourceDocKind {
  // Anything we don't recognize falls back to a safe default — the
  // server doesn't actually branch on this in commit #6, so the choice
  // only affects the audit trail.
  if (typeof v === "string") {
    const known = [
      "profile",
      "resume_upload",
      "github_pr",
      "github_readme",
      "linkedin_about",
      "linkedin_post",
      "rec_letter",
      "blog_post",
      "talk_transcript",
      "interview_transcript",
      "user_attestation",
      "rendered_document",
    ] as const;
    if ((known as readonly string[]).includes(v)) {
      return v as SourceDocKind;
    }
  }
  return "profile";
}

function read_span_kinds(v: unknown): SpanKind[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is SpanKind => typeof x === "string") as SpanKind[];
}

function source_document_id_for(ctx: SpecialistContext, _kind: SourceDocKind): string {
  // Until we wire actual source-doc rows (commit #7+), use the JD id as
  // the carrier for JD-derived spans. Profile spans will get their own
  // resolver when the profile pipeline lands.
  return ctx.blackboard.jd_id;
}

function missing_input(goal: Goal, specialist_id: string): SpecialistResult {
  return {
    writes: [],
    satisfied_goal_ids: [goal.id],
    audit: {
      specialist: specialist_id,
      micro_stage: "missing_input",
      inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
      output_hash: AuditTrail.hash({ refused: true, reason: "no_text" }),
      justification: "extract_spans goal had no text payload — nothing to extract",
      latency_ms: 0,
      cost_usd: 0,
      writes: [],
    },
  };
}

// Suppress unused-import warning in environments where randomUUID isn't
// reachable from this module (it's pulled in by callers writing a sink
// that needs to fabricate ids). Keep the import here so the public
// `ExtractedSpansSink` is documentable in isolation.
void randomUUID;
