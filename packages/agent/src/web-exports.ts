/**
 * Web-safe exports for @retune/agent — used by apps/web (Next.js).
 *
 * Excludes @temporalio/worker and its transitive native binary deps
 * (webpack, swc, esbuild) which Turbopack cannot bundle.
 * The Temporal worker runs in apps/worker as a separate process.
 */

export { assembleSystemPrompt } from "./prompt-assembler";
export { getProvider, getModels } from "./lib/provider";
export type { ToolDefinition, MessageParams, SystemBlock, ContentBlock, AIResponse } from "./lib/provider";
export * from "./types";
export * from "./pipeline/schemas";

// Workbench — safe (no native deps)
export {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  BudgetExhaustedError,
  GoalStack,
  Orchestrator,
  TriggerBus,
  ConflictStagingQueue,
  path_matches,
  read_path,
  write_path,
  type OrchestratorDeps,
  type OrchestratorResult,
  type OrchestratorRunOptions,
  type OrchestratorTermination,
  type PickInput,
  type PickOutput,
  type Specialist,
  type SpecialistContext,
  type SpecialistResult,
  type EventListener,
  type TraceEvent,
  type StagedConflict,
} from "./workbench";

// Specialists — safe (no native deps)
export {
  ActiveQuestionHandler,
  type ActiveQuestionSink,
  type AndOrGroup,
  CriticEnsemble,
  type DriftConcernHandler,
  type DriftMeasurement,
  EvidenceSolver,
  type EvidenceAssignment,
  type BulletPlan,
  type SolverSolution,
  type SolverStats,
  type FairnessConcern,
  type FairnessConcernHandler,
  FairnessMonitor,
  GapMapper,
  type GapMap,
  type GapMapEntry,
  type GapMapSummary,
  NarrativeArcProposer,
  OutcomePredictor,
  type PredictionResult,
  RefuseOrShipGate,
  type ShipDecision,
  type ShipVerdict,
  type GdprAuditPacket,
  type GdprAuditEntry,
  SequentialBulletComposer,
  SpecialistRegistry,
  TheoryOfMindSpecialist,
  type RecruiterBeliefState,
  type KnowledgeGap,
  VoiceDriftMonitor,
  WellBeingMonitor,
  type WellBeingConcern,
  type WellBeingConcernHandler,
} from "./specialists";

// Persistence — safe
export {
  NullPersistence,
  PostgresPersistence,
  rehydrate_substrate,
  type CompleteGenerationInput,
  type EnsureGenerationInput,
  type GenerationReplayLoader,
  type PersistTickInput,
  type RehydratedSubstrate,
  type ReplayedGeneration,
  type TickPersistence,
} from "./persistence";

// Temporal task queue constant — safe (no imports)
export { COGNITIVE_TASK_QUEUE } from "./temporal/task-queue";

// Temporal workflows — safe (only @temporalio/client for status queries)
export {
  getStatusQuery,
  runGenerationWorkflow,
  userAnsweredSignal,
  type RunGenerationWorkflowResult,
  type StatusSnapshot,
  type UserAnsweredPayload,
  type WorkflowStatus,
} from "./temporal/workflows";

// Comprehension — safe (uses ML client over network, no native bundling)
export {
  BoilerplateStripper,
  CompanySchemaRetriever,
  CredibilityScanner,
  CULTURAL_VECTOR_DIM,
  CulturalCalibrator,
  DiscourseClassifier,
  type ExtractedSpansSink,
  HONESTY_CLAIM_KINDS,
  type HonestyCalibrationStore,
  HonestyCalibrator,
  JdSpanExtractor,
  STRIPPED_IMPORTANCE,
  TitleSchemaRetriever,
  VOICE_FINGERPRINT_DIM,
  VoiceFingerprintExtractor,
  type VoiceFingerprintSink,
} from "./comprehension";

// ML client — safe
export {
  type GrpcTransportConfig,
  GrpcTransport,
  type HttpTransportConfig,
  HttpTransport,
  MLClient,
  type MLClientConfig,
  MLClientError,
  type MLErrorKind,
  type MLTransport,
} from "./ml-client";

// Memory — safe
export {
  OntologyResolver,
  SEED_COMPANIES,
  SEED_ROLES,
  NightlyConsolidator,
  type ConsolidationStore,
  type ConsolidationReport,
  type HonestyUpdate,
  type VoiceCentroidUpdate,
  type OutcomeRecord,
  type HonestyCalibrationRow,
  type VoiceCentroidRow,
  type GenerationRecord,
  type CaseBaseEntry,
  type CompanyNode,
  type CompanyResolution,
  type RoleNode,
  type RoleResolution,
} from "./memory";

// Error handling + caching — safe
export {
  Bulkhead,
  CircuitBreaker,
  CircuitBreakerState,
  RequestMonitor,
  executeWithRetry,
  executeWithTimeout,
  globalBulkhead,
  globalCircuitBreaker,
  globalMonitor,
  type CircuitBreakerConfig,
  type RequestMetrics,
  type RetryConfig,
} from "./error-handling/error-recovery";

export { getUsageStats } from "./lib/anthropic";

// Caching utilities — safe
export {
  buildCachedQualityGatePrompt,
  buildCachedResumeWriterPrompt,
  buildCachedSystemPrompt,
  calculateCachedCost,
  createCachedSystemPrompt,
  extractCacheStats,
  type CacheStats,
  type CachedSystemPrompt,
} from "./caching/prompt-cache";

// Voice authentication — safe (pure TS, no network/native deps)
export {
  authenticateVoice,
  type VoiceAuthenticityResult,
} from "./pipeline/enforcement/voice-authenticator";

// Enhanced agent wrapper — safe
export {
  buildCachedSystemPromptForAgent,
  executeEnhancedAgent,
  getAgentExecutionStats,
  resetAgentExecutionStats,
  type AgentExecutionStats,
  type EnhancedAgentOptions,
} from "./pipeline/enhanced-agent-wrapper";

// Concurrency — safe
export { ConcurrencyManager, concurrencyManager } from "./concurrency/concurrency-manager";
