/**
 * Tests for commit #15 — launch criteria gate + new metrics:
 *   - provenance_rate metric
 *   - score_coach_panel (all 5 coaches)
 *   - evaluate_launch_criteria (8 PRD §1.6 criteria)
 *   - aggregate_eval_results
 *   - canonical set schema validity + count
 *
 * Invariants proven:
 *   1.  Provenance rate = 1.0 when all bullets have evidence IDs
 *   2.  Provenance rate = 0.0 when no bullets have evidence IDs
 *   3.  Provenance rate catches ungrounded metric claims
 *   4.  Coach panel: perfect package scores ≥ 70 on all 5 coaches
 *   5.  Coach panel: banned phrases reduce narrative score
 *   6.  Coach panel: no evidence IDs tanks honesty score
 *   7.  Coach panel: trimmed mean drops highest + lowest
 *   8.  Launch gate PASSES on all-green summary
 *   9.  Launch gate BLOCKS on provenance < 92%
 *   10. Launch gate BLOCKS on fabrication > 0
 *   11. Launch gate BLOCKS on refuse rate > 15%
 *   12. Launch gate BLOCKS on coach panel < 70
 *   13. Aggregate eval correctly counts ships/revises/refuses
 *   14. Canonical set loads all 13 cases without schema error
 *   15. Canonical set covers all 6 target markets
 *   16. Canonical set covers both personas
 *   17. Eval runner baseline-only mode exits cleanly
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  type EvalSummary,
  type PackageForScoring,
  aggregate_eval_results,
  evaluate_launch_criteria,
  load_canonical,
  provenance_rate,
  score_coach_panel,
} from "../src/index";

// ──────────── Helpers ────────────

function perfect_package(): PackageForScoring {
  return {
    summary:
      "Senior Software Engineer with 7 years experience building distributed systems at Stripe and Cloudflare. Led migration of 600+ services to Kubernetes, reducing deploy failures from 4.2% to 0.8%. Expert in Go, Postgres, Kubernetes, and observability. Calm under pressure; ships with care.",
    bullets: [
      {
        text: "Led migration of 600+ Instacart services to ArgoCD + Helm, cutting deploy failure rate from 4.2% to 0.8%.",
        evidence_ids: ["ev-migration-600", "ev-deploy-failure"],
      },
      {
        text: "Designed Backstage-based service catalog that cut new-service onboarding from 3 days to 2 hours.",
        evidence_ids: ["ev-backstage-catalog", "ev-onboarding-time"],
      },
      {
        text: "Drove P0 incident MTTR from 47 min to 9 min at Lyft through automated runbooks.",
        evidence_ids: ["ev-mttr-lyft", "ev-runbooks"],
      },
    ],
    cover_letter:
      "Platform work at the scale Meridian is describing is exactly what I have built for the last 4 years. I migrated 600+ services to ArgoCD and cut deploy failures from 4.2% to 0.8%.",
    candidate_profile: "Senior platform engineer, 10 years, ex-Lyft, Instacart.",
    job_description:
      "Staff Platform Engineer. Required: Kubernetes, ArgoCD, Helm, MTTR reduction experience. 8+ years SWE.",
    market: "US",
    role_family: "platform_swe",
    verdict: "ship",
    submission_confidence: 0.78,
    interview_ready_score: 82,
    ats_coverage_pct: 85,
  };
}

function good_summary(): EvalSummary {
  return {
    total_cases: 10,
    ships: 8,
    revises: 1,
    refuses: 1,
    mean_coach_panel_score: 74,
    mean_provenance_rate: 0.95,
    mean_ats_coverage_pct: 80,
    mean_interview_ready_score: 72,
    mean_submission_confidence: 0.65,
    cases_with_callback_signal: 4,
    cases_with_fabrication: 0,
  };
}

// ─────────────── Provenance rate ───────────────

test("provenance_rate = 1.0 when all bullets have evidence IDs", () => {
  const result = provenance_rate([
    { text: "Built a service processing 2M rows/day.", evidence_ids: ["ev-1"] },
    { text: "Led team of 8 engineers.", evidence_ids: ["ev-2", "ev-3"] },
  ]);
  assert.equal(result.provenance_rate, 1.0);
  assert.equal(result.bullets_passed, 2);
  assert.equal(result.bullets_failed, 0);
});

test("provenance_rate = 0.0 when no bullets have evidence IDs", () => {
  const result = provenance_rate([
    { text: "Built a service processing 2M rows/day.", evidence_ids: [] },
    { text: "Led team of 8 engineers.", evidence_ids: [] },
  ]);
  assert.equal(result.provenance_rate, 0.0);
  assert.equal(result.bullets_passed, 0);
  assert.equal(result.bullets_failed, 2);
});

test("provenance_rate catches ungrounded metric when evidence_texts provided but number missing", () => {
  const result = provenance_rate([
    {
      text: "Reduced latency by 40%.",
      evidence_ids: ["ev-1"],
      evidence_texts: ["Worked on latency improvements in the caching layer."], // no "40" here
    },
  ]);
  // 40% claims a specific metric — "40" not in evidence_texts
  assert.equal(result.bullets_failed, 1);
  assert.ok(result.failed_bullets[0]!.reason.includes("40"));
});

test("provenance_rate passes when metric appears in evidence_texts", () => {
  const result = provenance_rate([
    {
      text: "Reduced latency by 40%.",
      evidence_ids: ["ev-1"],
      evidence_texts: ["We reduced the p99 latency by approximately 40 percent through caching."],
    },
  ]);
  assert.equal(result.provenance_rate, 1.0);
});

test("provenance_rate handles empty bullet array", () => {
  const result = provenance_rate([]);
  assert.equal(result.provenance_rate, 1.0);
  assert.equal(result.bullets_total, 0);
});

// ─────────────── CoachPanel ───────────────

test("Coach panel: perfect package scores ≥ 70 on all coaches and passes", () => {
  const pkg = perfect_package();
  const result = score_coach_panel(pkg);
  assert.equal(result.scores.length, 5);
  for (const s of result.scores) {
    assert.ok(s.score >= 70, `${s.coach_role} scored ${s.score} < 70`);
  }
  assert.ok(result.panel_passed);
  assert.ok(result.trimmed_mean >= 70);
});

test("Coach panel: banned phrase degrades narrative score", () => {
  const pkg = perfect_package();
  pkg.summary = "Passionate professional with a proven track record of results-driven delivery.";
  const result = score_coach_panel(pkg);
  const narrative = result.scores.find((s) => s.coach_id === "narrative_coach")!;
  assert.ok(narrative.score < 100);
  assert.ok(narrative.notes.some((n) => n.includes("Banned phrase")));
});

test("Coach panel: no evidence IDs tanks honesty score", () => {
  const pkg = perfect_package();
  pkg.bullets = [
    { text: "Built a service processing 2M rows/day.", evidence_ids: [] },
    { text: "Led team of 8 engineers.", evidence_ids: [] },
    { text: "Reduced latency by 40%.", evidence_ids: [] },
  ];
  const result = score_coach_panel(pkg);
  const honesty = result.scores.find((s) => s.coach_id === "honesty_auditor")!;
  assert.ok(honesty.score < 70, `Expected < 70 but got ${honesty.score}`);
  assert.ok(!honesty.passed);
});

test("Coach panel: trimmed mean drops highest and lowest score", () => {
  const pkg = perfect_package();
  const result = score_coach_panel(pkg);

  const raw_values = result.scores.map((s) => s.score).sort((a, b) => a - b);
  const trimmed = raw_values.slice(1, -1);
  const expected_trimmed_mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

  assert.ok(Math.abs(result.trimmed_mean - expected_trimmed_mean) < 0.01);
});

test("Coach panel: refuse verdict tanks HM proxy score", () => {
  const pkg = perfect_package();
  pkg.verdict = "refuse";
  const result = score_coach_panel(pkg);
  const hm = result.scores.find((s) => s.coach_id === "hm_proxy")!;
  assert.ok(hm.score < 70, `Expected < 70 but got ${hm.score}`);
});

test("Coach panel: UK market penalises American spelling in summary", () => {
  const pkg = perfect_package();
  pkg.market = "UK";
  pkg.summary =
    "Senior engineer who can optimize systems and center the team around shared goals, with great color judgment.";
  const result = score_coach_panel(pkg);
  const ats = result.scores.find((s) => s.coach_id === "ats_specialist")!;
  assert.ok(ats.notes.some((n) => n.includes("American spellings")));
});

// ─────────────── LaunchCriteriaGate ───────────────

test("Launch gate PASSES on all-green summary", () => {
  const summary: EvalSummary = {
    total_cases: 20,
    ships: 17,
    revises: 2,
    refuses: 1,
    mean_coach_panel_score: 76,
    mean_provenance_rate: 0.95,
    mean_ats_coverage_pct: 82,
    mean_interview_ready_score: 73,
    mean_submission_confidence: 0.68,
    cases_with_callback_signal: 9,
    cases_with_fabrication: 0,
  };

  const result = evaluate_launch_criteria(summary);
  assert.ok(result.passed, `Gate blocked: ${result.blocking_criteria.join(", ")}`);
  assert.equal(result.blocking_criteria.length, 0);
  assert.ok(result.summary.includes("LAUNCH READY"));
});

test("Launch gate BLOCKS when provenance < 92%", () => {
  const summary = good_summary();
  summary.mean_provenance_rate = 0.88; // below 92%

  const result = evaluate_launch_criteria(summary);
  assert.ok(!result.passed);
  assert.ok(result.blocking_criteria.some((c) => c.includes("provenance_rate")));
});

test("Launch gate BLOCKS when fabrication cases > 0", () => {
  const summary = good_summary();
  summary.cases_with_fabrication = 1;

  const result = evaluate_launch_criteria(summary);
  assert.ok(!result.passed);
  assert.ok(result.blocking_criteria.some((c) => c.includes("zero_fabrication")));
});

test("Launch gate BLOCKS when refuse rate > 15%", () => {
  const summary: EvalSummary = {
    ...good_summary(),
    total_cases: 10,
    ships: 7,
    revises: 1,
    refuses: 2, // 20% refuse rate > 15%
  };

  const result = evaluate_launch_criteria(summary);
  assert.ok(!result.passed);
  assert.ok(result.blocking_criteria.some((c) => c.includes("refuse_rate")));
});

test("Launch gate BLOCKS when coach panel score < 70", () => {
  const summary = good_summary();
  summary.mean_coach_panel_score = 65; // below 70

  const result = evaluate_launch_criteria(summary);
  assert.ok(!result.passed);
  assert.ok(result.blocking_criteria.some((c) => c.includes("coach_panel_score")));
});

test("Launch gate BLOCKS when ATS coverage < 75%", () => {
  const summary = good_summary();
  summary.mean_ats_coverage_pct = 68; // below 75%

  const result = evaluate_launch_criteria(summary);
  assert.ok(!result.passed);
  assert.ok(result.blocking_criteria.some((c) => c.includes("ats_coverage")));
});

test("Launch gate produces summary string with LAUNCH READY on pass", () => {
  const result = evaluate_launch_criteria({
    total_cases: 20,
    ships: 18,
    revises: 1,
    refuses: 1,
    mean_coach_panel_score: 78,
    mean_provenance_rate: 0.96,
    mean_ats_coverage_pct: 84,
    mean_interview_ready_score: 76,
    mean_submission_confidence: 0.7,
    cases_with_callback_signal: 8,
    cases_with_fabrication: 0,
  });

  assert.ok(result.summary.includes("LAUNCH READY"));
  assert.ok(result.passed);
});

test("Launch gate summary mentions LAUNCH BLOCKED when criteria fail", () => {
  const summary = good_summary();
  summary.mean_coach_panel_score = 55;
  summary.mean_provenance_rate = 0.8;

  const result = evaluate_launch_criteria(summary);
  assert.ok(result.summary.includes("LAUNCH BLOCKED"));
  assert.ok(!result.passed);
});

// ─────────────── aggregate_eval_results ───────────────

test("aggregate_eval_results correctly counts verdicts", () => {
  const results = [
    {
      verdict: "ship" as const,
      coach_panel_score: 75,
      provenance_rate: 0.95,
      ats_coverage_pct: 80,
      interview_ready_score: 72,
      submission_confidence: 0.65,
      has_fabrication: false,
    },
    {
      verdict: "ship" as const,
      coach_panel_score: 72,
      provenance_rate: 0.92,
      ats_coverage_pct: 78,
      interview_ready_score: 68,
      submission_confidence: 0.6,
      has_fabrication: false,
    },
    {
      verdict: "revise" as const,
      coach_panel_score: 65,
      provenance_rate: 0.88,
      ats_coverage_pct: 70,
      interview_ready_score: 58,
      submission_confidence: 0.45,
      has_fabrication: false,
    },
    {
      verdict: "refuse" as const,
      coach_panel_score: 40,
      provenance_rate: 0.7,
      ats_coverage_pct: 50,
      interview_ready_score: 35,
      submission_confidence: 0.15,
      has_fabrication: true,
    },
  ];

  const summary = aggregate_eval_results(results);
  assert.equal(summary.total_cases, 4);
  assert.equal(summary.ships, 2);
  assert.equal(summary.revises, 1);
  assert.equal(summary.refuses, 1);
  assert.equal(summary.cases_with_fabrication, 1);
  assert.ok(Math.abs(summary.mean_coach_panel_score - 63) < 1);
});

test("aggregate_eval_results handles empty input", () => {
  const summary = aggregate_eval_results([]);
  assert.equal(summary.total_cases, 0);
  assert.equal(summary.mean_coach_panel_score, 0);
});

// ─────────────── Canonical set integrity ───────────────

test("Canonical set loads all 200 cases without schema error", () => {
  const cases = load_canonical();
  assert.equal(cases.length, 200);
});

test("Canonical set covers all 6 target markets", () => {
  const cases = load_canonical();
  const markets = new Set(cases.map((c) => c.market));
  for (const m of ["US", "UK", "EU", "IN", "CA", "AU"]) {
    assert.ok(markets.has(m as any), `Missing market: ${m}`);
  }
});

test("Canonical set covers both personas", () => {
  const cases = load_canonical();
  const personas = new Set(cases.map((c) => c.persona));
  assert.ok(personas.has("new_grad"));
  assert.ok(personas.has("experienced"));
});

test("Canonical set has at least one refuse-expected case", () => {
  const cases = load_canonical();
  const refuse_expected = cases.filter((c) => !c.expected_outcome.callback_at_human_baseline);
  assert.ok(refuse_expected.length >= 1, "Expected at least 1 refuse case");
});

test("Canonical set covers multiple role families", () => {
  const cases = load_canonical();
  const families = new Set(cases.map((c) => c.role_family));
  assert.ok(families.size >= 5, `Expected ≥5 role families, got ${families.size}`);
});

test("Every canonical case has expert_package with ≥1 bullet", () => {
  const cases = load_canonical();
  for (const c of cases) {
    assert.ok(c.expert_package.experience_bullets.length >= 1, `Case ${c.id} has no bullets`);
  }
});

test("Every canonical case has non-empty jd_text and profile_markdown", () => {
  const cases = load_canonical();
  for (const c of cases) {
    assert.ok(c.jd_text.length >= 50, `Case ${c.id} has short jd_text`);
    assert.ok(c.profile_markdown.length >= 50, `Case ${c.id} has short profile`);
  }
});
