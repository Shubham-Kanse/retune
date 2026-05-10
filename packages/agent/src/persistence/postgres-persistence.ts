/**
 * Postgres-backed TickPersistence + GenerationReplayLoader.
 *
 * Every tick is written in a single transaction spanning:
 *   - blackboard_snapshots (append new row at seq)
 *   - audit_entries        (append new row at seq)
 *   - goals                (upsert each goal with ON CONFLICT UPDATE)
 *   - generations          (update aggregate counters + current_blackboard)
 *
 * Crash at any point yields a transactional rollback — the store ends at
 * seq N-1, which is exactly what `GenerationReplayLoader.load()` will
 * return. This is the durability property the orchestrator relies on
 * for `resume-from-crash`.
 *
 * Idempotency: unique index on (generation_id, seq) for both snapshots
 * and audit entries rejects double-commits; the orchestrator only calls
 * `persist_tick()` after blackboard.commit() succeeds, so the seq is
 * already monotonic and unique within a run.
 *
 * @brain hippocampal consolidation: atomic episodic encoding
 */

import type { PgDb } from "@retune/db/pg";
import {
  audit_entries as audit_entries_table,
  blackboard_snapshots,
  generations,
  goals as goals_table,
} from "@retune/db/pg";
import type { AuditEntry, Blackboard, CostBudget, Goal } from "@retune/types";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  CompleteGenerationInput,
  EnsureGenerationInput,
  GenerationReplayLoader,
  PersistTickInput,
  ReplayedGeneration,
  TickPersistence,
} from "./types";

export class PostgresPersistence implements TickPersistence, GenerationReplayLoader {
  constructor(private readonly db: PgDb) {}

  async ensure_generation(input: EnsureGenerationInput): Promise<void> {
    // Upsert the generation row and seed goals. Idempotent per
    // generation_id so resume is safe.
    //
    // We use .onConflictDoNothing() for generations — the row may
    // already exist from a previous (crashed) run; we don't want to
    // reset ticks_executed.
    await this.db.transaction(async (tx) => {
      await tx
        .insert(generations)
        .values({
          id: input.generation_id,
          user_id: input.user_id,
          jd_id: input.jd_id ?? null,
          ontology_version: input.ontology_version,
          current_blackboard: input.initial_blackboard as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing();

      // Seed goals (also idempotent — if the row is already there we leave it).
      if (input.initial_goals.length > 0) {
        await tx
          .insert(goals_table)
          .values(
            input.initial_goals.map((g) => ({
              id: g.id,
              generation_id: input.generation_id,
              kind: g.kind,
              priority: g.priority,
              emitted_by: g.emitted_by,
              status: g.status,
              payload: (g.payload ?? null) as unknown,
              parent_goal_id: g.parent_goal_id,
              satisfied_by: g.satisfied_by as unknown,
            })),
          )
          .onConflictDoNothing();
      }
    });
  }

  async persist_tick(input: PersistTickInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(blackboard_snapshots).values({
        generation_id: input.generation_id,
        seq: input.seq,
        snapshot: input.snapshot as unknown as Record<string, unknown>,
      });

      await tx.insert(audit_entries_table).values({
        generation_id: input.generation_id,
        seq: input.audit_entry.seq,
        specialist: input.audit_entry.specialist,
        micro_stage: input.audit_entry.micro_stage ?? null,
        inputs_hash: input.audit_entry.inputs_hash,
        output_hash: input.audit_entry.output_hash,
        justification: input.audit_entry.justification ?? null,
        model_version: input.audit_entry.model_version ?? null,
        latency_ms: input.audit_entry.latency_ms,
        cost_usd: input.audit_entry.cost_usd,
        writes: input.audit_entry.writes as unknown,
      });

      // Upsert every goal — the orchestrator only sends the current
      // state, so we overwrite previous rows with ON CONFLICT.
      for (const g of input.goals) {
        await tx
          .insert(goals_table)
          .values({
            id: g.id,
            generation_id: input.generation_id,
            kind: g.kind,
            priority: g.priority,
            emitted_by: g.emitted_by,
            status: g.status,
            payload: (g.payload ?? null) as unknown,
            parent_goal_id: g.parent_goal_id,
            satisfied_by: g.satisfied_by as unknown,
          })
          .onConflictDoUpdate({
            target: goals_table.id,
            set: {
              kind: g.kind,
              priority: g.priority,
              status: g.status,
              payload: (g.payload ?? null) as unknown,
              parent_goal_id: g.parent_goal_id,
              satisfied_by: g.satisfied_by as unknown,
              updated_at: new Date(),
            },
          });
      }

      await tx
        .update(generations)
        .set({
          current_blackboard: input.snapshot as unknown as Record<string, unknown>,
          ticks_executed: sql`${generations.ticks_executed} + 1`,
          total_cost_usd: sql`${generations.total_cost_usd} + ${input.audit_entry.cost_usd}`,
          total_latency_ms: sql`${generations.total_latency_ms} + ${input.audit_entry.latency_ms}`,
          updated_at: new Date(),
        })
        .where(eq(generations.id, input.generation_id));
    });
  }

  async complete_generation(input: CompleteGenerationInput): Promise<void> {
    await this.db
      .update(generations)
      .set({
        termination: input.termination,
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(generations.id, input.generation_id));
  }

  async load(generation_id: string): Promise<ReplayedGeneration | null> {
    const gen_row = (
      await this.db.select().from(generations).where(eq(generations.id, generation_id)).limit(1)
    )[0];
    if (!gen_row) return null;

    const latest_snapshot_rows = await this.db
      .select()
      .from(blackboard_snapshots)
      .where(eq(blackboard_snapshots.generation_id, generation_id))
      .orderBy(desc(blackboard_snapshots.seq))
      .limit(1);
    const latest_snapshot = latest_snapshot_rows[0];

    const audit_rows = await this.db
      .select()
      .from(audit_entries_table)
      .where(eq(audit_entries_table.generation_id, generation_id))
      .orderBy(asc(audit_entries_table.seq));

    const goals_rows = await this.db
      .select()
      .from(goals_table)
      .where(eq(goals_table.generation_id, generation_id));

    const blackboard = (latest_snapshot?.snapshot ??
      gen_row.current_blackboard) as unknown as Blackboard;

    const replayed_goals: Goal[] = goals_rows.map((row) => ({
      id: row.id,
      kind: row.kind as Goal["kind"],
      priority: row.priority,
      emitted_by: row.emitted_by,
      status: row.status as Goal["status"],
      payload: (row.payload ?? undefined) as Record<string, unknown> | undefined,
      parent_goal_id: row.parent_goal_id,
      satisfied_by: (row.satisfied_by as unknown as string[]) ?? [],
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    }));

    const replayed_audit: AuditEntry[] = audit_rows.map((row) => ({
      seq: row.seq,
      specialist: row.specialist,
      micro_stage: row.micro_stage ?? undefined,
      inputs_hash: row.inputs_hash,
      output_hash: row.output_hash,
      justification: row.justification ?? undefined,
      model_version: row.model_version ?? undefined,
      latency_ms: row.latency_ms,
      cost_usd: row.cost_usd,
      timestamp: row.recorded_at.toISOString(),
      writes: (row.writes as unknown as string[]) ?? [],
    }));

    const budget: CostBudget = blackboard.cost_budget;

    return {
      generation_id,
      user_id: gen_row.user_id,
      jd_id: gen_row.jd_id,
      ontology_version: gen_row.ontology_version,
      blackboard,
      audit_entries: replayed_audit,
      goals: replayed_goals,
      budget,
      latest_seq: latest_snapshot?.seq ?? -1,
      termination: gen_row.termination,
    };
  }

  /**
   * Convenience helper used by the ActiveQuestionHandler specialist.
   * Runs outside the tick path so it doesn't block the orchestrator.
   */
  async record_active_question(input: {
    user_id: string;
    generation_id: string;
    goal_id: string;
    question: string;
    target_field: string;
  }): Promise<void> {
    // Imported lazily to keep the module's eager imports small.
    const { active_questions } = await import("@retune/db/pg");
    await this.db
      .insert(active_questions)
      .values({
        user_id: input.user_id,
        generation_id: input.generation_id,
        goal_id: input.goal_id,
        question: input.question,
        target_field: input.target_field,
      })
      .onConflictDoNothing();
    // Suppress the unused-binding warning if drizzle adds dynamic args later.
    void and;
  }

  /**
   * Bulk-insert extracted spans for a given user/document. Returns the
   * generated UUIDs in the same order as `input.spans`, so the caller
   * (the JdSpanExtractor specialist) can write them onto
   * `evidence_graph.span_ids` on the blackboard.
   *
   * Idempotency note: this is intentionally append-only. If the same
   * specialist runs twice (replay, or retry after a crash), the second
   * run produces a fresh set of rows. The orchestrator dedupes upstream
   * by satisfying the goal on first success.
   */
  async record_extracted_spans(input: {
    user_id: string;
    source_document_id: string;
    spans: ReadonlyArray<{
      kind: string;
      text: string;
      char_start: number;
      char_end: number;
      confidence: number;
      provenance: string;
    }>;
  }): Promise<string[]> {
    if (input.spans.length === 0) return [];
    const { evidence_spans } = await import("@retune/db/pg");
    const rows = input.spans.map((s) => ({
      user_id: input.user_id,
      source_document_id: input.source_document_id,
      start_offset: s.char_start,
      end_offset: s.char_end,
      text_snippet: s.text,
      span_type: s.kind,
      confidence: s.confidence,
      provenance: s.provenance,
    }));
    // `.returning()` on the PgDb union type narrows poorly; cast to the
    // pglite branch (postgres-js's `.returning()` is interface-equivalent).
    const inserted = (await (
      this.db.insert(evidence_spans).values(rows) as unknown as {
        returning(): Promise<Array<{ id: string }>>;
      }
    ).returning()) as Array<{ id: string }>;
    return inserted.map((r) => r.id);
  }

  /**
   * Upsert a user's voice centroid (stylometric fingerprint).
   *
   * `voice_centroids` is keyed by `user_id` (one fingerprint per user,
   * updated as more profile docs are seen). The `sample_size` field
   * tracks how many documents contributed to the centroid; later
   * specialists weight the prior accordingly.
   */
  async record_voice_fingerprint(input: {
    user_id: string;
    vector: ReadonlyArray<number>;
    sample_size: number;
  }): Promise<void> {
    const { voice_centroids } = await import("@retune/db/pg");
    await this.db
      .insert(voice_centroids)
      .values({
        user_id: input.user_id,
        vector: input.vector as number[],
        sample_size: input.sample_size,
      })
      .onConflictDoUpdate({
        target: voice_centroids.user_id,
        set: {
          vector: input.vector as number[],
          sample_size: input.sample_size,
          updated_at: new Date(),
        },
      });
  }

  /**
   * Read a user's voice centroid. Returns `null` when no fingerprint
   * has been recorded yet (cold-start case).
   */
  async load_voice_fingerprint(user_id: string): Promise<{
    vector: number[];
    sample_size: number;
  } | null> {
    const { voice_centroids } = await import("@retune/db/pg");
    const rows = await this.db
      .select()
      .from(voice_centroids)
      .where(eq(voice_centroids.user_id, user_id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      vector: r.vector as number[],
      sample_size: r.sample_size,
    };
  }

  /**
   * Upsert a per-user × claim_type honesty calibration. The unique
   * (user_id, claim_type) constraint guarantees idempotency on retry.
   *
   * `trust_factor` is a multiplier applied to claim confidence — 1.0
   * means "no adjustment", < 1.0 dampens, > 1.0 (rare; usually 0.7-1.0)
   * boosts. The Bayesian update lives in the calibrator specialist.
   */
  async record_honesty_calibration(input: {
    user_id: string;
    claim_type: string;
    trust_factor: number;
    sample_size: number;
  }): Promise<void> {
    const { honesty_calibrations } = await import("@retune/db/pg");
    await this.db
      .insert(honesty_calibrations)
      .values({
        user_id: input.user_id,
        claim_type: input.claim_type,
        trust_factor: input.trust_factor,
        sample_size: input.sample_size,
      })
      .onConflictDoUpdate({
        target: [honesty_calibrations.user_id, honesty_calibrations.claim_type],
        set: {
          trust_factor: input.trust_factor,
          sample_size: input.sample_size,
          updated_at: new Date(),
        },
      });
  }

  /**
   * All honesty calibrations for a user, indexed by claim_type. Returns
   * an empty record on cold-start.
   */
  async load_honesty_calibrations(
    user_id: string,
  ): Promise<Record<string, { trust_factor: number; sample_size: number }>> {
    const { honesty_calibrations } = await import("@retune/db/pg");
    const rows = await this.db
      .select()
      .from(honesty_calibrations)
      .where(eq(honesty_calibrations.user_id, user_id));
    const out: Record<string, { trust_factor: number; sample_size: number }> = {};
    for (const r of rows) {
      out[r.claim_type] = {
        trust_factor: r.trust_factor,
        sample_size: r.sample_size,
      };
    }
    return out;
  }

  /**
   * Persist a GDPR Article 22 audit packet for a generation.
   * Idempotent — keyed by generation_id (PK). If the generation is
   * replayed and the gate re-runs, the second insert is a no-op.
   */
  async record_gdpr_packet(input: {
    generation_id: string;
    user_id: string;
    verdict: string;
    packet: Record<string, unknown>;
  }): Promise<void> {
    const { gdpr_packets } = await import("@retune/db/pg");
    await this.db
      .insert(gdpr_packets)
      .values({
        generation_id: input.generation_id,
        user_id: input.user_id,
        verdict: input.verdict,
        packet: input.packet,
      })
      .onConflictDoNothing();
  }

  /**
   * Load the GDPR audit packet for a generation. Returns null if no
   * packet has been recorded (generation still in progress or crashed
   * before the gate ran).
   */
  async load_gdpr_packet(
    generation_id: string,
  ): Promise<{ verdict: string; packet: Record<string, unknown> } | null> {
    const { gdpr_packets } = await import("@retune/db/pg");
    const rows = await this.db
      .select()
      .from(gdpr_packets)
      .where(eq(gdpr_packets.generation_id, generation_id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      verdict: r.verdict,
      packet: r.packet as Record<string, unknown>,
    };
  }

  /**
   * Persist a conflict as a queryable row in the `conflicts` table.
   * Separate from the blackboard JSONB snapshot — this allows querying
   * conflicts by monitor/severity across generations without reading
   * full snapshots.
   *
   * Idempotent via the UUID primary key.
   */
  async record_conflict(input: {
    generation_id: string;
    conflict: {
      id: string;
      monitor: string;
      severity: string;
      payload: Record<string, unknown>;
      resolved_by?: string | null;
      resolved_at?: string | null;
    };
  }): Promise<void> {
    const { conflicts } = await import("@retune/db/pg");
    await this.db
      .insert(conflicts)
      .values({
        id: input.conflict.id,
        generation_id: input.generation_id,
        monitor: input.conflict.monitor,
        severity: input.conflict.severity,
        kind: (input.conflict.payload.type as string) ?? input.conflict.monitor,
        payload: input.conflict.payload,
        resolved_by_specialist: input.conflict.resolved_by ?? null,
        resolved_at: input.conflict.resolved_at ? new Date(input.conflict.resolved_at) : null,
      })
      .onConflictDoNothing();
  }
}
