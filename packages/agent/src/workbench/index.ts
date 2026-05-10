/**
 * Cognitive workbench — public surface.
 *
 * The workbench is the runtime substrate the cognitive cycle runs on.
 * It owns:
 *
 *   - the blackboard (working memory)
 *   - the goal stack (active goals + completed/abandoned)
 *   - the trigger bus (pub/sub for blackboard writes)
 *   - the audit trail (replayable history with cost attribution)
 *   - the budget controller (cost runaway hard kill)
 *
 * The orchestrator (next commit) sits above all of these; specialists
 * sit alongside them, subscribed via the bus.
 *
 * @brain DLPFC + thalamus + entorhinal
 */

export { BlackboardStore, read_path, write_path } from "./blackboard";
export { GoalStack } from "./goal-stack";
export { TriggerBus, path_matches } from "./trigger-bus";
export { AuditTrail } from "./audit-trail";
export { BudgetController, BudgetExhaustedError } from "./budget-controller";
export { seed_initial_goals, type SeedGoalsPayload } from "./seed-goals";
export { AttentionScheduler } from "./attention-scheduler";
export type { PickInput, PickOutput } from "./attention-scheduler";
export { Orchestrator } from "./orchestrator";
export type {
  OrchestratorDeps,
  OrchestratorResult,
  OrchestratorRunOptions,
  OrchestratorTermination,
} from "./orchestrator";
export type {
  Specialist,
  SpecialistContext,
  SpecialistResult,
  EventListener,
  TraceEvent,
} from "./types";
export { ConflictStagingQueue, type StagedConflict } from "./conflict-staging";
