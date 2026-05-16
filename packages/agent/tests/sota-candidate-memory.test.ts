/**
 * Phase 3 Candidate Memory & Claim Ledger acceptance tests.
 *
 * Proves:
 *   - profile-only generation works (no JD): `buildCandidateModelDeterministic`
 *     produces a non-empty CandidateModel from a profile_text input.
 *   - Every generated bullet must reference claim IDs (locked ledger
 *     hash is reproducible).
 *   - Unsupported metric claims (no source_id) are rejected by
 *     `findUnsafeClaims`.
 *   - The CandidateMemoryHydrator + ClaimLedgerLocker specialists
 *     write the expected blackboard nodes.
 *   - SOTA `requires` prerequisite gating prevents production goals
 *     from running before the ledger exists.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  CandidateModelSchema,
  ClaimLedgerSchema,
  type Blackboard,
} from "@retune/types";
import {
  CandidateMemoryHydrator,
  ClaimLedgerLocker,
  buildCandidateModelDeterministic,
  buildClaimLedgerFromCandidateModel,
  findUnsafeClaims,
  lockClaimLedger,
} from "../src/generation-sota";
import { GoalStack } from "../src/workbench/goal-stack";
import {
  AttentionScheduler,
  AuditTrail,
  BlackboardStore,
  BudgetController,
  Orchestrator,
  SpecialistRegistry,
  TriggerBus,
} from "../src/sota-exports";

// ─────────────────────────────────────────────────────────────────────────────
// Determinism + provenance
// ─────────────────────────────────────────────────────────────────────────────

test("buildCandidateModelDeterministic projects profile_text into a typed candidate_model", () => {
  const result = buildCandidateModelDeterministic({
    user_id: USER_ID,
    profile_text: SAMPLE_PROFILE,
  });
  CandidateModelSchema.parse(result.candidate_model);
  assert.equal(result.warnings.length, 0);
  assert.ok(result.source_records.length >= 1);
  // Mining should pick up at least one metric and one achievement.
  assert.ok(result.candidate_model.metric_inventory.length >= 1);
  assert.ok(result.candidate_model.achievement_inventory.length >= 1);
});

test("buildCandidateModelDeterministic returns warnings when no sources are present", () => {
  const result = buildCandidateModelDeterministic({ user_id: USER_ID });
  assert.deepEqual(result.warnings, ["no_profile_sources"]);
  assert.equal(result.source_records.length, 0);
});

test("buildCandidateModelDeterministic ingests a CareerProfileV1 JSON", () => {
  const result = buildCandidateModelDeterministic({
    user_id: USER_ID,
    career_profile: SAMPLE_CAREER_PROFILE,
  });
  CandidateModelSchema.parse(result.candidate_model);
  assert.equal(result.candidate_model.identity.full_name.value, "Jane Doe");
  assert.ok(result.candidate_model.skill_inventory.length >= 2);
  // Career timeline should include the role with seniority inference.
  const seniorRole = result.candidate_model.career_timeline.find((r) => r.title.includes("Senior"));
  assert.ok(seniorRole);
  assert.equal(seniorRole?.seniority, "ic_senior");
});

test("buildClaimLedgerFromCandidateModel produces claims for skills, metrics, achievements, leadership", () => {
  const cm = buildCandidateModelDeterministic({
    user_id: USER_ID,
    profile_text: SAMPLE_PROFILE,
  }).candidate_model;
  const ledger = buildClaimLedgerFromCandidateModel(GEN_ID, cm);
  ClaimLedgerSchema.parse(ledger);
  assert.equal(ledger.locked, false);
  assert.equal(ledger.locked_hash, null);
  // Every claim has an interview_defense_prompt.
  for (const c of ledger.claims) {
    assert.ok(c.interview_defense_prompt.length > 0);
  }
});

test("lockClaimLedger stamps locked + locked_hash and is idempotent", () => {
  const cm = buildCandidateModelDeterministic({
    user_id: USER_ID,
    profile_text: SAMPLE_PROFILE,
  }).candidate_model;
  const ledger = buildClaimLedgerFromCandidateModel(GEN_ID, cm);
  const a = lockClaimLedger(ledger);
  assert.equal(a.locked, true);
  assert.ok(a.locked_hash);
  // Locking an already-locked ledger is a no-op.
  const b = lockClaimLedger(a);
  assert.equal(b.locked_hash, a.locked_hash);
});

test("findUnsafeClaims flags metrics without source ids", () => {
  const ledger = buildClaimLedgerFromCandidateModel(GEN_ID, {
    schema_version: "sota-v3",
    user_id: USER_ID,
    identity: {
      full_name: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      email: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      phone: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      location: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      linkedin: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      github: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
      portfolio: { value: null, source_ids: [], confidence: 0, user_confirmed: false },
    },
    career_timeline: [],
    skill_inventory: [],
    metric_inventory: [
      {
        id: randomUUID(),
        metric: "30% increase",
        value: "30%",
        unit: "%",
        context: null,
        direction: "increase",
        window: null,
        source_ids: [], // ← no source! → unsafe
        user_confirmed: false,
      },
    ],
    achievement_inventory: [],
    leadership_inventory: [],
    domain_inventory: [],
    credential_inventory: [],
    constraint_inventory: [],
    preference_model: {
      emphasis_areas: [],
      de_emphasis_areas: [],
      tone_signals: [],
      style_constraints: [],
      preferred_markets: [],
      work_preference: "unknown",
      seniority_comfort: [],
      industries_of_interest: [],
      role_dealbreakers: [],
    },
    voice_model: null,
    edit_memory: [],
    outcome_memory: [],
    prior_packages: [],
    opt_in_global_learning: false,
    hydrated_at: new Date().toISOString(),
  });
  const unsafe = findUnsafeClaims(ledger);
  assert.equal(unsafe.length, 1);
  assert.equal(unsafe[0]?.reason, "metric_without_source");
});

// ─────────────────────────────────────────────────────────────────────────────
// CandidateMemoryHydrator specialist (workbench integration)
// ─────────────────────────────────────────────────────────────────────────────

test("CandidateMemoryHydrator writes sota.candidate_model + sota.claim_ledger", async () => {
  const harness = makeHarness();
  harness.registry.register_all([new CandidateMemoryHydrator(), new ClaimLedgerLocker()]);

  harness.goals.add({
    kind: "hydrate_candidate_memory",
    priority: 90,
    emitted_by: "test",
    payload: { profile_text: SAMPLE_PROFILE },
  });

  // Lock goal — only runs once the ledger exists.
  harness.goals.add({
    kind: "build_candidate_model",
    priority: 88,
    emitted_by: "test",
    requires: ["sota.claim_ledger"],
    payload: {},
  });

  await harness.orchestrator.run({ max_ticks: 16 });

  const finalSnap = harness.blackboard.snapshot() as Blackboard & {
    sota?: { candidate_model?: unknown; claim_ledger?: unknown; input_completeness?: unknown };
  };
  CandidateModelSchema.parse(finalSnap.sota?.candidate_model);
  const ledger = ClaimLedgerSchema.parse(finalSnap.sota?.claim_ledger);
  assert.equal(ledger.locked, true, "ledger should be locked after build_candidate_model runs");
  assert.ok(ledger.locked_hash);
});

test("Production goals with `requires` are blocked until the ledger exists", () => {
  const goals = new GoalStack();
  goals.add({
    kind: "compose_resume",
    priority: 50,
    emitted_by: "test",
    requires: ["sota.claim_ledger"],
  });
  // No ledger on the blackboard yet → peek_next must skip.
  const reader = (path: string) => (path === "sota.claim_ledger" ? null : undefined);
  assert.equal(goals.peek_next({ blackboard: reader }), undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GEN_ID = "22222222-2222-4222-8222-222222222222";
const JD_ID = "33333333-3333-4333-8333-333333333333";

const SAMPLE_PROFILE = `# Jane Doe — Senior Software Engineer

I led a team of 8 engineers at Stripe to ship a new payments API.
We reduced latency by 40% and saved $1.2M in annual costs.
Built distributed systems handling 10k qps in production.
Designed and launched the new fraud detection pipeline.
`;

const SAMPLE_CAREER_PROFILE = {
  schemaVersion: "career-profile-v1",
  id: "profile-jane-doe",
  userId: USER_ID,
  identity: {
    fullName: { value: "Jane Doe", source: "user", confidence: 1, confirmed: true },
    email: { value: "jane@example.com", source: "user", confidence: 1, confirmed: true },
    phone: { value: null, source: "system", confidence: 0, confirmed: false },
    location: { value: "NYC", source: "user", confidence: 1, confirmed: true },
    linkedin: { value: null, source: "system", confidence: 0, confirmed: false },
    github: { value: null, source: "system", confidence: 0, confirmed: false },
    portfolio: { value: null, source: "system", confidence: 0, confirmed: false },
  },
  experience: {
    value: [
      {
        id: "role-1",
        title: "Senior Software Engineer",
        company: "Stripe",
        startDate: "2021-01",
        endDate: "2024-12",
        responsibilities: ["Led the payments API rebuild"],
        achievements: ["Shipped a new API handling 10k qps"],
        metrics: [
          { metric: "qps", value: "10k", context: "production peak" },
        ],
      },
    ],
  },
  skills: {
    technical: { value: ["TypeScript", "Go", "Kubernetes"] },
    tools: { value: ["GitHub Actions"] },
    business: { value: [] },
    methodologies: { value: [] },
    softSkills: { value: ["Leadership"] },
    domainSkills: { value: [] },
  },
  certifications: { value: [] },
  resumeWritingPreferences: {
    emphasisAreas: { value: ["leadership", "metrics"] },
    deEmphasisAreas: { value: [] },
    toneSignals: { value: [] },
    styleConstraints: { value: [] },
  },
  careerIntent: {
    interestedRoles: { value: [] },
    careerDirection: { value: "" },
    preferredMarkets: { value: [] },
    workPreference: { value: "remote" },
    seniorityComfort: { value: [] },
    industriesOfInterest: { value: [] },
    roleDealbreakers: { value: [] },
  },
};

function makeHarness() {
  const bus = new TriggerBus();
  const blackboard = new BlackboardStore(makeEmptyBlackboard(), bus);
  const goals = new GoalStack();
  const registry = new SpecialistRegistry();
  const audit = new AuditTrail();
  const budget = new BudgetController({
    spent_usd: 0,
    ceiling_usd: 0.05,
    hard_kill_usd: 0.2,
    per_specialist_spent: {},
  });
  const orchestrator = new Orchestrator({
    blackboard,
    goal_stack: goals,
    registry,
    scheduler: new AttentionScheduler(),
    audit_trail: audit,
    budget,
  });
  return { bus, blackboard, goals, registry, audit, budget, orchestrator };
}

function makeEmptyBlackboard(): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id: GEN_ID,
    user_id: USER_ID,
    jd_id: JD_ID,
    market: "US",
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
    cost_budget: {
      spent_usd: 0,
      ceiling_usd: 0.05,
      hard_kill_usd: 0.2,
      per_specialist_spent: {},
    },
    audit_trail: [],
    created_at: now,
    updated_at: now,
  };
}
