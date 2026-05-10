/**
 * Provider parity — TheoryOfMindSpecialist.
 *
 * Given the same canonical RecruiterBeliefState fixture, the specialist
 * must produce identical blackboard writes regardless of provider
 * (Anthropic vs OpenAI). Audit `model_version` is allowed to differ.
 *
 * Acceptance: technical-2.0 §4.4, §20 (Phase 1).
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { intervalConfidence } from "@retune/types";
import { TheoryOfMindSpecialist } from "../../src/sota-exports";
import { canonicalWrites, emptyBlackboard, makeGoal, runWithBothProviders } from "./_helpers";

const FIXTURE = {
  inferred_candidate_level: "senior",
  inferred_domain: "machine_learning",
  perceived_strengths: ["production ML", "owns end-to-end", "metric-led"],
  perceived_gaps: [
    {
      topic: "GPU inference at scale",
      gap_severity: "moderate" as const,
      evidence_in_resume: false,
      recruiter_question: "What's the largest GPU fleet you've operated?",
    },
  ],
  narrative_coherence_score: 0.82,
  flight_risk_signal: "low" as const,
  overqualification_signal: false,
  hiring_intent_prediction: "likely_screen" as const,
  projected_first_question: "Walk me through the largest model you've shipped to production.",
  belief_confidence: 0.88,
};

test("TheoryOfMindSpecialist produces identical writes on Anthropic vs OpenAI", async () => {
  const lead_span = randomUUID();

  const buildBlackboard = () => {
    const bb = emptyBlackboard();
    bb.evidence_graph = {
      span_ids: [lead_span],
      requirement_matches: [],
    };
    bb.hypotheses = {
      ...bb.hypotheses,
      role_schema: {
        canonical_id: "ml_engineer_senior",
        display_name: "Senior ML Engineer",
        level: "senior",
        yoe_band: [5, 9],
        required_skills: [],
        adjacent_domains: [],
      } as never,
      chosen_narrative_arc: {
        archetype: "deep_specialist",
        thesis: "Senior ML engineer who scales production systems.",
        lead_evidence_span_ids: [lead_span],
        feasibility: intervalConfidence(0.78, 0.7, 0.86, 0.95),
      },
    };
    bb.draft = {
      ...bb.draft,
      bullets: {
        b1: { text: "Scaled ML serving from 50qps to 5kqps with sub-50ms p99 latency." },
      } as never,
    };
    return bb;
  };

  const goal = makeGoal("select_arc");

  const { anthropic, openai } = await runWithBothProviders({
    specialist: new TheoryOfMindSpecialist(),
    buildBlackboard,
    goal,
    fixture: FIXTURE,
  });

  // The blackboard write payload must be byte-identical (it's the LLM fixture).
  assert.deepEqual(canonicalWrites(anthropic), canonicalWrites(openai));

  // Sanity: we wrote the recruiter belief state.
  assert.equal(anthropic.writes.length, 1);
  assert.equal(anthropic.writes[0]!.path, "hypotheses.recruiter_belief_state");

  // Audit micro_stage agrees (model_version differs by design).
  assert.equal(anthropic.audit.micro_stage, openai.audit.micro_stage);
  assert.notEqual(anthropic.audit.model_version, openai.audit.model_version);
});
