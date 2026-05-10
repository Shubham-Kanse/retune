/**
 * Deterministic workflow-id derivation.
 *
 * One workflow per generation; the id is `retune-<generation_id>`. This
 * keeps signal routing trivial (lookup from generation_id) and makes
 * the Temporal UI searchable by generation.
 *
 * Extracted as a tiny helper so the API and tests agree on the scheme.
 */

export function workflow_id_for(generation_id: string): string {
  return `retune-${generation_id}`;
}
