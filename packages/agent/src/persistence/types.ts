/**
 * Persistence interfaces.
 *
 * The orchestrator accepts an optional `TickPersistence`. After every
 * successful tick the orchestrator calls `persist_tick()` with the
 * post-commit blackboard, the newly-recorded audit entry, and the
 * current goal stack. Implementations MUST:
 *
 *   - persist atomically (single DB transaction), so a mid-write crash
 *     leaves the store either at seq N-1 or seq N, never in between
 *   - be idempotent on (generation_id, seq) so replay + retry is safe
 *
 * `ensure_generation()` is called once at the start of a run with the
 * user/persona/seed blackboard so the store can create the parent row
 * for FK targets. Implementations MUST be idempotent on `generation_id`
 * to support resume.
 *
 * Separation between `TickPersistence` (write path) and
 * `GenerationReplayLoader` (read path) mirrors CQRS: the writer sees
 * one tick at a time; the reader reconstructs the whole state from the
 * log. That keeps the tick path cheap and the replay path explicit.
 *
 * @brain hippocampus → neocortex consolidation (write); retrieval cue
 *        → episodic replay (read)
 */

import type { AuditEntry, Blackboard, CostBudget, Goal } from "@retune/types";

export interface EnsureGenerationInput {
  generation_id: string;
  user_id: string;
  jd_id: string | null;
  ontology_version: string;
  initial_blackboard: Blackboard;
  initial_goals: readonly Goal[];
}

export interface PersistTickInput {
  generation_id: string;
  seq: number;
  snapshot: Blackboard;
  audit_entry: AuditEntry;
  /** Full current goal stack (all statuses). */
  goals: readonly Goal[];
  /** Current budget. */
  budget: CostBudget;
}

export interface CompleteGenerationInput {
  generation_id: string;
  termination: string;
  ticks_executed: number;
  total_cost_usd: number;
  total_latency_ms: number;
}

export interface TickPersistence {
  ensure_generation(input: EnsureGenerationInput): Promise<void>;
  persist_tick(input: PersistTickInput): Promise<void>;
  complete_generation(input: CompleteGenerationInput): Promise<void>;
}

export interface ReplayedGeneration {
  generation_id: string;
  user_id: string;
  jd_id: string | null;
  ontology_version: string;
  /** Latest blackboard snapshot (highest seq). Null if no ticks have run yet. */
  blackboard: Blackboard;
  /** All audit entries in seq order. */
  audit_entries: readonly AuditEntry[];
  /** All goals (any status). */
  goals: readonly Goal[];
  /** Latest budget state derived from the snapshot. */
  budget: CostBudget;
  /** Highest seq seen; -1 if nothing has been persisted yet. */
  latest_seq: number;
  termination: string | null;
}

export interface GenerationReplayLoader {
  load(generation_id: string): Promise<ReplayedGeneration | null>;
}
