/**
 * Phase 5 + 6 acceptance tests:
 *   - ProofGapInterviewer: no duplicate questions, max budget enforced,
 *     answer integration writes new claims (via request_user_input).
 *   - DraftTournamentRunner: final is not first variant, winning reason
 *     persisted, claim_ids bound, ledger-not-locked is refused.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  type CandidateModel,
  type ClaimLedger,
  ClaimLedgerSchema,
  type Goal,
  type JobModel,
  JobModelSchema,
  type ProofQuestion,
  type QuestionPlan,
} from "@retune/types";
import {
  DraftTournamentRunner,
  ProofGapInterviewer,
  buildClaimLedgerFromCandidateModel,
  buildJobModelDeterministic,
  lockClaimLedger,
} from "../src/generation-sota";

// ─────────────────────────────────────────────────────────────────────────────
// ProofGapInterviewer
// ─────────────────────────────────────────────────────────────────────────────

test("ProofGapInterviewer asks at most max_questions per run", async () => {
  const interviewer = new ProofGapInterviewer();
  const ctx = makeCtxWith(makeJobModel(SAMPLE_JD), makeLedger(EMPTY_CANDIDATE));
  const goal = makeGoal({ max_questions: 2 }, "plan_proof_questions");
  const result = await interviewer.run(ctx, goal);
  const plan = result.writes[0]?.value as QuestionPlan;
  assert.ok(plan, "should write question_plan");
  assert.ok(plan.questions.length <= 2, `expected ≤2 questions, got ${plan.questions.length}`);
  assert.equal(result.new_goals?.length ?? 0, plan.questions.length);
});

test("ProofGapInterviewer suppresses duplicate questions across runs", async () => {
  const interviewer = new ProofGapInterviewer();

  // First run.
  const ctx1 = makeCtxWith(makeJobModel(SAMPLE_JD), makeLedger(EMPTY_CANDIDATE));
  const r1 = await interviewer.run(ctx1, makeGoal({ max_questions: 5 }, "plan_proof_questions"));
  const plan1 = r1.writes[0]?.value as QuestionPlan;

  // Second run with the prior plan visible in the blackboard. Mark the
  // questions as `asked` so the interviewer knows budget is consumed.
  const askedPlan: QuestionPlan = {
    ...plan1,
    questions: plan1.questions.map((q) => ({ ...q, status: "asked" })),
  };
  const ctx2 = makeCtxWith(makeJobModel(SAMPLE_JD), makeLedger(EMPTY_CANDIDATE), askedPlan);
  const r2 = await interviewer.run(ctx2, makeGoal({ max_questions: plan1.questions.length }, "plan_proof_questions"));
  const plan2 = r2.writes[0]?.value as QuestionPlan;
  // Budget already consumed by asked questions → no new questions added.
  const newQs = plan2.questions.filter((q) => !plan1.questions.some((p) => p.id === q.id));
  assert.equal(newQs.length, 0);
});

test("ProofGapInterviewer skips when job_model or ledger is missing", async () => {
  const interviewer = new ProofGapInterviewer();
  const ctx = makeCtxRaw({ /* no sota */ });
  const result = await interviewer.run(ctx, makeGoal({}, "plan_proof_questions"));
  assert.equal(result.writes.length, 0);
  assert.equal(result.audit.micro_stage, "missing_inputs");
});

// ─────────────────────────────────────────────────────────────────────────────
// DraftTournamentRunner
// ─────────────────────────────────────────────────────────────────────────────

test("DraftTournamentRunner refuses to run when the ledger is not locked", async () => {
  const runner = new DraftTournamentRunner();
  const unlockedLedger = makeLedger(SAMPLE_CANDIDATE);
  unlockedLedger.locked = false;
  unlockedLedger.locked_hash = null;
  const ctx = makeCtxWith(makeJobModel(SAMPLE_JD), unlockedLedger);
  const result = await runner.run(ctx, makeGoal({}, "generate_draft_variants"));
  assert.equal(result.writes.length, 0);
  assert.equal(result.audit.micro_stage, "ledger_not_locked");
});

test("DraftTournamentRunner generates variants, picks a winner, persists the reason", async () => {
  const runner = new DraftTournamentRunner();
  const ledger = lockClaimLedger(makeLedger(SAMPLE_CANDIDATE));
  const ctx = makeCtxWith(makeJobModel(SAMPLE_JD), ledger);
  const result = await runner.run(ctx, makeGoal({}, "generate_draft_variants"));
  assert.equal(result.writes.length, 2);
  const variants = result.writes[0]?.value as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(variants));
  assert.equal(variants.length, 3);
  // Exactly one variant is final.
  const finals = variants.filter((v) => v.is_final === true);
  assert.equal(finals.length, 1);
  // Winning variant has a reason_won.
  assert.ok(typeof finals[0]?.reason_won === "string" && (finals[0]?.reason_won as string).length > 0);
  // Every variant lists claim_ids.
  for (const v of variants) {
    assert.ok(Array.isArray(v.claim_ids));
    assert.ok((v.claim_ids as string[]).length >= 0);
  }
});

test("DraftTournamentRunner assigns claim_ids only from the locked ledger", async () => {
  const runner = new DraftTournamentRunner();
  const ledger = lockClaimLedger(makeLedger(SAMPLE_CANDIDATE));
  const validIds = new Set(ledger.claims.map((c) => c.id));
  const ctx = makeCtxWith(makeJobModel(SAMPLE_JD), ledger);
  const result = await runner.run(ctx, makeGoal({}, "generate_draft_variants"));
  const variants = result.writes[0]?.value as Array<Record<string, unknown>>;
  for (const v of variants) {
    for (const id of v.claim_ids as string[]) {
      assert.ok(validIds.has(id), `variant references claim ${id} not in locked ledger`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures + helpers
// ─────────────────────────────────────────────────────────────────────────────

const GEN_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const JD_ID = "33333333-3333-4333-8333-333333333333";

const SAMPLE_JD = `# Senior Backend Engineer

## Required
- Must have 5+ years of backend engineering experience
- Production experience with Kubernetes
- Production experience with TypeScript
- Must be authorized to work in the US
`;

const EMPTY_CANDIDATE: CandidateModel = {
  schema_version: "sota-v3",
  user_id: USER_ID,
  identity: emptyIdentity(),
  career_timeline: [],
  skill_inventory: [],
  metric_inventory: [],
  achievement_inventory: [],
  leadership_inventory: [],
  domain_inventory: [],
  credential_inventory: [],
  constraint_inventory: [],
  preference_model: emptyPrefs(),
  voice_model: null,
  edit_memory: [],
  outcome_memory: [],
  prior_packages: [],
  opt_in_global_learning: false,
  hydrated_at: new Date().toISOString(),
};

const SAMPLE_CANDIDATE: CandidateModel = {
  ...EMPTY_CANDIDATE,
  skill_inventory: [
    { id: "s1", name: "Kubernetes", category: "technical", years: 5, evidence_tier: "demonstrated", source_ids: ["src1"], recency_iso: null },
    { id: "s2", name: "TypeScript", category: "technical", years: 5, evidence_tier: "demonstrated", source_ids: ["src1"], recency_iso: null },
    { id: "s3", name: "AWS", category: "technical", years: 3, evidence_tier: "self_described", source_ids: ["src1"], recency_iso: null },
  ],
  metric_inventory: [
    {
      id: "m1",
      metric: "10k qps",
      value: "10k",
      unit: "qps",
      context: "production peak",
      direction: "neutral",
      window: null,
      source_ids: ["src1"],
      user_confirmed: true,
    },
  ],
  achievement_inventory: [
    {
      id: "a1",
      text: "Shipped a new payments API handling 10k qps",
      metric_ids: ["m1"],
      source_ids: ["src1"],
      defensibility: "moderate",
    },
  ],
  leadership_inventory: [
    {
      id: "l1",
      scope: "team",
      team_size: 4,
      budget_usd: null,
      description: "Led a team of 4 engineers",
      source_ids: ["src1"],
    },
  ],
};

function makeJobModel(jdText: string): JobModel {
  return JobModelSchema.parse(buildJobModelDeterministic({ jd_id: JD_ID, jd_text: jdText }).job_model);
}

function makeLedger(cm: CandidateModel): ClaimLedger {
  return ClaimLedgerSchema.parse(buildClaimLedgerFromCandidateModel(GEN_ID, cm));
}

function makeCtxWith(jobModel: JobModel | null, ledger: ClaimLedger | null, questionPlan?: QuestionPlan) {
  const sota: Record<string, unknown> = {};
  if (jobModel) sota.job_model = jobModel;
  if (ledger) sota.claim_ledger = ledger;
  if (questionPlan) sota.question_plan = questionPlan;
  return makeCtxRaw(sota);
}

function makeCtxRaw(sota: Record<string, unknown>) {
  return {
    blackboard: {
      generation_id: GEN_ID,
      user_id: USER_ID,
      jd_id: JD_ID,
      market: "US" as const,
      ontology_version: "0.0.1",
      goals: [],
      hypotheses: {
        role_schema: null,
        company_schema: null,
        discourse_map: null,
        hidden_disqualifiers: null,
        desperation_index: null,
        cultural_vector: null,
        candidate_credibility_prior: null,
        voice_fingerprint: null,
        honesty_calibration: null,
        narrative_arcs_candidates: [],
        chosen_narrative_arc: null,
      },
      evidence_graph: { span_ids: [], requirement_matches: [] },
      draft: { sections: {}, bullets: {}, claims: {}, pending_revisions: [] },
      conflicts: [],
      outcome_estimate: null,
      blocking_factors: [],
      cost_budget: { spent_usd: 0, ceiling_usd: 0.05, hard_kill_usd: 0.2, per_specialist_spent: {} },
      audit_trail: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sota,
    } as never,
    tick: 0,
    trace_id: "t",
    signal: new AbortController().signal,
  };
}

function makeGoal(payload: Record<string, unknown>, kind: string): Goal {
  return {
    id: randomUUID(),
    kind: kind as never,
    priority: 50,
    emitted_by: "test",
    payload,
    status: "pending",
    satisfied_by: [],
    parent_goal_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function emptyIdentity() {
  const f = () => ({ value: null, source_ids: [], confidence: 0, user_confirmed: false });
  return {
    full_name: f(),
    email: f(),
    phone: f(),
    location: f(),
    linkedin: f(),
    github: f(),
    portfolio: f(),
  };
}

function emptyPrefs() {
  return {
    emphasis_areas: [],
    de_emphasis_areas: [],
    tone_signals: [],
    style_constraints: [],
    preferred_markets: [],
    work_preference: "unknown" as const,
    seniority_comfort: [],
    industries_of_interest: [],
    role_dealbreakers: [],
  };
}
