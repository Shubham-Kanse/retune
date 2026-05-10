/**
 * LaunchCriteriaGate — PRD §1.6 acceptance criteria checker.
 *
 * Every criterion must pass before the system is marked launch-ready.
 * This gate runs as part of the CI eval pipeline and blocks merges to main
 * if any criterion regresses.
 *
 * PRD §1.6 success criteria (12 months post-launch targets):
 *   ≥ 35% callback rate on user applications (beat $300/hr coach baseline of 28% by 7pp)
 *   ≥ 18% offer rate among applications that reach phone-screen
 *   Median time-to-first-callback ≤ 9 days
 *   ≥ 92% of generated bullets pass automated provenance verification
 *   ≤ 2.5% of generations escalate to frontier API after month 4
 *   $0.005 per-generation steady-state cost
 *   NPS ≥ 60 from paid users
 *   Zero incidents: data breach, fairness violation, fabrication causing harm
 *
 * For the eval harness (pre-launch), we proxy the production metrics:
 *   callback_rate       → expert_panel coach-score ≥ 70 on ≥ 35% of cases
 *   provenance_rate     → ≥ 92% of bullets grounded in evidence
 *   coach_panel_score   → trimmed-mean ≥ 70 across the canonical set
 *   fabrication_rate    → 0% of ships contain fabrication conflicts
 *   ats_coverage        → ≥ 75% mean across all ships
 *   interview_ready     → ≥ 65 mean interview-ready score
 *   refuse_rate         → ≤ 15% refusals (refuse = quality failure)
 */

export interface CriterionResult {
  criterion_id: string;
  description: string;
  target: number;
  actual: number;
  unit: string;
  passed: boolean;
  margin: number;
}

export interface LaunchGateResult {
  passed: boolean;
  criteria: CriterionResult[];
  blocking_criteria: string[];
  warning_criteria: string[];
  summary: string;
}

export interface EvalSummary {
  total_cases: number;
  ships: number;
  revises: number;
  refuses: number;
  mean_coach_panel_score: number;
  mean_provenance_rate: number;
  mean_ats_coverage_pct: number;
  mean_interview_ready_score: number;
  mean_submission_confidence: number;
  cases_with_callback_signal: number;
  cases_with_fabrication: number;
  p95_latency_ms?: number;
}

// ──────────── Criterion definitions ────────────

interface CriterionDef {
  id: string;
  description: string;
  target: number;
  unit: string;
  direction: "gte" | "lte";
  extract: (s: EvalSummary) => number;
}

const CRITERIA: readonly CriterionDef[] = [
  {
    id: "callback_proxy_rate",
    description: "≥35% of canonical cases score ≥70 on coach panel (callback proxy)",
    target: 35,
    unit: "%",
    direction: "gte",
    extract: (s) => (s.total_cases > 0 ? (s.cases_with_callback_signal / s.total_cases) * 100 : 0),
  },
  {
    id: "provenance_rate",
    description: "≥92% of bullets pass automated provenance verification",
    target: 92,
    unit: "%",
    direction: "gte",
    extract: (s) => s.mean_provenance_rate * 100,
  },
  {
    id: "coach_panel_score",
    description: "Mean coach-panel trimmed-mean ≥70 across canonical set",
    target: 70,
    unit: "score/100",
    direction: "gte",
    extract: (s) => s.mean_coach_panel_score,
  },
  {
    id: "zero_fabrication",
    description: "0 shipped packages contain unresolved fabrication conflicts",
    target: 0,
    unit: "cases",
    direction: "lte",
    extract: (s) => s.cases_with_fabrication,
  },
  {
    id: "ats_coverage",
    description: "Mean ATS keyword coverage ≥75% across shipped packages",
    target: 75,
    unit: "%",
    direction: "gte",
    extract: (s) => s.mean_ats_coverage_pct,
  },
  {
    id: "interview_ready_score",
    description: "Mean interview-ready score ≥65/100",
    target: 65,
    unit: "score/100",
    direction: "gte",
    extract: (s) => s.mean_interview_ready_score,
  },
  {
    id: "refuse_rate",
    description: "Refuse rate ≤15% (excessive refusals = quality failure)",
    target: 15,
    unit: "%",
    direction: "lte",
    extract: (s) => (s.total_cases > 0 ? (s.refuses / s.total_cases) * 100 : 0),
  },
  {
    id: "submission_confidence",
    description: "Mean submission confidence ≥0.50 on shipped packages",
    target: 50,
    unit: "%",
    direction: "gte",
    extract: (s) => s.mean_submission_confidence * 100,
  },
];

// ──────────── Gate ────────────

export function evaluate_launch_criteria(summary: EvalSummary): LaunchGateResult {
  const criteria: CriterionResult[] = [];
  const blocking: string[] = [];
  const warnings: string[] = [];

  for (const def of CRITERIA) {
    const actual = def.extract(summary);
    const passed = def.direction === "gte" ? actual >= def.target : actual <= def.target;
    const margin = def.direction === "gte" ? actual - def.target : def.target - actual;

    const result: CriterionResult = {
      criterion_id: def.id,
      description: def.description,
      target: def.target,
      actual: Math.round(actual * 100) / 100,
      unit: def.unit,
      passed,
      margin: Math.round(margin * 100) / 100,
    };

    criteria.push(result);

    if (!passed) {
      blocking.push(
        `${def.id}: actual=${actual.toFixed(2)}${def.unit} vs target=${def.target}${def.unit} (gap=${Math.abs(margin).toFixed(2)})`,
      );
    } else if (margin < 5 && def.unit !== "cases") {
      warnings.push(`${def.id}: passing but tight margin (${margin.toFixed(2)}${def.unit})`);
    }
  }

  const all_passed = blocking.length === 0;
  const n_pass = criteria.filter((c) => c.passed).length;
  const summary_text = all_passed
    ? `✅ LAUNCH READY — all ${n_pass}/${criteria.length} criteria pass. ${warnings.length > 0 ? `${warnings.length} tight-margin warning(s).` : ""}`
    : `❌ LAUNCH BLOCKED — ${blocking.length}/${criteria.length} criteria failing. Must fix: ${blocking.slice(0, 2).join("; ")}${blocking.length > 2 ? ` +${blocking.length - 2} more` : ""}`;

  return {
    passed: all_passed,
    criteria,
    blocking_criteria: blocking,
    warning_criteria: warnings,
    summary: summary_text,
  };
}

/**
 * Compute EvalSummary from per-case results.
 */
export function aggregate_eval_results(
  case_results: Array<{
    verdict: "ship" | "revise" | "refuse";
    coach_panel_score: number;
    provenance_rate: number;
    ats_coverage_pct: number;
    interview_ready_score: number;
    submission_confidence: number;
    has_fabrication: boolean;
  }>,
): EvalSummary {
  const n = case_results.length;
  if (n === 0) {
    return {
      total_cases: 0,
      ships: 0,
      revises: 0,
      refuses: 0,
      mean_coach_panel_score: 0,
      mean_provenance_rate: 0,
      mean_ats_coverage_pct: 0,
      mean_interview_ready_score: 0,
      mean_submission_confidence: 0,
      cases_with_callback_signal: 0,
      cases_with_fabrication: 0,
    };
  }

  const ships = case_results.filter((r) => r.verdict === "ship");
  const revises = case_results.filter((r) => r.verdict === "revise");
  const refuses = case_results.filter((r) => r.verdict === "refuse");

  const mean = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // callback signal: cases where coach panel score ≥ 70
  const callback_signal = case_results.filter((r) => r.coach_panel_score >= 70);

  return {
    total_cases: n,
    ships: ships.length,
    revises: revises.length,
    refuses: refuses.length,
    mean_coach_panel_score: mean(case_results.map((r) => r.coach_panel_score)),
    mean_provenance_rate: mean(case_results.map((r) => r.provenance_rate)),
    mean_ats_coverage_pct: mean(
      ships.length > 0
        ? ships.map((r) => r.ats_coverage_pct)
        : case_results.map((r) => r.ats_coverage_pct),
    ),
    mean_interview_ready_score: mean(case_results.map((r) => r.interview_ready_score)),
    mean_submission_confidence: mean(case_results.map((r) => r.submission_confidence)),
    cases_with_callback_signal: callback_signal.length,
    cases_with_fabrication: case_results.filter((r) => r.has_fabrication).length,
  };
}
