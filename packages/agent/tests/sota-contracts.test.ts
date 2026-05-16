/**
 * Phase 0 Contract Freeze acceptance tests.
 *
 * Proves:
 *   - Every new SOTA schema parses minimal valid input.
 *   - Goal stack semantic_key dedupe suppresses re-emission.
 *   - Goal stack honours `requires` prerequisite gating.
 *   - The empty factories produce schema-conformant skeletons.
 *   - Existing legacy Goal payloads still parse (back-compat).
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  ApplicationContextSchema,
  CandidateModelSchema,
  ClaimLedgerSchema,
  CompanyModelSchema,
  DEFAULT_GOAL_MAX_ATTEMPTS,
  DraftVariantSchema,
  GenerationSotaStateSchema,
  GoalSchema,
  JobModelSchema,
  LearningSignalSchema,
  ProofQuestionSchema,
  QualityBoardSchema,
  QuestionPlanSchema,
  RenderedApplicationPackageSchema,
  SotaClaimSchema,
  StartGenerationCommandSchema,
  StrategyBoardSchema,
  emptyClaimLedger,
  emptyGenerationSotaState,
  emptyQualityBoard,
} from "@retune/types";
import { GoalStack } from "../src/workbench";

const NOW = new Date().toISOString();
const GEN_ID = randomUUID();
const USER_ID = randomUUID();

// ─────────── Schema parse ───────────

test("StartGenerationCommandSchema accepts a minimal valid command", () => {
  const cmd = StartGenerationCommandSchema.parse({
    schema_version: "sota-v3",
    user_id: USER_ID,
    profile_id: "profile-1",
    idempotency_key: "abc12345-key",
    jd: {
      text: "Senior backend engineer wanted",
      hash: "deadbeef",
    },
    submitted_at: NOW,
  });
  assert.equal(cmd.schema_version, "sota-v3");
  assert.equal(cmd.market, "US");
  assert.equal(cmd.options.quality_mode, "balanced");
  assert.equal(cmd.options.max_questions, 3);
});

test("StartGenerationCommandSchema rejects when neither jd.text nor jd.url is set", () => {
  const result = StartGenerationCommandSchema.safeParse({
    schema_version: "sota-v3",
    user_id: USER_ID,
    profile_id: "profile-1",
    idempotency_key: "abc12345-key",
    jd: { hash: "deadbeef" },
    submitted_at: NOW,
  });
  assert.equal(result.success, false);
});

test("StartGenerationCommandSchema rejects undersized idempotency key", () => {
  const result = StartGenerationCommandSchema.safeParse({
    schema_version: "sota-v3",
    user_id: USER_ID,
    profile_id: "profile-1",
    idempotency_key: "short",
    jd: { text: "x", hash: "deadbeef" },
    submitted_at: NOW,
  });
  assert.equal(result.success, false);
});

test("StartGenerationCommandSchema rejects oversize jd.text (50_000+ chars)", () => {
  const result = StartGenerationCommandSchema.safeParse({
    schema_version: "sota-v3",
    user_id: USER_ID,
    profile_id: "profile-1",
    idempotency_key: "abc12345-key",
    jd: { text: "x".repeat(50_001), hash: "deadbeef" },
    submitted_at: NOW,
  });
  assert.equal(result.success, false);
});

test("CandidateModelSchema parses minimal hydration shape", () => {
  const model = CandidateModelSchema.parse({
    schema_version: "sota-v3",
    user_id: USER_ID,
    identity: {
      full_name: { value: "Jane Doe", source_ids: ["s1"], confidence: 0.95, user_confirmed: true },
      email: { value: "j@d.com", source_ids: ["s1"], confidence: 0.95, user_confirmed: true },
      phone: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      location: { value: "NYC", source_ids: ["s2"], confidence: 0.7, user_confirmed: false },
      linkedin: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      github: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      portfolio: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
    },
    preference_model: {},
    voice_model: null,
    hydrated_at: NOW,
  });
  assert.equal(model.identity.full_name.value, "Jane Doe");
  assert.deepEqual(model.career_timeline, []);
  assert.deepEqual(model.skill_inventory, []);
  assert.equal(model.opt_in_global_learning, false);
});

test("JobModelSchema enforces required canonical_text + jd_hash", () => {
  const result = JobModelSchema.safeParse({
    schema_version: "sota-v3",
    jd_id: randomUUID(),
    role_title_normalized: "swe_senior",
    role_title_raw: "Senior SWE",
    built_at: NOW,
  });
  assert.equal(result.success, false);
});

test("JobModelSchema accepts a minimal job model", () => {
  const model = JobModelSchema.parse({
    schema_version: "sota-v3",
    jd_id: randomUUID(),
    jd_hash: "abcd1234",
    canonical_text: "JD body",
    role_title_normalized: "swe_senior",
    role_title_raw: "Senior SWE",
    role_family: null,
    seniority: null,
    yoe_band: null,
    built_at: NOW,
  });
  assert.equal(model.role_family, null);
  assert.deepEqual(model.requirements, []);
  assert.deepEqual(model.hidden_constraints, []);
  assert.equal(model.posting_source, "user_paste");
});

test("CompanyModelSchema enforces freshness_iso + canonical_company_id", () => {
  const model = CompanyModelSchema.parse({
    schema_version: "sota-v3",
    canonical_company_id: "stripe",
    display_name: "Stripe",
    industry: null,
    hq_country: null,
    hiring_bar: null,
    culture_vector: null,
    freshness_iso: NOW,
  });
  assert.equal(model.size_band, "unknown");
  assert.equal(model.stale, false);
  assert.deepEqual(model.citations, []);
});

test("ClaimLedgerSchema requires every claim to declare interview_defense_prompt", () => {
  const result = SotaClaimSchema.safeParse({
    id: "claim-1",
    kind: "metric",
    text: "Increased revenue 30%",
    normalized_text: "increased revenue 30%",
    confidence: 0.7,
    defensibility: "moderate",
    created_at: NOW,
    // missing interview_defense_prompt
  });
  assert.equal(result.success, false);
});

test("SotaClaim parses with allowed/forbidden uses", () => {
  const claim = SotaClaimSchema.parse({
    id: "claim-1",
    kind: "metric",
    text: "Increased revenue 30%",
    normalized_text: "increased revenue 30%",
    confidence: 0.7,
    defensibility: "moderate",
    interview_defense_prompt: "Walk me through the 30% lift in revenue.",
    allowed_uses: ["resume", "cover_letter"],
    forbidden_uses: ["outreach"],
    created_at: NOW,
  });
  assert.deepEqual(claim.allowed_uses, ["resume", "cover_letter"]);
});

test("emptyClaimLedger / emptyQualityBoard / emptyGenerationSotaState are schema-valid", () => {
  ClaimLedgerSchema.parse(emptyClaimLedger(GEN_ID));
  QualityBoardSchema.parse(emptyQualityBoard(GEN_ID));
  GenerationSotaStateSchema.parse(emptyGenerationSotaState(GEN_ID));
});

test("ProofQuestionSchema supports every status enum", () => {
  for (const status of ["draft", "asked", "answered", "skipped", "expired"] as const) {
    const q = ProofQuestionSchema.parse({
      id: `q-${status}`,
      question_text: "Have you owned production Kubernetes?",
      target_path: "candidate_model.skill_inventory",
      links: [],
      expected_value: 0.8,
      cost: 0.34,
      status,
      asked_at: null,
      answered_at: null,
      answer_text: null,
    });
    assert.equal(q.status, status);
  }
});

test("DraftVariantSchema covers the five tournament flavors + merged", () => {
  for (const flavor of [
    "ats_forward",
    "recruiter_scan_forward",
    "hiring_manager_depth_forward",
    "authentic_voice_forward",
    "conservative_truth_forward",
    "merged",
  ] as const) {
    const v = DraftVariantSchema.parse({
      id: `v-${flavor}`,
      flavor,
      markdown: "# Resume",
      claim_ids: [],
      scores: {
        ats: 0.5,
        recruiter: 0.5,
        hiring_manager: 0.5,
        voice: 0.5,
        defensibility: 0.5,
        formatting: 0.5,
        market_fit: 0.5,
        fairness: 0.5,
      },
      total_score: 0.5,
      red_team_findings: [],
      reason_won: null,
      is_final: false,
      created_at: NOW,
    });
    assert.equal(v.flavor, flavor);
  }
});

test("StrategyBoardSchema parses with empty defaults", () => {
  const board = StrategyBoardSchema.parse({
    schema_version: "sota-v3",
    generation_id: GEN_ID,
    primary_arc_id: null,
    backup_arc_id: null,
  });
  assert.deepEqual(board.narrative_archetypes, []);
  assert.deepEqual(board.section_architecture, []);
});

test("RenderedApplicationPackageSchema parses with no artifacts", () => {
  const pkg = RenderedApplicationPackageSchema.parse({
    schema_version: "sota-v3",
    generation_id: GEN_ID,
    finalized: false,
    finalized_at: null,
  });
  assert.deepEqual(pkg.artifacts, []);
});

test("LearningSignalSchema covers every kind", () => {
  for (const kind of [
    "user_edited_bullet",
    "user_deleted_bullet",
    "user_selected_alternate_arc",
    "user_contested_decision",
    "outcome_callback",
    "outcome_rejection",
    "outcome_offer",
    "outcome_ghosted",
    "recruiter_feedback",
    "interview_question_asked",
  ] as const) {
    const s = LearningSignalSchema.parse({
      id: `s-${kind}`,
      generation_id: GEN_ID,
      user_id: USER_ID,
      kind,
      payload: {},
      recorded_at: NOW,
    });
    assert.equal(s.kind, kind);
  }
});

test("ApplicationContextSchema rejects max_questions > 10", () => {
  const result = ApplicationContextSchema.safeParse({
    schema_version: "sota-v3",
    generation_id: GEN_ID,
    application_id: null,
    market: "US",
    output_suite: ["resume"],
    quality_mode: "balanced",
    allow_company_web_research: false,
    allow_file_search: false,
    max_questions: 11,
    idempotency_key: "abc12345-key",
    preflight: null,
    consent: { company_web_research: false, file_search: false, case_base_learning: false },
    created_at: NOW,
  });
  assert.equal(result.success, false);
});

// ─────────── Goal-stack 003 SOTA: semantic_key dedupe ───────────

test("GoalStack.add() with semantic_key deduplicates pending goals", () => {
  const goals = new GoalStack();
  const a = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    semantic_key: "compose_resume:variant=ats_forward",
  });
  const b = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    semantic_key: "compose_resume:variant=ats_forward",
  });
  // Same semantic_key → same goal returned.
  assert.equal(a.id, b.id);
  assert.equal(goals.list({ kind: "compose_resume" }).length, 1);
});

test("GoalStack.add() with different semantic_keys both succeed", () => {
  const goals = new GoalStack();
  const a = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    semantic_key: "compose_resume:variant=ats_forward",
  });
  const b = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    semantic_key: "compose_resume:variant=voice_forward",
  });
  assert.notEqual(a.id, b.id);
  assert.equal(goals.list({ kind: "compose_resume" }).length, 2);
});

test("GoalStack.add() defaults max_attempts to DEFAULT_GOAL_MAX_ATTEMPTS", () => {
  const goals = new GoalStack();
  const g = goals.add({ kind: "compose_resume", priority: 50, emitted_by: "test" });
  assert.equal(g.max_attempts, DEFAULT_GOAL_MAX_ATTEMPTS);
  assert.equal(g.attempt_count, 0);
});

// ─────────── Goal-stack 003 SOTA: prerequisites ───────────

test("GoalStack.peek_next() with reader skips goals whose requires are unmet", () => {
  const goals = new GoalStack();
  goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    requires: ["sota.candidate_model"],
  });
  const reader = (path: string) => {
    if (path === "sota.candidate_model") return null;
    return undefined;
  };
  assert.equal(goals.peek_next({ blackboard: reader }), undefined);
});

test("GoalStack.peek_next() returns goals whose requires are satisfied", () => {
  const goals = new GoalStack();
  const g = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    requires: ["sota.candidate_model"],
  });
  const reader = (path: string) => {
    if (path === "sota.candidate_model") return { something: true };
    return undefined;
  };
  assert.equal(goals.peek_next({ blackboard: reader })?.id, g.id);
});

test("GoalStack.reconcile_prerequisites flips blocked goals back to pending", () => {
  const goals = new GoalStack();
  const g = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    requires: ["sota.candidate_model"],
  });
  goals.mark_blocked_on_prerequisites(g.id, "missing_candidate_model");
  assert.equal(goals.get(g.id)?.status, "blocked_on_prerequisites");
  goals.reconcile_prerequisites((path: string) =>
    path === "sota.candidate_model" ? { ok: true } : undefined,
  );
  assert.equal(goals.get(g.id)?.status, "pending");
});

test("GoalStack.peek_next() skips goals that have hit max_attempts", () => {
  const goals = new GoalStack();
  const g = goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    max_attempts: 1,
  });
  // simulate one full attempt cycle
  goals.mark_in_progress(g.id);
  // mark back to pending so peek_next would otherwise re-pick it
  // (simulating a specialist that did not satisfy the goal)
  // We re-use mark_abandoned to ensure max_attempts gating itself works.
  // For the explicit "attempt count exhausted" path we set attempt_count manually:
  const live = goals.get(g.id);
  assert.ok(live);
  // Re-open the goal but keep attempt_count at max — peek_next should refuse.
  goals.hydrate([{ ...live!, status: "pending", attempt_count: 1 }]);
  const next = goals.peek_next();
  assert.equal(next, undefined);
});

// ─────────── Backward-compat: legacy Goal shape parses ───────────

test("legacy v2 Goal payloads (without 003 fields) still parse", () => {
  const legacy = {
    id: randomUUID(),
    kind: "compose_resume",
    priority: 50,
    emitted_by: "api",
    payload: {},
    status: "pending",
    satisfied_by: [],
    parent_goal_id: null,
    created_at: NOW,
    updated_at: NOW,
  };
  const goal = GoalSchema.parse(legacy);
  assert.equal(goal.kind, "compose_resume");
  assert.equal(goal.requires, undefined);
  assert.equal(goal.semantic_key, undefined);
});

test("003 Goal payloads with new fields round-trip through schema", () => {
  const sota = {
    id: randomUUID(),
    kind: "compose_resume",
    priority: 50,
    emitted_by: "orchestrator",
    payload: {},
    status: "pending",
    satisfied_by: [],
    parent_goal_id: null,
    semantic_key: "compose_resume:v=ats_forward",
    requires: ["sota.candidate_model", "sota.job_model"],
    blocks: ["render_documents"],
    max_attempts: 5,
    attempt_count: 0,
    uncertainty: 0.4,
    expected_value: 0.7,
    deadline_ms: 60_000,
    status_reason: null,
    created_at: NOW,
    updated_at: NOW,
  };
  const goal = GoalSchema.parse(sota);
  assert.equal(goal.semantic_key, "compose_resume:v=ats_forward");
  assert.equal(goal.requires?.length, 2);
});
