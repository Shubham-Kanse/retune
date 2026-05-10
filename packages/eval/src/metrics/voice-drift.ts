/**
 * Voice-drift cosine — the cerebellar metric.
 *
 * Cosine similarity between a candidate stylometric vector and the user's
 * voice centroid. Threshold (≥ 0.85) is enforced as a hard gate inside
 * the sequential bullet composer (PRD §8.8), and as a soft signal here
 * for offline evaluation.
 *
 * Inputs are 128-dim vectors per `comprehension/voice/fingerprint.ts`
 * (the canonical single source of truth — technical-2.0 §11). v2.0
 * fixed the v1.0 docstring drift that claimed 64 dims.
 */

export function voice_drift_cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 0;
  let dot = 0;
  let norm_a = 0;
  let norm_b = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    norm_a += ai * ai;
    norm_b += bi * bi;
  }
  const denom = Math.sqrt(norm_a) * Math.sqrt(norm_b);
  if (denom === 0) return 0;
  return dot / denom;
}
