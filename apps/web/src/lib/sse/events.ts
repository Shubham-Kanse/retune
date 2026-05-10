/**
 * Typed SSE events for the cognitive pipeline stream.
 *
 * These map 1:1 to the events emitted by the orchestrator and
 * /api/generate/[id]/stream route.
 */

export type PipelineEventType =
  | "tick_start"
  | "tick_end"
  | "specialist_picked"
  | "goal_emitted"
  | "goal_satisfied"
  | "goal_abandoned"
  | "blackboard_write"
  | "conflict_emitted"
  | "conflict_resolved"
  | "listener_concern"
  | "cost_charge"
  | "outcome_predicted"
  | "narrative_paragraph"
  | "emotional_state_changed"
  | "step_start"
  | "step_complete"
  | "ats_score"
  | "agent_log"
  | "content_chunk"
  | "gap_detected"
  | "user_action_required"
  | "trace"
  | "error"
  | "complete"
  | "done"
  | "external_abort"
  | "heartbeat"
  | "ping";

export interface PipelineEvent<T = Record<string, unknown>> {
  id: string;
  seq: number;
  type: PipelineEventType;
  timestamp: number;
  data: T;
}

export interface TickStartData {
  tick: number;
  goal_id: string;
  goal_kind: string;
}

export interface TickEndData {
  tick: number;
  specialist: string;
  latency_ms: number;
  cost_usd: number;
  writes_count: number;
}

export interface SpecialistPickedData {
  specialist_id: string;
  display_name: string;
  goal_kind: string;
  estimated_cost_usd: number;
}

export interface GoalEmittedData {
  goal_id: string;
  kind: string;
  priority: number;
  emitted_by: string;
}

export interface GoalSatisfiedData {
  goal_id: string;
  kind: string;
  satisfied_by: string;
}

export interface CostChargeData {
  specialist: string;
  amount_usd: number;
  total_spent_usd: number;
  ceiling_usd: number;
}

export interface OutcomePredictedData {
  point: number;
  lower: number;
  upper: number;
  blocking_factors: string[];
}

export interface NarrativeParagraphData {
  layer: string;
  text: string;
}

export interface EmotionalStateData {
  primary_emotion: string;
  valence: number;
  arousal: number;
  dominance: number;
  confidence: number;
}

export interface StepStartData {
  step: string;
  label: string;
}

export interface StepCompleteData {
  step: string;
  durationMs: number;
}

export interface AtsScoreData {
  score: number;
  required_coverage: number;
  preferred_coverage: number;
  missing_keywords: string[];
}

export interface ConflictEmittedData {
  id: string;
  monitor: string;
  severity: string;
  message: string;
}

export interface ErrorData {
  message: string;
  retryable: boolean;
  code?: string;
}

export interface CompleteData {
  status: string;
  ats_score: number | null;
  interview_ready_score: number | null;
  submission_confidence: number | null;
  duration_ms: number;
}
