/**
 * No-op persistence adapter.
 *
 * Used by unit tests and by the in-memory API runtime when persistence
 * is disabled. Keeping this as a first-class type (rather than allowing
 * `persistence: undefined` in orchestrator deps) forces callers to make
 * the durability choice explicit.
 */

import type {
  CompleteGenerationInput,
  EnsureGenerationInput,
  PersistTickInput,
  TickPersistence,
} from "./types";

export class NullPersistence implements TickPersistence {
  async ensure_generation(_input: EnsureGenerationInput): Promise<void> {
    // no-op
  }

  async persist_tick(_input: PersistTickInput): Promise<void> {
    // no-op
  }

  async complete_generation(_input: CompleteGenerationInput): Promise<void> {
    // no-op
  }
}
