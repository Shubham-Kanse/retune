/**
 * Rehydration helper for resume-from-crash.
 *
 * Takes a `ReplayedGeneration` (from `PostgresPersistence.load()`) plus
 * the ambient dependencies (registry, scheduler, trigger bus, etc.) and
 * constructs a fully-wired Orchestrator whose in-memory state exactly
 * mirrors the persisted one.
 *
 * Invariants:
 *   - `audit_trail.seq` continues past the last persisted seq
 *   - `blackboard` starts at the loaded snapshot (including audit_trail
 *     array, goals array, cost_budget)
 *   - `goal_stack` is hydrated from the persisted goals table
 *   - `budget` starts at the persisted spend, with the same ceilings
 *
 * The caller is responsible for:
 *   - registering specialists on the fresh `SpecialistRegistry`
 *   - re-subscribing listeners to the `TriggerBus`
 *   - passing the loaded `generation_id` when streaming traces
 */

import type { SpecialistRegistry } from "../specialists/registry";
import type { AttentionScheduler } from "../workbench/attention-scheduler";
import { AuditTrail } from "../workbench/audit-trail";
import { BlackboardStore } from "../workbench/blackboard";
import { BudgetController } from "../workbench/budget-controller";
import { GoalStack } from "../workbench/goal-stack";
import { Orchestrator } from "../workbench/orchestrator";
import { TriggerBus } from "../workbench/trigger-bus";
import type { TickPersistence } from "./types";
import type { ReplayedGeneration } from "./types";

export interface RehydratedSubstrate {
  orchestrator: Orchestrator;
  blackboard: BlackboardStore;
  goal_stack: GoalStack;
  audit_trail: AuditTrail;
  budget: BudgetController;
  trigger_bus: TriggerBus;
  /** The starting tick seq (= replayed.latest_seq + 1). */
  next_seq: number;
}

export function rehydrate_substrate(input: {
  replayed: ReplayedGeneration;
  registry: SpecialistRegistry;
  scheduler: AttentionScheduler;
  persistence: TickPersistence;
}): RehydratedSubstrate {
  const trigger_bus = new TriggerBus();
  const blackboard = new BlackboardStore(input.replayed.blackboard, trigger_bus);

  const goal_stack = new GoalStack();
  goal_stack.hydrate([...input.replayed.goals]);

  const audit_trail = new AuditTrail();
  audit_trail.hydrate(input.replayed.audit_entries);

  const budget = new BudgetController(input.replayed.budget);

  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack,
    registry: input.registry,
    scheduler: input.scheduler,
    audit_trail,
    budget,
    persistence: input.persistence,
  });

  return {
    orchestrator,
    blackboard,
    goal_stack,
    audit_trail,
    budget,
    trigger_bus,
    next_seq: input.replayed.latest_seq + 1,
  };
}
