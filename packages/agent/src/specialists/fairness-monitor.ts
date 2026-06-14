/**
 * FairnessMonitor — first **trigger-bus listener** specialist.
 *
 * Subscribes to writes on `hypotheses.discourse_map` and (in commit
 * #10) `draft.bullets.*`, and raises a `fairness_concern` conflict
 * when it detects gendered, age-coded, or accent-coded language.
 *
 * Why a listener (not a goal-driven specialist)? Fairness scanning is
 * cross-cutting — it should fire on EVERY write that emits user-facing
 * language, regardless of which specialist produced it. Goal-driven
 * specialists run when the orchestrator picks them; listeners run on
 * every matching event. This is the architectural pattern for all
 * monitor-style specialists going forward (voice_drift, repetition,
 * coherence — all land in commits #10–13 as listeners).
 *
 * The monitor cannot mutate the blackboard directly (listeners run
 * outside a tick boundary, so writes wouldn't be transactional). Instead
 * it:
 *   1. records detections in an in-memory ring buffer (`detections()`)
 *   2. invokes an injected `on_concern` callback that the orchestrator
 *      wires to its conflict-staging queue, which it drains on the next
 *      tick.
 *
 * For commit #8, the simpler path: emit the conflict via the callback
 * synchronously; the runtime's substrate decides whether to push it
 * onto the goal stack as an `audit_fairness` goal or surface it on
 * the trace stream.
 *
 */

import { randomUUID } from "node:crypto";
import type { BlackboardEvent, ConflictRecord } from "@retune/types";
import type { ConflictStagingQueue } from "../workbench/conflict-staging";
import type { EventListener } from "../workbench/types";

interface Pattern {
  /** Severity. */
  severity: ConflictRecord["severity"];
  /** Human-readable description. */
  description: string;
  /** Pattern category written into the conflict payload. */
  category: "gendered" | "age_coded" | "accent_coded" | "ableist";
  /** Word-bounded regex over lowercased text. */
  re: RegExp;
}

// Curated, deliberately conservative. False positives are expensive
// (they'd bog the cycle in resolve_conflict goals); false negatives are
// also expensive but commit #11's critic ensemble catches the rest.
const FAIRNESS_PATTERNS: ReadonlyArray<Pattern> = [
  // Gendered tech-cliché terms (Gaucher et al. 2011 + Textio findings).
  {
    severity: "medium",
    category: "gendered",
    description: 'gendered cliché: "rockstar"',
    re: /\brockstar\b/i,
  },
  {
    severity: "medium",
    category: "gendered",
    description: 'gendered cliché: "ninja"',
    re: /\bninja\b/i,
  },
  {
    severity: "medium",
    category: "gendered",
    description: 'gendered cliché: "guru"',
    re: /\bguru\b/i,
  },
  {
    severity: "low",
    category: "gendered",
    description: 'masculine-coded: "aggressive"',
    re: /\baggressive\b/i,
  },
  {
    severity: "low",
    category: "gendered",
    description: 'masculine-coded: "dominant"',
    re: /\bdominant\b/i,
  },
  // Age-coded.
  {
    severity: "high",
    category: "age_coded",
    description: 'age-coded: "young"/"recent grad"',
    re: /\b(?:young|recent\s+grad(?:uate)?|digital\s+native)\b/i,
  },
  {
    severity: "high",
    category: "age_coded",
    description: 'age-coded: "energetic"/"high energy"',
    re: /\b(?:energetic|high[-\s]energy)\b/i,
  },
  // Accent-coded / nationality-coded.
  {
    severity: "high",
    category: "accent_coded",
    description: 'accent-coded: "native English speaker"',
    re: /\bnative\s+(?:english|speaker)\b/i,
  },
  // Ableist.
  {
    severity: "medium",
    category: "ableist",
    description: 'ableist: "able-bodied"',
    re: /\bable[-\s]bodied\b/i,
  },
];

export interface FairnessConcern {
  conflict: ConflictRecord;
  matched_text: string;
  matched_path: string;
}

export type FairnessConcernHandler = (concern: FairnessConcern) => void | Promise<void>;

export class FairnessMonitor implements EventListener {
  readonly id = "fairness_monitor";
  readonly listener_kind = "monitor" as const;
  readonly path_glob: string;

  private readonly handler: FairnessConcernHandler;
  private readonly staging_queue: ConflictStagingQueue | null;
  private readonly buffer: FairnessConcern[] = [];
  /** Cap on the in-memory buffer to bound RSS for very long generations. */
  private static readonly MAX_BUFFER = 256;

  /**
   * @param handler synchronous on-concern callback (typically the SSE trace forwarder).
   * @param path_glob defaults to `**` (every write). The bus's path
   *   matcher is glob-only (no OR), so we subscribe broadly and filter
   *   inside `on_event` via `_PATH_OF_INTEREST_RE` to confine work to
   *   user-facing-language paths.
   * @param staging_queue optional ConflictStagingQueue (technical-2.0 §9).
   *   When provided, every detected concern is also staged for the
   *   orchestrator to drain into the durable conflicts table.
   */
  constructor(
    handler: FairnessConcernHandler = () => {},
    path_glob = "**",
    staging_queue: ConflictStagingQueue | null = null,
  ) {
    this.handler = handler;
    this.path_glob = path_glob;
    this.staging_queue = staging_queue;
  }

  /** Paths the monitor actually inspects. Anything else is short-circuited. */
  private static readonly PATH_OF_INTEREST_RE =
    /^(?:hypotheses\.discourse_map|draft\.bullets\.|draft\.sections\.)/;

  /** Snapshot of detected concerns since construction. */
  detections(): readonly FairnessConcern[] {
    return [...this.buffer];
  }

  async on_event(event: BlackboardEvent): Promise<void> {
    if (event.type !== "write") return;
    // Honor the constructor-supplied glob first (tests pass tighter ones).
    // When the glob is `**`, fall back to our internal path filter so we
    // don't scan irrelevant blackboard regions like `audit_trail` or
    // `cost_budget` on every write.
    if (this.path_glob === "**" && !FairnessMonitor.PATH_OF_INTEREST_RE.test(event.path)) {
      return;
    }
    const text = stringify(event.after);
    if (!text) return;

    for (const p of FAIRNESS_PATTERNS) {
      const m = text.match(p.re);
      if (!m) continue;
      const conflict: ConflictRecord = {
        id: randomUUID(),
        monitor: "fairness_concern",
        severity: p.severity,
        payload: {
          category: p.category,
          description: p.description,
          matched_text: m[0],
          matched_path: event.path,
          source_specialist: event.by_specialist,
        },
        resolved_by: null,
        resolution_log: null,
        created_at: new Date().toISOString(),
        resolved_at: null,
      };
      const concern: FairnessConcern = {
        conflict,
        matched_text: m[0],
        matched_path: event.path,
      };
      this.buffer.push(concern);
      if (this.buffer.length > FairnessMonitor.MAX_BUFFER) {
        this.buffer.shift();
      }
      // v2.0 §9: stage the concern so the orchestrator persists it into
      // the conflicts table on the next tick drain. Without this, fairness
      // detections evaporate at workflow completion.
      if (this.staging_queue) {
        this.staging_queue.stage({
          monitor: "fairness_concern",
          severity: p.severity,
          payload: conflict.payload,
          emitted_by: this.id,
        });
      }
      try {
        await this.handler(concern);
      } catch (err) {
        // Listener errors are also caught by the trigger bus. Re-log
        // here so a misconfigured handler is visible in dev.
        // eslint-disable-next-line no-console
        console.error(`[fairness_monitor] handler threw on "${event.path}":`, err);
      }
    }
  }
}

// ──────────── helpers ────────────

/**
 * Best-effort coercion of any blackboard value into a single string we
 * can scan. Discourse map entries come through as arrays of objects
 * with `.text`; bullet drafts have `.text` too. JSON-stringify is the
 * safe fallback.
 */
function stringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(stringify).join("\n");
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    try {
      return JSON.stringify(v);
    } catch {
      return "";
    }
  }
  return String(v);
}
