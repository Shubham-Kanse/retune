/**
 * Persistence namespace — durable substrate for the cognitive workbench.
 *
 * @brain hippocampus + entorhinal consolidation: episodic → neocortex
 */

export type {
  CompleteGenerationInput,
  EnsureGenerationInput,
  GenerationReplayLoader,
  PersistTickInput,
  ReplayedGeneration,
  TickPersistence,
} from "./types";
export { NullPersistence } from "./null-persistence";
export { PostgresPersistence } from "./postgres-persistence";
export { rehydrate_substrate, type RehydratedSubstrate } from "./replay";
