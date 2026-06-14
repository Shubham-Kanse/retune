export { run_cognitive_pipeline, type CognitiveRunInput } from "./workbench-runner";
export { assembleSystemPrompt } from "./prompt-assembler";
export { getProvider, getModels } from "./lib/provider";
export {
  withProviderKeys,
  activeKeyOverride,
  byokActive,
  byokEncryptionConfigured,
  encryptApiKey,
  decryptApiKey,
  keyLast4,
  maskKey,
  type ProviderKeyOverrides,
} from "./lib/byok";
export { loadProviderKeyOverrides } from "./lib/byok-store";
export * from "./types";
export * from "./pipeline/schemas";
export { authenticateVoice } from "./pipeline/enforcement/voice-authenticator";
export * from "./sota-exports";

// Charter 09 Epic 01 — Prompt registry (entry points + bootstrap).
import { bootstrapSpecialistPrompts } from "./prompts/bootstrap";
export {
  register as registerPrompt,
  getPrompt,
  renderPrompt,
  listPrompts,
} from "./prompts/registry";
export { bootstrapSpecialistPrompts } from "./prompts/bootstrap";
bootstrapSpecialistPrompts();

// Charter 26 Epic 01 — Refusal taxonomy.
export {
  type RefusalReason,
  type NextAction,
  type RefusalMetadata,
  ALL_REFUSAL_REASONS,
  getRefusalMetadata,
  coerceHistoricalRefusal,
} from "./specialists/refusal-taxonomy";

// 003 SOTA generation module (additive, off the legacy pipeline).
export * from "./generation-sota";

// Temporal node/worker specific exports
export {
  build_fresh_substrate,
  build_resumed_substrate,
  build_temporal_client,
  build_worker,
  make_activities,
} from "./temporal";
