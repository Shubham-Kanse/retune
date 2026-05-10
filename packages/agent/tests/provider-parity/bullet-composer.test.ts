/**
 * Provider parity — SequentialBulletComposer.
 *
 * Per-bullet LLM call (Sonnet/gpt-4o) with forced tool_use; the deterministic
 * micro-pipeline around it (template/verb chooser, post-checks) is identical
 * across providers. Given the same fixture LLM response, the composer must
 * produce identical bullet writes.
 *
 * Random `randomUUID()`-generated bullet IDs are normalised to `<uuid>` by
 * `canonicalWrites` (see _helpers.ts).
 *
 * Acceptance: technical-2.0 §4.4, §20 (Phase 1).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { intervalConfidence } from "@retune/types";
import { SequentialBulletComposer } from "../../src/sota-exports";
import type { SolverSolution } from "../../src/specialists/evidence-solver";
import { canonicalWrites, emptyBlackboard, makeGoal, runWithBothProviders } from "./_helpers";

const SPAN_A = "11111111-1111-4111-8111-111111111111";

// Fixture text:
//  - starts with "Led" (matches first verb chooser pick for strong/mid role)
//  - no digits → bypasses honesty post-check fabrication trap
//  - no banned-phrase opening, > 80 chars
const FIXTURE = {
  text: "Led design and rollout of a typed configuration framework adopted by every backend service team within the platform organisation.",
  reasoning: "XYZ template; metric-led; verb 'Led' from strong tier.",
};

test("SequentialBulletComposer produces identical bullet writes on Anthropic vs OpenAI", async () => {
  const buildBlackboard = () => {
    const bb = emptyBlackboard();
    bb.evidence_graph = { span_ids: [SPAN_A], requirement_matches: [] };
    const solver: SolverSolution = {
      bullets: [
        {
          bullet_index: 0,
          section_hint: "experience",
          assignments: [
            {
              requirement_id: "req-1",
              requirement_text: "design distributed systems",
              assigned_span_ids: [SPAN_A],
              confidence: 0.85,
              weight: 1.0,
              disposition: "direct_hit",
              transfer_path: null,
              arc_alignment_score: 0.8,
            },
          ],
          total_weight: 1.0,
          dominant_claim_type: "scope",
          verb_quality_floor: "strong",
        },
      ],
      total_coverage: 1.0,
      total_weight: 1.0,
      weighted_coverage: 1.0,
      hard_constraints_satisfied: true,
      uncovered_hard_requirements: [],
      dropped_soft_requirements: [],
      and_group_violations: [],
      or_group_violations: [],
      solver_stats: {
        iterations: 1,
        branches_pruned: 0,
        propagation_steps: 0,
        upper_bound: 1.0,
        solution_gap_pct: 0,
        solve_time_ms: 1,
        optimal: true,
      },
    };
    (bb.evidence_graph as unknown as { solver_solution: SolverSolution }).solver_solution = solver;
    bb.hypotheses = {
      ...bb.hypotheses,
      role_schema: {
        canonical_id: "swe_mid",
        display_name: "Software Engineer",
        level: "mid",
        yoe_band: [3, 5],
        required_skills: [],
        adjacent_domains: [],
      } as never,
      chosen_narrative_arc: {
        archetype: "deep_specialist",
        thesis: "Backend platform engineer focused on developer-experience.",
        lead_evidence_span_ids: [SPAN_A],
        feasibility: intervalConfidence(0.78, 0.7, 0.86, 0.95),
      },
    };
    return bb;
  };

  const goal = makeGoal("compose_resume");

  const { anthropic, openai } = await runWithBothProviders({
    specialist: new SequentialBulletComposer(),
    buildBlackboard,
    goal,
    fixture: FIXTURE,
  });

  assert.deepEqual(canonicalWrites(anthropic), canonicalWrites(openai));

  // Both must have produced exactly one bullet write + one section write.
  const bulletWrites = anthropic.writes.filter((w) => w.path.startsWith("draft.bullets."));
  assert.equal(bulletWrites.length, 1);
  const bullet = bulletWrites[0]!.value as { text: string; honesty_post_check_passed: boolean };
  assert.equal(bullet.text, FIXTURE.text);
  assert.equal(bullet.honesty_post_check_passed, true);

  // Audit micro_stage matches across providers.
  assert.equal(anthropic.audit.micro_stage, openai.audit.micro_stage);
  assert.notEqual(anthropic.audit.model_version, openai.audit.model_version);
});
