/**
 * WellBeingMonitor — insula (interoception + affective signal).
 *
 * Trigger-bus listener that detects candidate distress signals during
 * the generation cycle and surfaces them as well-being concerns.
 *
 * The cognitive science basis: the insula integrates interoceptive signals
 * (physiological state, affect) with external context. Here, we treat the
 * generation pipeline's quality signals as a proxy for candidate stress:
 *   - High retry counts on bullets → candidate evidence is thin / under-confident
 *   - Repeated fabrication conflicts → candidate may be over-claiming under pressure
 *   - Self-image score much lower than professional critics → imposter syndrome signal
 *   - Multiple pending_revisions → the system is struggling to represent the candidate
 *
 * When a well-being concern fires, it:
 *   1. Stages into the ConflictStagingQueue (commit #11 pattern)
 *   2. Records in an in-memory ring buffer for end-of-generation summary
 *
 * Well-being concerns are NOT blockers — they're advisory signals surfaced
 * to the candidate as empathetic nudges ("We noticed some gaps — would you
 * like to add more detail about X?").
 *
 * Watches:
 *   - "draft.bullets.*" — retry_count spikes
 *   - "draft.pending_revisions" — accumulation
 *   - "hypotheses.critic_ensemble_result" — self-image divergence
 *   - "hypotheses.ship_decision" — final verdict distress
 *
 * @brain insula: interoception + affective tagging + well-being detection
 * @thinking emotional_processing
 * @cellType spindle
 * @neurotransmitter serotonin
 */

import type { BlackboardEvent } from "@retune/types";
import type { ConflictStagingQueue } from "../workbench/conflict-staging";
import type { EventListener } from "../workbench/types";

const PATH_GLOBS = [
  "draft.bullets.*",
  "draft.pending_revisions",
  "hypotheses.critic_ensemble_result",
];

const RING_BUFFER_SIZE = 128;
const HIGH_RETRY_THRESHOLD = 2;
const SELF_IMAGE_DIVERGENCE_THRESHOLD = 25;
const PENDING_REVISIONS_CONCERN_THRESHOLD = 3;

export interface WellBeingConcern {
  kind:
    | "high_retry_rate"
    | "self_image_divergence"
    | "pending_revision_accumulation"
    | "refuse_verdict_distress";
  severity: "low" | "medium" | "high";
  message: string;
  nudge: string;
  timestamp: string;
}

export type WellBeingConcernHandler = (concern: WellBeingConcern) => void;

export class WellBeingMonitor implements EventListener {
  readonly id = "well_being_monitor";
  readonly path_glob = "**";
  readonly listener_kind = "monitor" as const;

  private readonly ring: WellBeingConcern[] = [];
  private readonly on_concern: WellBeingConcernHandler;
  private readonly staging_queue: ConflictStagingQueue | null;

  // Dedup: track which concerns we've already fired to avoid repeat noise
  private readonly fired = new Set<string>();

  constructor(opts?: {
    on_concern?: WellBeingConcernHandler;
    staging_queue?: ConflictStagingQueue;
  }) {
    this.on_concern = opts?.on_concern ?? (() => {});
    this.staging_queue = opts?.staging_queue ?? null;
  }

  on_event(event: BlackboardEvent): void {
    if (event.type !== "write") return;

    const path = event.path;

    // ── Bullet retry spike ──
    if (path.startsWith("draft.bullets.") && path.split(".").length === 3) {
      const bullet = event.after as { retry_count?: number; text?: string } | null;
      if (
        bullet &&
        typeof bullet.retry_count === "number" &&
        bullet.retry_count >= HIGH_RETRY_THRESHOLD
      ) {
        this.maybe_fire("high_retry_rate", {
          kind: "high_retry_rate",
          severity: "medium",
          message: `A bullet required ${bullet.retry_count} retries — your evidence for this requirement may be thin or hard to articulate.`,
          nudge: "Consider adding more specific details about this experience in your profile.",
          timestamp: event.timestamp,
        });
      }
    }

    // ── Pending revision accumulation ──
    if (path === "draft.pending_revisions") {
      const revisions = event.after as Array<unknown> | null;
      if (Array.isArray(revisions) && revisions.length >= PENDING_REVISIONS_CONCERN_THRESHOLD) {
        this.maybe_fire("pending_revision_accumulation", {
          kind: "pending_revision_accumulation",
          severity: "medium",
          message: `${revisions.length} bullets need revision — the system is having difficulty representing your experience authentically.`,
          nudge:
            "Adding more quantified outcomes to your profile would help us write stronger bullets for you.",
          timestamp: event.timestamp,
        });
      }
    }

    // ── Self-image divergence from professional critics ──
    if (path === "hypotheses.critic_ensemble_result") {
      const ensemble = event.after as {
        recruiter?: { score: number };
        hiring_manager?: { score: number };
        self_image?: { score: number };
      } | null;
      if (ensemble?.recruiter && ensemble?.hiring_manager && ensemble?.self_image) {
        const professional_avg = (ensemble.recruiter.score + ensemble.hiring_manager.score) / 2;
        const self = ensemble.self_image.score;
        const divergence = professional_avg - self;

        if (divergence >= SELF_IMAGE_DIVERGENCE_THRESHOLD) {
          this.maybe_fire("self_image_divergence_positive", {
            kind: "self_image_divergence",
            severity: "low",
            message: `Our analysis rates your application higher than your own self-assessment (professional: ${professional_avg.toFixed(0)}, self: ${self.toFixed(0)}). This is a common pattern — candidates often undersell themselves.`,
            nudge: "Trust the evidence — our analysis shows you're a stronger fit than you think.",
            timestamp: event.timestamp,
          });
        } else if (self - professional_avg >= SELF_IMAGE_DIVERGENCE_THRESHOLD) {
          this.maybe_fire("self_image_divergence_negative", {
            kind: "self_image_divergence",
            severity: "medium",
            message: `Your self-assessment rates this application higher than our professional analysis (self: ${self.toFixed(0)}, professional: ${professional_avg.toFixed(0)}). Consider whether the evidence fully supports your self-perception.`,
            nudge: "Adding more specific, verifiable achievements would close this gap.",
            timestamp: event.timestamp,
          });
        }
      }
    }

    // ── Refuse verdict distress ──
    if (path === "hypotheses.ship_decision") {
      const decision = event.after as { verdict?: string } | null;
      if (decision?.verdict === "refuse") {
        this.maybe_fire("refuse_verdict_distress", {
          kind: "refuse_verdict_distress",
          severity: "high",
          message:
            "This application couldn't meet our quality bar in its current form. That's not a reflection on you as a candidate — it means your profile needs more detail to represent you accurately for this specific role.",
          nudge:
            "We recommend strengthening your profile with specific projects, metrics, and tools before retrying.",
          timestamp: event.timestamp,
        });
      }
    }
  }

  private maybe_fire(dedup_key: string, concern: WellBeingConcern): void {
    if (this.fired.has(dedup_key)) return;
    this.fired.add(dedup_key);

    this.ring.push(concern);
    if (this.ring.length > RING_BUFFER_SIZE) this.ring.shift();

    this.on_concern(concern);

    if (this.staging_queue) {
      this.staging_queue.stage({
        monitor: "well_being",
        severity: concern.severity,
        payload: {
          kind: concern.kind,
          message: concern.message,
          nudge: concern.nudge,
        },
        emitted_by: this.id,
      });
    }
  }

  concerns(): readonly WellBeingConcern[] {
    return this.ring;
  }

  stats(): { total: number; by_kind: Record<string, number> } {
    const by_kind: Record<string, number> = {};
    for (const c of this.ring) {
      by_kind[c.kind] = (by_kind[c.kind] ?? 0) + 1;
    }
    return { total: this.ring.length, by_kind };
  }

  reset(): void {
    this.ring.length = 0;
    this.fired.clear();
  }
}

// Unused export kept for future path_globs iteration
export { PATH_GLOBS as WELL_BEING_WATCH_PATHS };
