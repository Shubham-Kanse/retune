/**
 * VoiceDriftMonitor — cerebellum (fine motor adjustment) + Broca's.
 *
 * Trigger-bus listener that watches `draft.bullets.*` writes and computes
 * the cosine similarity between each new bullet's stylometric fingerprint
 * and the candidate's baseline voice_fingerprint (from commit #8).
 *
 * When drift exceeds τ (configurable, default 0.35), raises a
 * pending_revision on the blackboard requesting a rewrite with stricter
 * voice adherence.
 *
 * This is the second listener-driven specialist (after FairnessMonitor in
 * commit #8). It establishes the pattern for stylometric quality control
 * during bullet composition.
 *
 * Architecture:
 *   - Does NOT run inside the orchestrator's tick loop
 *   - Subscribes to TriggerBus on path glob "draft.bullets.*"
 *   - Fires on every write to a bullet slot
 *   - Cannot mutate blackboard directly (async, non-transactional)
 *   - Emits drift measurements to an injected callback
 *   - Ring buffer of measurements (256) for inspection at generation end
 *
 */

import type { BlackboardEvent } from "@retune/types";
import { compute_fingerprint, voice_drift_cosine } from "../comprehension/voice/fingerprint";
import type { ConflictStagingQueue } from "../workbench/conflict-staging";
import type { EventListener } from "../workbench/types";

// ──────────── Constants ────────────

const DRIFT_THRESHOLD = 0.35;
const RING_BUFFER_SIZE = 256;
const PATH_GLOB = "draft.bullets.*";

// Voice fingerprint computation lives in `comprehension/voice/fingerprint.ts`
// (technical-2.0 §11 — single source of truth shared with
// VoiceFingerprintExtractor). This listener imports `compute_fingerprint`
// directly so dimension semantics stay aligned.

// ──────────── Types ────────────

export interface DriftMeasurement {
  bullet_id: string;
  bullet_text: string;
  cosine_similarity: number;
  drift_exceeded: boolean;
  timestamp: string;
}

export type DriftConcernHandler = (measurement: DriftMeasurement) => void;

// ──────────── Monitor ────────────

export class VoiceDriftMonitor implements EventListener {
  readonly id = "voice_drift_monitor";
  readonly path_glob = PATH_GLOB;
  readonly listener_kind = "monitor" as const;

  private baseline: readonly number[] | null;
  private readonly threshold: number;
  private readonly on_drift: DriftConcernHandler;
  private readonly ring: DriftMeasurement[] = [];
  private readonly staging_queue: ConflictStagingQueue | null;

  constructor(opts?: {
    baseline?: readonly number[] | null;
    threshold?: number;
    on_drift?: DriftConcernHandler;
    /**
     * Optional ConflictStagingQueue (technical-2.0 §9). When provided,
     * each drift-exceeded measurement is staged for the orchestrator to
     * persist into the durable conflicts table.
     */
    staging_queue?: ConflictStagingQueue;
  }) {
    this.baseline = opts?.baseline ?? null;
    this.threshold = opts?.threshold ?? DRIFT_THRESHOLD;
    this.on_drift = opts?.on_drift ?? (() => {});
    this.staging_queue = opts?.staging_queue ?? null;
  }

  /**
   * Set the baseline voice fingerprint. Called once the blackboard has
   * hypotheses.voice_fingerprint populated (after VoiceFingerprintExtractor).
   */
  set_baseline(fingerprint: readonly number[]): void {
    this.baseline = fingerprint;
  }

  on_event(event: BlackboardEvent): void {
    if (!this.baseline) return;
    if (event.type !== "write") return;

    // Extract bullet text from the written value
    const bullet_text = extract_bullet_text(event.after);
    if (!bullet_text || bullet_text.length < 20) return;

    const bullet_id = extract_bullet_id(event.path);
    if (!bullet_id) return;

    // Compute local fingerprint of the bullet using the canonical module.
    const bullet_fp = compute_fingerprint(bullet_text);

    // Cosine similarity against baseline
    const cos = voice_drift_cosine(bullet_fp, this.baseline);
    const drift_exceeded = cos < 1.0 - this.threshold;

    const measurement: DriftMeasurement = {
      bullet_id,
      bullet_text: bullet_text.slice(0, 120),
      cosine_similarity: cos,
      drift_exceeded,
      timestamp: new Date().toISOString(),
    };

    // Ring buffer
    this.ring.push(measurement);
    if (this.ring.length > RING_BUFFER_SIZE) {
      this.ring.shift();
    }

    if (drift_exceeded) {
      this.on_drift(measurement);
      // v2.0 §9: stage the drift conflict so it lands in the durable
      // conflicts table — without this, drift detections evaporate at
      // workflow completion.
      if (this.staging_queue) {
        this.staging_queue.stage({
          monitor: "voice_drift",
          severity: cos < 0.5 ? "high" : cos < 0.65 ? "medium" : "low",
          payload: {
            bullet_id,
            cosine: cos,
            threshold: this.threshold,
            text_excerpt: bullet_text.slice(0, 120),
          },
          emitted_by: this.id,
        });
      }
    }
  }

  /** Snapshot of all measurements (for end-of-generation report). */
  measurements(): readonly DriftMeasurement[] {
    return this.ring;
  }

  /** Summary statistics. */
  stats(): { total: number; drifted: number; avg_cosine: number; min_cosine: number } {
    if (this.ring.length === 0) return { total: 0, drifted: 0, avg_cosine: 1.0, min_cosine: 1.0 };
    let sum = 0;
    let min = 1.0;
    let drifted = 0;
    for (const m of this.ring) {
      sum += m.cosine_similarity;
      if (m.cosine_similarity < min) min = m.cosine_similarity;
      if (m.drift_exceeded) drifted++;
    }
    return {
      total: this.ring.length,
      drifted,
      avg_cosine: sum / this.ring.length,
      min_cosine: min,
    };
  }
}

// ──────────── Event parsing ────────────

function extract_bullet_text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
  }
  return null;
}

function extract_bullet_id(path: string): string | null {
  // path format: "draft.bullets.<uuid>" or "draft.bullets.<uuid>.text"
  const parts = path.split(".");
  if (parts.length >= 3 && parts[0] === "draft" && parts[1] === "bullets") {
    return parts[2] ?? null;
  }
  return null;
}
