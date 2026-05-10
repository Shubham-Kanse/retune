/**
 * Workbench orchestrator — the cognitive cycle ticker.
 *
 * Tightly small. Owns no domain logic. Does five things per tick:
 *
 *   1. Check budget. If exhausted, exit.
 *   2. Pick the highest-priority pending goal.
 *   3. Ask the attention scheduler for the best specialist.
 *   4. Run it; commit its writes/conflicts/new-goals atomically; charge cost.
 *   5. Mark goals satisfied/abandoned.
 *
 * Domain-specific behavior (which goals to seed, what specialists to
 * register, when to refuse-and-explain) lives outside this class. The
 * caller wires those up.
 *
 * @brain DLPFC + thalamus + meta-cognition: tick scheduling
 */

import type { ConflictRecord } from "@retune/types";
import type { TickPersistence } from "../persistence/types";
import type { SpecialistRegistry } from "../specialists/registry";
import type { AttentionScheduler } from "./attention-scheduler";
import { AuditTrail } from "./audit-trail";
import type { BlackboardStore } from "./blackboard";
import { type BudgetController, BudgetExhaustedError } from "./budget-controller";
import type { ConflictStagingQueue } from "./conflict-staging";
import type { GoalStack } from "./goal-stack";
import type { TraceEvent } from "./types";
import type { Specialist, SpecialistContext } from "./types";

export interface OrchestratorDeps {
  blackboard: BlackboardStore;
  goal_stack: GoalStack;
  registry: SpecialistRegistry;
  scheduler: AttentionScheduler;
  audit_trail: AuditTrail;
  budget: BudgetController;
  /**
   * Optional durable store. When provided, the orchestrator persists each
   * tick atomically and writes the terminal generation row on exit.
   * See `packages/agent/src/persistence/`.
   */
  persistence?: TickPersistence;
  /**
   * Optional listener-conflict staging queue (technical-2.0 §9). When
   * provided, the orchestrator drains it at the top of each tick and
   * commits the staged conflicts as part of a synthetic
   * `listener_drainer` audit entry. Without this wiring, fairness /
   * voice-drift / well-being concerns evaporate when the workflow
   * completes (v1.0 issue #7).
   */
  conflict_staging?: ConflictStagingQueue;
  /**
   * Extended persistence with GDPR packet and conflict row writers.
   * When the underlying persistence implements these, the orchestrator
   * persists conflicts to queryable rows and writes the GDPR audit
   * packet at generation completion.
   */
  extended_persistence?: {
    record_gdpr_packet(input: {
      generation_id: string;
      user_id: string;
      verdict: string;
      packet: Record<string, unknown>;
    }): Promise<void>;
    record_conflict(input: {
      generation_id: string;
      conflict: {
        id: string;
        monitor: string;
        severity: string;
        payload: Record<string, unknown>;
        resolved_by?: string | null;
        resolved_at?: string | null;
      };
    }): Promise<void>;
  };
}

export interface OrchestratorRunOptions {
  /** Hard upper bound on tick count to prevent runaway loops. Default 256. */
  max_ticks?: number;
  /** Fired after every tick — for SSE streaming, dashboards, etc. */
  on_trace?: (event: TraceEvent) => void;
  /**
   * Cooperative cancellation in addition to budget exhaustion. Useful
   * when the API request is cancelled by the client mid-generation.
   */
  external_signal?: AbortSignal;
  /**
   * When persistence is wired, provides the generation's parent refs so
   * `ensure_generation()` can upsert the row before the first tick.
   * Idempotent — calling on a resumed generation is a no-op.
   * Ignored when `deps.persistence` is undefined.
   */
  generation_context?: {
    user_id: string;
    jd_id: string | null;
    ontology_version: string;
  };
}

export type OrchestratorTermination =
  | "no_open_work"
  | "no_competent_specialist"
  | "no_affordable_specialist"
  | "budget_exhausted"
  | "external_abort"
  | "max_ticks";

export interface OrchestratorResult {
  termination: OrchestratorTermination;
  ticks_executed: number;
  total_cost_usd: number;
  total_latency_ms: number;
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async run(options: OrchestratorRunOptions = {}): Promise<OrchestratorResult> {
    const max_ticks = options.max_ticks ?? 256;
    const t_start = Date.now();
    let ticks = 0;
    let termination: OrchestratorTermination = "no_open_work";

    // Pre-run: ensure the generation row exists in the durable store.
    if (this.deps.persistence && options.generation_context) {
      const snap = this.deps.blackboard.snapshot();
      await this.deps.persistence.ensure_generation({
        generation_id: snap.generation_id,
        user_id: options.generation_context.user_id,
        jd_id: options.generation_context.jd_id,
        ontology_version: options.generation_context.ontology_version,
        initial_blackboard: snap,
        initial_goals: this.deps.goal_stack.snapshot(),
      });
    }

    while (ticks < max_ticks) {
      // External cancellation (e.g. client closed connection).
      if (options.external_signal?.aborted) {
        termination = "external_abort";
        break;
      }

      // ── Drain listener-staged conflicts (technical-2.0 §9.3) ──
      // Trigger-bus listeners cannot mutate the blackboard directly. They
      // push concerns into ConflictStagingQueue; we drain them here and
      // commit them via a synthetic audit entry so they get persisted as
      // part of the regular tick atomically with anything else this tick
      // produces. Without this, listener concerns evaporate at workflow
      // completion (v1.0 issue #7).
      if (this.deps.conflict_staging) {
        const staged = this.deps.conflict_staging.drain();
        if (staged.length > 0) {
          const conflicts: ConflictRecord[] = staged.map((s) => ({
            id: s.id,
            monitor: s.monitor,
            severity: s.severity,
            payload: s.payload,
            resolved_by: null,
            resolution_log: null,
            created_at: s.staged_at,
            resolved_at: null,
          }));
          const drain_audit = this.deps.audit_trail.append({
            specialist: "listener_drainer",
            micro_stage: "drain_staged_conflicts",
            inputs_hash: AuditTrail.hash({ n: staged.length }),
            output_hash: AuditTrail.hash({ ids: staged.map((c) => c.id) }),
            justification: `drained ${staged.length} conflict(s) from listener staging queue`,
            latency_ms: 0,
            cost_usd: 0,
            writes: [],
          });
          await this.deps.blackboard.commit({
            by_specialist: "listener_drainer",
            writes: [],
            conflicts,
            audit_entry: drain_audit,
          });

          if (this.deps.extended_persistence) {
            const gen_id = this.deps.blackboard.snapshot().generation_id;
            for (const c of conflicts) {
              await this.deps.extended_persistence.record_conflict({
                generation_id: gen_id,
                conflict: {
                  id: c.id,
                  monitor: c.monitor,
                  severity: c.severity,
                  payload: c.payload as Record<string, unknown>,
                  resolved_by: c.resolved_by,
                  resolved_at: c.resolved_at,
                },
              });
            }
          }
        }
      }

      // Budget kill — re-throws if hard ceiling already crossed.
      try {
        this.deps.budget.assert_alive();
      } catch (err) {
        if (err instanceof BudgetExhaustedError) {
          termination = "budget_exhausted";
          break;
        }
        throw err;
      }

      // Pick a goal.
      const goal = this.deps.goal_stack.peek_next();
      if (!goal) {
        termination = "no_open_work";
        break;
      }

      // Pick a specialist.
      const candidates = this.deps.registry.candidates_for(goal.kind);
      if (candidates.length === 0) {
        // No specialist competent for this goal kind — abandon and continue.
        this.deps.goal_stack.mark_abandoned(goal.id);
        ticks++;
        termination = "no_competent_specialist";
        continue;
      }
      const pick = this.deps.scheduler.pick({
        goal,
        candidates,
        budget_remaining_usd: this.deps.budget.remaining(),
      });
      if (!pick) {
        // Nothing affordable — bail out so caller can refuse-and-explain.
        termination = "no_affordable_specialist";
        break;
      }
      const specialist = pick.specialist;

      // Run it.
      this.deps.goal_stack.mark_in_progress(goal.id);
      const result = await this.invoke_specialist(specialist, goal, options.external_signal);

      // Atomic commit: audit entry first (assigns seq), then blackboard,
      // then the goal stack (so blackboard + goal stack stay consistent).
      const audit_entry = this.deps.audit_trail.append(result.audit);
      await this.deps.blackboard.commit({
        by_specialist: specialist.id,
        writes: result.writes,
        conflicts: result.conflicts,
        new_goals: result.new_goals,
        audit_entry,
      });
      if (result.new_goals) {
        for (const ng of result.new_goals) this.deps.goal_stack.push(ng);
      }

      // Persist conflicts to queryable rows.
      if (this.deps.extended_persistence && result.conflicts && result.conflicts.length > 0) {
        const gen_id = this.deps.blackboard.snapshot().generation_id;
        for (const c of result.conflicts) {
          await this.deps.extended_persistence.record_conflict({
            generation_id: gen_id,
            conflict: {
              id: c.id,
              monitor: c.monitor,
              severity: c.severity,
              payload: c.payload as Record<string, unknown>,
              resolved_by: c.resolved_by,
              resolved_at: c.resolved_at,
            },
          });
        }
      }

      // Charge cost. May trip the hard kill — caught next tick at assert_alive.
      this.deps.budget.charge(specialist.id, result.audit.cost_usd);

      // Goal bookkeeping.
      const satisfied = result.satisfied_goal_ids ?? [];
      for (const id of satisfied) {
        this.deps.goal_stack.mark_satisfied(id, specialist.id);
      }
      // If the specialist neither satisfied this goal nor pushed subgoals
      // and produced no writes, treat the goal as abandoned to prevent
      // an infinite loop.
      const did_anything =
        satisfied.includes(goal.id) ||
        (result.new_goals?.length ?? 0) > 0 ||
        result.writes.length > 0;
      const goal_state = this.deps.goal_stack.get(goal.id);
      if (!did_anything && goal_state?.status === "in_progress") {
        this.deps.goal_stack.mark_abandoned(goal.id);
      }

      // Persist the tick atomically (snapshot + audit_entry + goals).
      // This happens AFTER blackboard.commit() so the snapshot reflects
      // the committed state, and BEFORE on_trace() so a subscriber
      // watching the DB and a subscriber watching the SSE stream see
      // events in the same order.
      if (this.deps.persistence) {
        const snap = this.deps.blackboard.snapshot();
        await this.deps.persistence.persist_tick({
          generation_id: snap.generation_id,
          seq: audit_entry.seq,
          snapshot: snap,
          audit_entry,
          goals: this.deps.goal_stack.snapshot(),
          budget: this.deps.budget.snapshot(),
        });
      }

      // Surface the trace event.
      if (options.on_trace) {
        options.on_trace({
          seq: audit_entry.seq,
          timestamp: audit_entry.timestamp,
          specialist: specialist.id,
          brain_region: specialist.brain_region,
          micro_stage: audit_entry.micro_stage,
          justification: audit_entry.justification,
          cost_usd: audit_entry.cost_usd,
          latency_ms: audit_entry.latency_ms,
          writes_count: result.writes.length,
          conflicts_count: result.conflicts?.length ?? 0,
        });
      }

      ticks++;
    }

    if (ticks >= max_ticks) termination = "max_ticks";

    const total_cost_usd = this.deps.audit_trail.total_cost_usd();
    const total_latency_ms = Date.now() - t_start;

    // Post-run: mark the generation complete.
    if (this.deps.persistence) {
      const snap = this.deps.blackboard.snapshot();
      await this.deps.persistence.complete_generation({
        generation_id: snap.generation_id,
        termination,
        ticks_executed: ticks,
        total_cost_usd,
        total_latency_ms,
      });

      // Persist the GDPR audit packet if the gate produced one.
      if (this.deps.extended_persistence && options.generation_context) {
        const gdpr = (snap as Record<string, unknown>).hypotheses as
          | { gdpr_audit_packet?: Record<string, unknown>; ship_decision?: { verdict?: string } }
          | undefined;
        if (gdpr?.gdpr_audit_packet) {
          await this.deps.extended_persistence.record_gdpr_packet({
            generation_id: snap.generation_id,
            user_id: options.generation_context.user_id,
            verdict: gdpr.ship_decision?.verdict ?? "unknown",
            packet: gdpr.gdpr_audit_packet,
          });
        }
      }
    }

    return {
      termination,
      ticks_executed: ticks,
      total_cost_usd,
      total_latency_ms,
    };
  }

  private async invoke_specialist(
    specialist: Specialist,
    goal: import("@retune/types").Goal,
    external_signal: AbortSignal | undefined,
  ): Promise<import("./types").SpecialistResult> {
    const composite = compose_signals(this.deps.budget.signal, external_signal);
    const ctx: SpecialistContext = {
      blackboard: this.deps.blackboard.snapshot(),
      tick: this.deps.audit_trail.list().length,
      trace_id: `${this.deps.blackboard.snapshot().generation_id}-${this.deps.audit_trail.list().length}`,
      signal: composite,
    };
    return await specialist.run(ctx, goal);
  }
}

function compose_signals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const real = signals.filter((s): s is AbortSignal => s !== undefined);
  if (real.length === 0) return new AbortController().signal;
  if (real.length === 1) {
    const s0 = real[0];
    if (s0) return s0;
  }
  return AbortSignal.any(real);
}
