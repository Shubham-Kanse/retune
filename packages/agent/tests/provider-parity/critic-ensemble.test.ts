/**
 * Provider parity — CriticEnsemble.
 *
 * Three parallel Haiku/gpt-4o-mini calls; each must produce the same
 * critic_verdict structure on both providers given identical fixtures.
 *
 * The test fixture is constructed so that the three critics CONVERGE
 * (no divergence, no conflict, no random UUIDs) — keeping the comparison
 * fully deterministic.
 *
 * Acceptance: technical-2.0 §4.4, §20 (Phase 1).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { intervalConfidence } from "@retune/types";
import { CriticEnsemble } from "../../src/sota-exports";
import { canonicalWrites, emptyBlackboard, makeGoal, runWithBothProviders } from "./_helpers";

const SPAN_A = "11111111-1111-4111-8111-111111111111";

const CONVERGENT_VERDICT = {
  preferred_arc: "deep_specialist",
  score: 82,
  reasoning:
    "Strong production depth, clear quantified outcomes, narrative coherent for senior IC role.",
  top_concern: null,
  confidence: 0.88,
};

test("CriticEnsemble produces identical writes on Anthropic vs OpenAI (convergent)", async () => {
  const buildBlackboard = () => {
    const bb = emptyBlackboard();
    const arc = {
      archetype: "deep_specialist" as const,
      thesis: "Senior MLE who scales production systems.",
      lead_evidence_span_ids: [SPAN_A],
      feasibility: intervalConfidence(0.78, 0.7, 0.86, 0.95),
    };
    bb.hypotheses = {
      ...bb.hypotheses,
      narrative_arcs_candidates: [arc],
      chosen_narrative_arc: arc,
      role_schema: {
        canonical_id: "ml_engineer_senior",
        display_name: "Senior ML Engineer",
        level: "senior",
        yoe_band: [5, 9],
        required_skills: [],
        adjacent_domains: [],
      } as never,
      cultural_vector: [0.4, 0.2, 0.6, 0.1, 0.3, 0.5, 0.2, 0.4],
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
    specialist: new CriticEnsemble(),
    buildBlackboard,
    goal,
    fixture: CONVERGENT_VERDICT,
  });

  // Convergent fixture → no chosen_narrative_arc override, no conflict.
  // The single write is critic_ensemble_result (no random UUIDs/timestamps inside).
  assert.deepEqual(canonicalWrites(anthropic), canonicalWrites(openai));

  const paths = anthropic.writes.map((w) => w.path);
  assert.deepEqual(paths, ["hypotheses.critic_ensemble_result"]);

  // Audit micro_stage matches; model_version differs by design.
  assert.equal(anthropic.audit.micro_stage, openai.audit.micro_stage);
  assert.notEqual(anthropic.audit.model_version, openai.audit.model_version);
});
