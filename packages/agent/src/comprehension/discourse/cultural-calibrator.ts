/**
 * CulturalCalibrator specialist (PRD §6.1, S3).
 *
 * Embeds the JD's cultural-signal sentences with the BGE embedder and
 * projects the result onto an 8-dimensional cultural fingerprint. The
 * fingerprint mirrors the eight axes used in `CompanySchema`:
 *
 *   0. autonomy ↔ structure
 *   1. async ↔ sync
 *   2. rigor ↔ velocity
 *   3. consensus ↔ direct
 *   4. depth ↔ breadth
 *   5. risk-tolerant ↔ risk-averse
 *   6. mission ↔ outcome
 *   7. high-agency ↔ specialist
 *
 * Method:
 *   1. Filter `discourse_map` to sentences with `function == "culture"`.
 *   2. If none, fall back to the JD as a whole (cultural signal is
 *      sometimes implicit in tone and verb choice).
 *   3. Embed each candidate sentence via the BGE embedder.
 *   4. Compute the centroid (mean over candidate embeddings).
 *   5. Project the centroid onto eight pre-computed axis prototype
 *      embeddings via cosine similarity, scaled to [-1, 1].
 *
 * The axis prototypes are deterministic seeded vectors derived from
 * canonical phrases (see `_AXIS_PROTOTYPES_RAW`). They live in this
 * file because they're a learned-once-per-ontology calibration; when
 * the cultural ontology gains an axis, this file is the single
 * touchpoint.
 *
 * Writes `hypotheses.cultural_vector` (length 8, each in [-1, 1]).
 *
 * Goal kind handled: `calibrate_cultural_vector`.
 *
 * Goal payload (required):
 *   - `jd_text`: string (used as fallback if discourse_map has no
 *     culture sentences)
 *
 */

import type { Goal, GoalKind } from "@retune/types";
import type { MLClient } from "../../ml-client";
import { AuditTrail } from "../../workbench/audit-trail";
import type { Specialist, SpecialistContext, SpecialistResult } from "../../workbench/types";

const HANDLES: readonly GoalKind[] = ["calibrate_cultural_vector"];

/**
 * Canonical phrasings of each axis pole. The calibrator embeds these
 * once at construction and projects JD embeddings onto them.
 */
const _AXIS_PROTOTYPES_RAW: ReadonlyArray<readonly [string, string]> = [
  ["high autonomy and self-direction", "structured processes and clear hierarchy"],
  ["async-first remote work across time zones", "in-person synchronous collaboration"],
  ["rigorous engineering and careful design", "ship fast and iterate quickly"],
  ["broad consensus and team alignment", "direct top-down decisions"],
  ["deep technical expertise in one area", "broad generalist skills across many areas"],
  ["high risk tolerance and bold experimentation", "risk-averse and conservative"],
  ["mission-driven impact on the world", "outcome-driven business results"],
  ["high agency individual contributors", "specialists with narrow scope"],
];

export const CULTURAL_VECTOR_DIM = 8;

export class CulturalCalibrator implements Specialist {
  readonly id = "cultural_calibrator";
  readonly display_name = "Cultural Calibrator";
  readonly brain_region = "right_tpj_sts";
  readonly handles_goal_kinds = HANDLES;
  readonly estimated_cost_usd = 0.0001; // BGE embed call
  readonly estimated_latency_ms = 60;

  // Lazily computed: pole_a_embedding[k] - pole_b_embedding[k] for each axis k.
  // Caching is per-specialist-instance, not module-global, so tests that
  // construct fresh instances get fresh prototypes.
  private axis_directions_cache: number[][] | null = null;

  constructor(private readonly ml_client: MLClient) {}

  async run(ctx: SpecialistContext, goal: Goal): Promise<SpecialistResult> {
    const t0 = Date.now();
    const jd_text = read_string(goal.payload?.jd_text);
    if (!jd_text) {
      return {
        writes: [],
        satisfied_goal_ids: [goal.id],
        audit: {
          specialist: this.id,
          micro_stage: "missing_input",
          inputs_hash: AuditTrail.hash({ goal_id: goal.id }),
          output_hash: AuditTrail.hash({ refused: true }),
          justification: "calibrate_cultural_vector goal had no jd_text",
          latency_ms: 0,
          cost_usd: 0,
          writes: [],
        },
      };
    }

    // Pick candidate sentences. Prefer culture-tagged sentences from a
    // populated discourse_map; fall back to the whole JD body.
    const map = ctx.blackboard.hypotheses.discourse_map;
    const culture_sentences = map
      ? map.filter((s) => s.function === "culture").map((s) => s.text)
      : [];
    const inputs = culture_sentences.length > 0 ? culture_sentences : [jd_text];

    // Build axis directions once per specialist instance.
    if (!this.axis_directions_cache) {
      this.axis_directions_cache = await this.compute_axis_directions(ctx.signal);
    }
    const directions = this.axis_directions_cache;

    // Embed inputs and centroid them.
    const embed_res = await this.ml_client.embed(
      { texts: [...inputs], model: "bge-large-en-v1.5", max_tokens: null },
      ctx.signal,
    );
    const centroid = mean_rows(embed_res.embeddings);

    // Project onto each axis: cos(centroid, pole_a) - cos(centroid, pole_b)
    // is mathematically equivalent to dot(centroid, normalize(pole_a - pole_b))
    // when centroid is unit-normalized. We use the dot-product form for
    // numerical stability + to keep the result naturally in [-1, 1] for
    // unit vectors.
    const centroid_n = normalize(centroid);
    const cultural_vector = directions.map((dir) => clamp(dot(centroid_n, dir), -1, 1));

    return {
      writes: [{ path: "hypotheses.cultural_vector", value: cultural_vector }],
      satisfied_goal_ids: [goal.id],
      audit: {
        specialist: this.id,
        micro_stage: "embed_and_project",
        inputs_hash: AuditTrail.hash({
          n_culture_sentences: culture_sentences.length,
          jd_length: jd_text.length,
          model_version: embed_res.model_version,
        }),
        output_hash: AuditTrail.hash({
          dims: cultural_vector.length,
          l2: l2(cultural_vector),
        }),
        justification: `projected ${inputs.length} sentence embeddings onto ${CULTURAL_VECTOR_DIM} cultural axes`,
        latency_ms: Date.now() - t0,
        cost_usd: this.estimated_cost_usd,
        writes: ["hypotheses.cultural_vector"],
      },
    };
  }

  /**
   * Embed both poles of each axis, return normalized direction vectors
   * `(pole_a - pole_b) / ||pole_a - pole_b||`.
   *
   * One batched embed call: all 16 strings at once.
   */
  private async compute_axis_directions(signal?: AbortSignal): Promise<number[][]> {
    const flat: string[] = [];
    for (const [a, b] of _AXIS_PROTOTYPES_RAW) {
      flat.push(a, b);
    }
    const res = await this.ml_client.embed(
      { texts: flat, model: "bge-large-en-v1.5", max_tokens: null },
      signal,
    );
    const directions: number[][] = [];
    for (let i = 0; i < _AXIS_PROTOTYPES_RAW.length; i++) {
      const a = res.embeddings[i * 2];
      const b = res.embeddings[i * 2 + 1];
      if (!a || !b) {
        throw new Error(`axis prototype embedding missing at index ${i}`);
      }
      directions.push(normalize(sub(a, b)));
    }
    return directions;
  }
}

// ──────────── vector helpers ────────────

function read_string(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function sub(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] {
  const out = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  }
  return out;
}

function dot(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function l2(v: ReadonlyArray<number>): number {
  return Math.sqrt(dot(v, v));
}

function normalize(v: ReadonlyArray<number>): number[] {
  const n = l2(v);
  if (n === 0) return v.map(() => 0);
  return v.map((x) => x / n);
}

function mean_rows(rows: ReadonlyArray<ReadonlyArray<number>>): number[] {
  if (rows.length === 0) throw new Error("mean_rows: empty input");
  const first = rows[0];
  if (!first) throw new Error("mean_rows: empty first row");
  const dim = first.length;
  const out = new Array<number>(dim).fill(0);
  for (const row of rows) {
    for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) + (row[i] ?? 0);
  }
  for (let i = 0; i < dim; i++) out[i] = (out[i] ?? 0) / rows.length;
  return out;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
