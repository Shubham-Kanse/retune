/**
 * VoiceFingerprintExtractor — pure-cognition stylometric specialist.
 *
 * Reads the user's profile docs (resume body, LinkedIn About, GitHub
 * READMEs — anything provided as `profile_text`) and computes a
 * deterministic 128-dim stylometric fingerprint. No ML calls.
 *
 * Method (PRD §6.2.1, simplified for commit #8):
 *   - 64 dims: function-word relative frequencies for the canonical
 *     Mosteller-Wallace 64-word list (the, of, and, to, in, …)
 *   - 32 dims: sentence-length-distribution percentiles (mean, std,
 *     p10/25/50/75/90 over the doc)
 *   - 16 dims: cohesion-marker densities (per 1000 tokens) for
 *     coordinators (and, but, or…), connectors (however, therefore…),
 *     intensifiers (very, extremely…), hedges (might, could…)
 *   - 16 dims: lexical-richness signals (TTR, hapax-ratio, average
 *     token length, capitalization rate)
 *
 * Result is L2-normalized so cosine similarity against another
 * fingerprint sits in [-1, 1].
 *
 * The whole pipeline is deterministic: same input bytes → same vector.
 * That's important for the `voice_drift` monitor (commit #10), which
 * compares each generated bullet's stylometry to this baseline.
 *
 * Goal kind handled: `extract_voice_fingerprint`.
 *
 * Goal payload (required):
 *   - `profile_texts`: string[] (at least one non-empty entry; we
 *     concatenate them with newline before feature extraction).
 *
 * Persistence: when a `VoiceFingerprintSink` is wired, the resulting
 * vector is upserted into `voice_centroids` keyed by `user_id`. The
 * blackboard always gets the vector regardless of persistence.
 *
 *        style imprint
 */

import type { Goal, GoalKind } from "@retune/types";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";
import { VOICE_FINGERPRINT_DIM, compute_fingerprint, l2_norm } from "./fingerprint";

export { VOICE_FINGERPRINT_DIM, compute_fingerprint } from "./fingerprint";

const HANDLES: readonly GoalKind[] = ["extract_voice_fingerprint"];

export interface VoiceFingerprintSink {
  record(input: {
    user_id: string;
    vector: ReadonlyArray<number>;
    sample_size: number;
  }): Promise<void>;
}

// Function-word list, cohesion-marker sets, and `compute_fingerprint`
// implementation now live in `comprehension/voice/fingerprint.ts` (the
// canonical single source of truth — technical-2.0 §11). This module
// re-exports them via the imports at the top of the file.

export class VoiceFingerprintExtractor implements Specialist {
  readonly id = "voice_fingerprint_extractor";
  readonly display_name = "Voice Fingerprint Extractor";
  readonly brain_region = "brocas_area";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0; // pure CPU, no network
  readonly estimated_latency_ms = 5;

  constructor(private readonly sink: VoiceFingerprintSink | null = null) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const texts = read_profile_texts(goal);
    if (texts.length === 0) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "missing_input",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ refused: true }),
          justification: "extract_voice_fingerprint had no profile_texts",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    const corpus = texts.join("\n");
    const vector = compute_fingerprint(corpus);
    const sample_size = texts.length;
    const inputs_hash = AuditTrail.hash({
      n_docs: sample_size,
      total_chars: corpus.length,
    });

    if (this.sink) {
      await this.sink.record({
        user_id: ctx.blackboard.user_id,
        vector,
        sample_size,
      });
    }

    return {
      writes: [{ path: "hypotheses.voice_fingerprint", value: vector }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "stylometric_fingerprint",
        inputs_hash,
        output_hash: AuditTrail.hash({
          dim: vector.length,
          l2: l2_norm(vector),
          sample_size,
        }),
        justification: `built ${VOICE_FINGERPRINT_DIM}-dim stylometric fingerprint from ${sample_size} profile doc(s)`,
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        writes: ["hypotheses.voice_fingerprint"],
      },
    };
  }
}

// ──────────── helpers ────────────

function read_profile_texts(goal: Goal): string[] {
  const v = goal.payload?.profile_texts;
  if (!Array.isArray(v)) {
    const single = goal.payload?.profile_text;
    if (typeof single === "string" && single.trim()) return [single];
    return [];
  }
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
