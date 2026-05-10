/**
 * Temporal namespace — durable workflows + activities for the cognitive cycle.
 *
 * @brain hippocampal consolidation across process boundaries
 */

export { COGNITIVE_TASK_QUEUE } from "./task-queue";
export { build_worker, type BuildWorkerInput } from "./worker";
export { build_temporal_client, type BuildClientInput } from "./client";
export {
  make_activities,
  build_fresh_substrate,
  build_resumed_substrate,
  type SubstrateDeps,
  type ActivityFns,
  type GenerationOutcome,
  type GenerationSeed,
  type RecordAnswerInput,
  type RecordAnswerResult,
  type ResumeInput,
} from "./activities";
export {
  getStatusQuery,
  runGenerationWorkflow,
  userAnsweredSignal,
  type RunGenerationWorkflowResult,
  type StatusSnapshot,
  type UserAnsweredPayload,
  type WorkflowStatus,
} from "./workflows";
