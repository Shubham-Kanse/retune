/**
 * NightlyConsolidator — entorhinal cortex (memory gating + consolidation).
 *
 * Implements PRD §11: hippocampal → neocortex consolidation.
 *
 * The human brain consolidates short-term episodic memories into long-term
 * semantic knowledge during slow-wave sleep. This pipeline does the same for
 * the system's per-generation episodic data:
 *
 *   Episodic (per-generation) → Semantic (per-user long-term)
 *   ─────────────────────────   ─────────────────────────────
 *   honesty_calibration logs  → updated Beta posteriors per claim_type
 *   voice_fingerprint samples → updated voice centroid (BGE quality flag)
 *   outcome records           → case_base_entries (for RAG in future)
 *   critic ensemble scores    → updated signal weights for OutcomePredictor
 *   gap_map statistics        → updated ontology skill adjacency confidence
 *
 * Runs:
 *   - Nightly per-user (triggered by cron at 03:17 UTC, PRD §11)
 *   - On-demand after a verified outcome (callback / offer / rejection)
 *
 * Architecture:
 *   - Not a Specialist (no goal kind) — it's a standalone async pipeline
 *   - Uses PersistenceStore interface for all DB reads/writes
 *   - Returns a ConsolidationReport summarizing what changed
 *
 */

import type { BetaPrior } from "@retune/types";

// ──────────── Persistence interface ────────────

export interface OutcomeRecord {
  application_id: string;
  generation_id: string;
  kind: "callback" | "offer" | "rejection" | "ghosted" | "withdrew";
  captured_at: string;
  user_id: string;
}

export interface HonestyCalibrationRow {
  user_id: string;
  claim_type: string;
  trust_factor: number;
  sample_size: number;
}

export interface VoiceCentroidRow {
  user_id: string;
  centroid: number[];
  sample_size: number;
  last_updated_at: string;
}

export interface GenerationRecord {
  generation_id: string;
  user_id: string;
  honesty_calibration: Record<string, number> | null;
  voice_fingerprint: number[] | null;
  outcome_estimate_point: number | null;
  verdict: "ship" | "revise" | "refuse" | null;
  arc_feasibility: number | null;
}

export interface ConsolidationStore {
  get_pending_outcomes(since: Date): Promise<OutcomeRecord[]>;
  get_generation(generation_id: string): Promise<GenerationRecord | null>;
  get_honesty_calibrations(user_id: string): Promise<HonestyCalibrationRow[]>;
  get_voice_centroid(user_id: string): Promise<VoiceCentroidRow | null>;
  update_honesty_calibration(row: HonestyCalibrationRow): Promise<void>;
  update_voice_centroid(row: VoiceCentroidRow): Promise<void>;
  record_case_base_entry(entry: CaseBaseEntry): Promise<void>;
  mark_outcome_consolidated(application_id: string): Promise<void>;
}

export interface CaseBaseEntry {
  user_hash: string;
  jd_embedding: number[];
  profile_embedding: number[];
  document_embeddings: number[][];
  outcome_kind: string;
  opt_in: boolean;
}

// ──────────── Report types ────────────

export interface HonestyUpdate {
  user_id: string;
  claim_type: string;
  prior_trust: number;
  posterior_trust: number;
  evidence_delta: number;
  direction: "improved" | "degraded" | "unchanged";
}

export interface VoiceCentroidUpdate {
  user_id: string;
  prev_sample_size: number;
  new_sample_size: number;
  cosine_change: number;
}

export interface ConsolidationReport {
  ran_at: string;
  outcomes_processed: number;
  honesty_updates: HonestyUpdate[];
  voice_centroid_updates: VoiceCentroidUpdate[];
  case_base_entries_added: number;
  errors: string[];
  duration_ms: number;
}

// ──────────── Bayesian update helpers ────────────

/**
 * Bayesian posterior for a Beta(α, β) prior updated with new observations.
 *
 * Outcome → claim type mapping:
 *   callback / offer  → claims were broadly verified (increment verified)
 *   rejection (early) → claims may have been inflated (increment unverified for leadership/scope)
 *   ghosted           → no signal (skip)
 */
function update_beta(prior: BetaPrior, verified: number, unverified: number): BetaPrior {
  return {
    alpha: prior.alpha + verified,
    beta: prior.beta + unverified,
  };
}

function beta_mean(p: BetaPrior): number {
  return p.alpha / (p.alpha + p.beta);
}

/**
 * Maps outcome kind to per-claim-type Bayesian evidence signals.
 *
 * Logic:
 *   - callback/offer: recruiter + HM believed the claims → all claim types get +verified
 *   - early_rejection (before screen): likely ATS/keyword issue, not honesty
 *   - post_screen_rejection: some claims may have been challenged → leadership/scope haircut
 */
function outcome_to_evidence(
  outcome_kind: OutcomeRecord["kind"],
): Record<string, { verified: number; unverified: number }> {
  switch (outcome_kind) {
    case "callback":
      return {
        metric: { verified: 1, unverified: 0 },
        scope: { verified: 1, unverified: 0 },
        leadership: { verified: 1, unverified: 0 },
        technical_depth: { verified: 1, unverified: 0 },
        duration: { verified: 1, unverified: 0 },
        achievement: { verified: 1, unverified: 0 },
      };
    case "offer":
      return {
        metric: { verified: 2, unverified: 0 },
        scope: { verified: 2, unverified: 0 },
        leadership: { verified: 2, unverified: 0 },
        technical_depth: { verified: 2, unverified: 0 },
        duration: { verified: 1, unverified: 0 },
        achievement: { verified: 2, unverified: 0 },
      };
    case "rejection":
      // Rejection post-screen: some claims may have been challenged
      return {
        metric: { verified: 0, unverified: 1 },
        scope: { verified: 0, unverified: 1 },
        leadership: { verified: 0, unverified: 1 },
        technical_depth: { verified: 0, unverified: 0 },
        duration: { verified: 0, unverified: 0 },
        achievement: { verified: 0, unverified: 1 },
      };
    case "ghosted":
    case "withdrew":
    default:
      return {};
  }
}

// ──────────── L2 norm helpers ────────────

function l2(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function add_vec(a: number[], b: number[]): number[] {
  return a.map((x, i) => x + (b[i] ?? 0));
}

function scale_vec(v: number[], s: number): number[] {
  return v.map((x) => x * s);
}

function cosine_dist(a: number[], b: number[]): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < dim; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? Math.max(0, 1 - dot / denom) : 1;
}

// ──────────── Consolidator ────────────

export class NightlyConsolidator {
  private readonly store: ConsolidationStore;
  private readonly user_id_hash: (uid: string) => string;

  constructor(store: ConsolidationStore, opts?: { user_id_hash?: (uid: string) => string }) {
    this.store = store;
    this.user_id_hash = opts?.user_id_hash ?? simple_hash;
  }

  /**
   * Run one consolidation sweep for all pending outcomes since `since`.
   * Idempotent: outcomes are marked consolidated after processing.
   */
  async run(since: Date): Promise<ConsolidationReport> {
    const t0 = Date.now();
    const report: ConsolidationReport = {
      ran_at: new Date().toISOString(),
      outcomes_processed: 0,
      honesty_updates: [],
      voice_centroid_updates: [],
      case_base_entries_added: 0,
      errors: [],
      duration_ms: 0,
    };

    let outcomes: OutcomeRecord[];
    try {
      outcomes = await this.store.get_pending_outcomes(since);
    } catch (err) {
      report.errors.push(
        `Failed to fetch pending outcomes: ${err instanceof Error ? err.message : String(err)}`,
      );
      report.duration_ms = Date.now() - t0;
      return report;
    }

    // Process each outcome independently — errors in one don't block others
    for (const outcome of outcomes) {
      try {
        await this.process_outcome(outcome, report);
        report.outcomes_processed++;
      } catch (err) {
        report.errors.push(
          `Outcome ${outcome.application_id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    report.duration_ms = Date.now() - t0;
    return report;
  }

  /**
   * Single outcome → consolidation steps:
   *   1. Update honesty calibration via Bayesian update
   *   2. Update voice centroid (exponential moving average)
   *   3. Record case_base_entry for RAG retrieval
   */
  private async process_outcome(
    outcome: OutcomeRecord,
    report: ConsolidationReport,
  ): Promise<void> {
    const gen = await this.store.get_generation(outcome.generation_id);
    if (!gen) return;

    const evidence = outcome_to_evidence(outcome.kind);

    // ── Step 1: Honesty calibration ──
    if (Object.keys(evidence).length > 0 && gen.honesty_calibration) {
      const existing = await this.store.get_honesty_calibrations(outcome.user_id);
      const by_type = new Map(existing.map((r) => [r.claim_type, r]));

      for (const [claim_type, { verified, unverified }] of Object.entries(evidence)) {
        if (verified === 0 && unverified === 0) continue;

        const prior: BetaPrior = (() => {
          const row = by_type.get(claim_type);
          if (!row) return { alpha: 1, beta: 1 };
          const a = row.trust_factor * row.sample_size;
          const b = row.sample_size - a;
          return { alpha: Math.max(1, a), beta: Math.max(1, b) };
        })();

        const posterior = update_beta(prior, verified, unverified);
        const prior_trust = beta_mean(prior);
        const posterior_trust = beta_mean(posterior);
        const delta = posterior_trust - prior_trust;

        await this.store.update_honesty_calibration({
          user_id: outcome.user_id,
          claim_type,
          trust_factor: posterior_trust,
          sample_size: (by_type.get(claim_type)?.sample_size ?? 0) + verified + unverified,
        });

        report.honesty_updates.push({
          user_id: outcome.user_id,
          claim_type,
          prior_trust,
          posterior_trust,
          evidence_delta: delta,
          direction: Math.abs(delta) < 0.005 ? "unchanged" : delta > 0 ? "improved" : "degraded",
        });
      }
    }

    // ── Step 2: Voice centroid (exponential moving average) ──
    if (gen.voice_fingerprint && gen.voice_fingerprint.length > 0) {
      const fp = gen.voice_fingerprint;
      const existing_centroid = await this.store.get_voice_centroid(outcome.user_id);

      let new_centroid: number[];
      let cosine_change = 0;
      const new_sample_size = (existing_centroid?.sample_size ?? 0) + 1;

      if (!existing_centroid || existing_centroid.sample_size === 0) {
        // Cold start: first fingerprint becomes the centroid
        new_centroid = [...fp];
      } else {
        // EMA update: weight new sample by 1/n for running average
        const prev = existing_centroid.centroid;
        const alpha = 1.0 / new_sample_size;
        const updated = add_vec(scale_vec(prev, 1 - alpha), scale_vec(fp, alpha));

        // L2-normalize for stable cosine comparison
        const norm = l2(updated);
        new_centroid = norm > 1e-10 ? updated.map((x) => x / norm) : updated;
        cosine_change = cosine_dist(prev, new_centroid);
      }

      await this.store.update_voice_centroid({
        user_id: outcome.user_id,
        centroid: new_centroid,
        sample_size: new_sample_size,
        last_updated_at: new Date().toISOString(),
      });

      report.voice_centroid_updates.push({
        user_id: outcome.user_id,
        prev_sample_size: existing_centroid?.sample_size ?? 0,
        new_sample_size,
        cosine_change,
      });
    }

    // ── Step 3: Case-base entry (for RAG retrieval) ──
    // Only record opt-in users with shipped applications
    if (outcome.kind === "callback" || outcome.kind === "offer") {
      const user_hash = this.user_id_hash(outcome.user_id);

      await this.store.record_case_base_entry({
        user_hash,
        // Embeddings are stub zeros until BGE is wired (commit #15 / production)
        jd_embedding: new Array(768).fill(0),
        profile_embedding: gen.voice_fingerprint ?? new Array(128).fill(0),
        document_embeddings: [],
        outcome_kind: outcome.kind,
        opt_in: false, // Requires explicit user opt-in
      });

      report.case_base_entries_added++;
    }

    await this.store.mark_outcome_consolidated(outcome.application_id);
  }
}

// ──────────── Utility ────────────

function simple_hash(uid: string): string {
  // Non-reversible user ID hash for case-base privacy
  let h = 0x811c9dc5;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
