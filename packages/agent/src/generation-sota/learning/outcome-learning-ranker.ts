/**
 * OutcomeLearningRanker (003 §6.9 Phase I).
 *
 * Re-ranks DraftVariants based on prior outcome signals + edit memory.
 * Pure deterministic; no LLM call. Designed to plug into the
 * DraftTournamentRunner so later generations for the same user
 * gradually surface variants whose flavor has historically led to
 * callbacks rather than rejections.
 *
 * Reward shaping:
 *
 *   1. Outcome memory:
 *      - callback / offer  → +0.10 to flavor's reward
 *      - rejection / ghost → -0.05
 *      Reward decays with age (half-life 30 days).
 *
 *   2. Edit memory:
 *      - accepted edit on a flavor's bullet → +0.02 to flavor reward
 *      - declined edit                       → -0.01
 *
 *   3. Final variant total_score is multiplied by
 *      `(1 + clamp(reward, -0.25, +0.25))` so the ordering can shift
 *      by at most ±25% — never enough to ship an unsafe variant, but
 *      enough to break ties in the user's favour.
 */

import type {
  DraftFlavor,
  DraftVariant,
  EditMemory,
  OutcomeMemory,
} from "@retune/types";

const HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const OUTCOME_REWARD: Record<string, number> = {
  callback: 0.1,
  screen: 0.05,
  onsite: 0.1,
  offer: 0.15,
  submitted: 0,
  rejection_with_reason: -0.05,
  rejection_without_reason: -0.05,
  ghosted: -0.03,
};

export interface RankerInput {
  variants: readonly DraftVariant[];
  outcome_memory?: OutcomeMemory;
  edit_memory?: EditMemory;
  /** Per-flavor seed reward — used in tests for deterministic fixtures. */
  flavor_priors?: Partial<Record<DraftFlavor, number>>;
  /** ISO timestamp the ranker treats as `now`. Defaults to Date.now(). */
  now_iso?: string;
}

export interface RankedVariant extends DraftVariant {
  reward: number;
  adjusted_score: number;
}

export interface RankerOutput {
  /** Variants in adjusted_score descending order. */
  ranked: RankedVariant[];
  /** Per-flavor reward signal for telemetry. */
  rewards: Partial<Record<DraftFlavor, number>>;
  /** Whether the ranker actually changed the order vs the input. */
  changed_order: boolean;
}

export function rankVariantsByLearning(input: RankerInput): RankerOutput {
  const now = input.now_iso ? new Date(input.now_iso).getTime() : Date.now();

  const rewards: Partial<Record<DraftFlavor, number>> = {};
  for (const flavor of FLAVOR_KEYS) {
    rewards[flavor] = input.flavor_priors?.[flavor] ?? 0;
  }

  // Outcome contributions, decayed by age.
  for (const o of input.outcome_memory ?? []) {
    const ts = new Date(o.recorded_at).getTime();
    const age_ms = Math.max(0, now - ts);
    const decay = Math.pow(0.5, age_ms / HALF_LIFE_MS);
    const r = OUTCOME_REWARD[o.outcome] ?? 0;
    // `delta_priority` shape carries a per-flavor hint when available,
    // otherwise the reward applies to every flavor equally.
    if (typeof o.delta_priority === "number" && Number.isFinite(o.delta_priority)) {
      // Bias the most-played flavor (heuristic: ats_forward) for a
      // generic priority bump.
      rewards.ats_forward = (rewards.ats_forward ?? 0) + r * decay;
    } else {
      for (const f of FLAVOR_KEYS) {
        rewards[f] = (rewards[f] ?? 0) + r * decay * 0.5; // half-credit when flavor is unknown
      }
    }
  }

  // Edit-memory contributions.
  for (const e of input.edit_memory ?? []) {
    const ts = new Date(e.timestamp).getTime();
    const decay = Math.pow(0.5, Math.max(0, now - ts) / HALF_LIFE_MS);
    const r = e.accepted ? 0.02 : -0.01;
    for (const f of FLAVOR_KEYS) {
      rewards[f] = (rewards[f] ?? 0) + r * decay * 0.25;
    }
  }

  const ranked: RankedVariant[] = input.variants.map((v) => {
    const reward = clamp(rewards[v.flavor] ?? 0, -0.25, 0.25);
    const adjusted_score = clamp(v.total_score * (1 + reward), 0, 1);
    return { ...v, reward, adjusted_score };
  });

  // Stable sort so ties preserve input order.
  const before = ranked.map((r) => r.id);
  ranked.sort((a, b) => b.adjusted_score - a.adjusted_score);
  const after = ranked.map((r) => r.id);
  const changed_order = !idsEqual(before, after);

  // Mark new winner as final, clear old winner's flag.
  for (const r of ranked) r.is_final = false;
  if (ranked[0]) {
    ranked[0].is_final = true;
    if (changed_order) {
      ranked[0].reason_won = `${ranked[0].reason_won ?? ""} | re-ranked by outcome learning (reward=${ranked[0].reward.toFixed(3)})`.trim();
    }
  }

  return { ranked, rewards, changed_order };
}

const FLAVOR_KEYS: readonly DraftFlavor[] = [
  "ats_forward",
  "recruiter_scan_forward",
  "hiring_manager_depth_forward",
  "authentic_voice_forward",
  "conservative_truth_forward",
  "merged",
];

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
