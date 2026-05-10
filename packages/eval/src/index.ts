export {
  load_canonical,
  CanonicalCaseSchema,
  ExpertPackageSchema,
  ExpertBulletSchema,
  ExpectedOutcomeSchema,
} from "./canonical/loader";
export { FixtureBackedProvider, type FixtureMode } from "./fixture-provider";
export type { CanonicalCase } from "./canonical/loader";
export {
  span_f1,
  voice_drift_cosine,
  provenance_rate,
  score_coach_panel,
  evaluate_launch_criteria,
  aggregate_eval_results,
} from "./metrics";
export type {
  LabeledSpan,
  SpanF1Result,
  ProvenanceResult,
  BulletWithEvidence,
  CoachPanelResult,
  CoachScore,
  PackageForScoring,
  LaunchGateResult,
  CriterionResult,
  EvalSummary,
} from "./metrics";
