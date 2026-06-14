/**
 * Phase 4 Job & Company Models acceptance tests.
 *
 * Proves:
 *   - Hard filters are extracted into JobModel.hard_filters.
 *   - Boilerplate is downweighted (low criticality + posting_noise_score raised).
 *   - Hidden constraints (security clearance, citizenship, work auth)
 *     are surfaced.
 *   - ATS keyword map contains weighted keywords from requirements.
 *   - Stale company research is invalidated past TTL.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { JobModelSchema } from "@retune/types";
import {
  CompanyContextResearcher,
  JobModelBuilder,
  _resetCompanyResearchCache,
  buildJobModelDeterministic,
} from "../src/generation-sota";

const SAMPLE_JD = `# Senior Backend Engineer at Stripe

## What you'll do
- Design and ship scalable APIs handling 10k qps
- Lead the rebuild of our payments orchestration layer
- Mentor 4 mid-level engineers

## Required
- 5+ years of backend engineering experience
- Production experience with Kubernetes and TypeScript
- Must have active US security clearance
- Authorized to work in the United States
- Must be a US citizen

## Nice to have
- Experience with GraphQL is a plus
- Bonus points for a Master's degree

## About Stripe
Stripe is an equal opportunity employer. We provide reasonable accommodations.
We offer competitive salary and unlimited PTO. Health insurance, dental, vision.
`;

test("buildJobModelDeterministic extracts hard filters from required block", () => {
  const result = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  JobModelSchema.parse(result.job_model);
  // At least one of the hard-filter sentences must be captured.
  assert.ok(result.job_model.hard_filters.length >= 1, "should extract at least one hard filter");
  assert.ok(
    result.job_model.hard_filters.some((s) =>
      /must|required|minimum|active|citizen|author/i.test(s),
    ),
    "should match at least one hard-filter pattern",
  );
});

test("buildJobModelDeterministic surfaces hidden constraints", () => {
  const result = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  const categories = result.job_model.hidden_constraints.map((c) => c.category);
  assert.ok(categories.includes("security_clearance"));
  assert.ok(categories.includes("citizenship"));
  assert.ok(categories.includes("work_authorization"));
});

test("buildJobModelDeterministic downweights boilerplate via posting_noise_score", () => {
  const result = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  // The "About Stripe" paragraph contains 3+ boilerplate sentences out of
  // ~15 total — noise score should be > 0 but < 0.5.
  assert.ok(result.job_model.posting_noise_score > 0);
  assert.ok(result.job_model.posting_noise_score < 0.5);
});

test("buildJobModelDeterministic builds an ATS keyword map", () => {
  const result = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  const norms = result.job_model.ats_keywords.map((k) => k.normalized);
  assert.ok(norms.includes("kubernetes"));
  assert.ok(norms.includes("typescript"));
});

test("buildJobModelDeterministic infers role family + seniority", () => {
  const result = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  assert.equal(result.job_model.role_family, "backend_swe");
  assert.equal(result.job_model.seniority, "ic_senior");
});

test("buildJobModelDeterministic computes a stable jd_hash", () => {
  const a = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  const b = buildJobModelDeterministic({
    jd_id: "11111111-1111-4111-8111-111111111111",
    jd_text: SAMPLE_JD,
  });
  assert.equal(a.job_model.jd_hash, b.job_model.jd_hash);
});

// ─────────────────────────────────────────────────────────────────────────────
// CompanyContextResearcher
// ─────────────────────────────────────────────────────────────────────────────

test("CompanyContextResearcher writes a skeleton model when consent is not granted", async () => {
  _resetCompanyResearchCache();
  const r = new CompanyContextResearcher();
  const result = await r.run(
    {
      blackboard: makeBlackboard(),
      tick: 0,
      trace_id: "t",
      signal: new AbortController().signal,
    },
    {
      id: "g1",
      kind: "research_company_context",
      priority: 60,
      emitted_by: "test",
      payload: { display_name: "Stripe", consent_web_research: false },
      status: "pending",
      satisfied_by: [],
      parent_goal_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  );
  assert.equal(result.writes.length, 1);
  const model = result.writes[0]?.value as {
    display_name: string;
    stale: boolean;
    fetch_consent: boolean;
  };
  assert.equal(model.display_name, "Stripe");
  assert.equal(model.stale, true);
  assert.equal(model.fetch_consent, false);
});

test("CompanyContextResearcher caches by company within TTL", async () => {
  _resetCompanyResearchCache();
  const r = new CompanyContextResearcher({
    provider: {
      capabilities: {
        structuredOutput: true,
        reasoningEffort: false,
        webSearch: true,
        fileSearch: false,
        backgroundRuns: false,
        promptCaching: false,
      },
      models: { smart: "x", fast: "x", frontier: "x" },
      createMessage: async () => ({
        content: [],
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        model: "x",
      }),
      createMessageWithTool: async () => ({}) as never,
      createStructuredOutput: async () => ({}) as never,
      createReasonedOutput: async () => ({}) as never,
      searchWeb: async () => ({
        summary: "Stripe is investing in Asia. Expanding partnerships in 2024.",
        citations: [],
        partial: false,
      }),
      searchFiles: async () => null,
      runBackground: async () => null,
      drainModelCallTelemetry: () => [],
    } as never,
    ttl_ms: 60_000,
  });

  const first = await r.run(
    {
      blackboard: makeBlackboard(),
      tick: 0,
      trace_id: "t1",
      signal: new AbortController().signal,
    },
    makeGoal({ display_name: "Stripe", consent_web_research: true }),
  );
  assert.equal(first.audit.micro_stage, "web_search");

  const second = await r.run(
    {
      blackboard: makeBlackboard(),
      tick: 1,
      trace_id: "t2",
      signal: new AbortController().signal,
    },
    makeGoal({ display_name: "Stripe", consent_web_research: true }),
  );
  assert.equal(second.audit.micro_stage, "cache_hit");
});

test("CompanyContextResearcher invalidates stale cache past TTL", async () => {
  _resetCompanyResearchCache();
  const r = new CompanyContextResearcher({
    provider: {
      capabilities: {
        structuredOutput: true,
        reasoningEffort: false,
        webSearch: true,
        fileSearch: false,
        backgroundRuns: false,
        promptCaching: false,
      },
      models: { smart: "x", fast: "x", frontier: "x" },
      createMessage: async () => ({
        content: [],
        stopReason: "end_turn",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        model: "x",
      }),
      createMessageWithTool: async () => ({}) as never,
      createStructuredOutput: async () => ({}) as never,
      createReasonedOutput: async () => ({}) as never,
      searchWeb: async () => ({ summary: "Stripe expanded.", citations: [], partial: false }),
      searchFiles: async () => null,
      runBackground: async () => null,
      drainModelCallTelemetry: () => [],
    } as never,
    ttl_ms: 1, // 1 ms TTL → second call is always stale.
  });

  await r.run(
    {
      blackboard: makeBlackboard(),
      tick: 0,
      trace_id: "t1",
      signal: new AbortController().signal,
    },
    makeGoal({ display_name: "Stripe", consent_web_research: true }),
  );
  await new Promise((r) => setTimeout(r, 5));
  const second = await r.run(
    {
      blackboard: makeBlackboard(),
      tick: 1,
      trace_id: "t2",
      signal: new AbortController().signal,
    },
    makeGoal({ display_name: "Stripe", consent_web_research: true }),
  );
  assert.equal(second.audit.micro_stage, "web_search", "should re-fetch when cache is stale");
});

// ─────────────────────────────────────────────────────────────────────────────
// JobModelBuilder specialist
// ─────────────────────────────────────────────────────────────────────────────

test("JobModelBuilder writes sota.job_model when jd_text is supplied", async () => {
  const b = new JobModelBuilder();
  const result = await b.run(
    {
      blackboard: makeBlackboard(),
      tick: 0,
      trace_id: "t",
      signal: new AbortController().signal,
    },
    makeGoal(
      { jd_text: SAMPLE_JD, jd_title: "Senior Backend Engineer", market: "US" },
      "build_job_model",
    ),
  );
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0]?.path, "sota.job_model");
});

test("JobModelBuilder skips when no jd_text is supplied", async () => {
  const b = new JobModelBuilder();
  const result = await b.run(
    {
      blackboard: makeBlackboard(),
      tick: 0,
      trace_id: "t",
      signal: new AbortController().signal,
    },
    makeGoal({}, "build_job_model"),
  );
  assert.equal(result.writes.length, 0);
  assert.equal(result.audit.micro_stage, "no_jd_text");
});

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBlackboard() {
  return {
    generation_id: "22222222-2222-4222-8222-222222222222",
    user_id: "33333333-3333-4333-8333-333333333333",
    jd_id: "44444444-4444-4444-8444-444444444444",
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
  };
}

function makeGoal(payload: Record<string, unknown>, kind = "research_company_context") {
  return {
    id: "g-1",
    kind: kind as never,
    priority: 60,
    emitted_by: "test",
    payload,
    status: "pending" as const,
    satisfied_by: [],
    parent_goal_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
