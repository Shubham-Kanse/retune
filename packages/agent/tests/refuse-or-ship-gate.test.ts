/**
 * Tests for commit #13 — RefuseOrShipGate:
 *   - Decision matrix (ship / revise / refuse)
 *   - GDPR Article 22 audit packet structure
 *   - Submission confidence + interview-ready score
 *   - Blocking factor escalation
 *   - Child goal emission (render_documents vs request_user_input)
 *
 * Invariants proven:
 *   1.  High-quality signals → SHIP verdict
 *   2.  Low outcome → REFUSE verdict
 *   3.  Fabrication conflicts → hard REFUSE regardless of other signals
 *   4.  Low ATS coverage → hard REFUSE
 *   5.  Majority voice-drifted bullets → hard REFUSE
 *   6.  Unmet hard requirements → hard REFUSE
 *   7.  Moderate issues → REVISE verdict
 *   8.  SHIP emits render_documents child goal
 *   9.  REFUSE emits no downstream goal
 *   10. REVISE emits request_user_input goal
 *   11. GDPR packet always produced with Article 22 disclosure
 *   12. GDPR packet contains all pipeline stages from audit_trail
 *   13. Submission confidence = 0 on REFUSE
 *   14. Interview-ready score is bounded [0, 100]
 *   15. Decision is deterministic (same input → same output)
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard, GoalKind } from "@retune/types";
import {
  BlackboardStore,
  type GdprAuditPacket,
  RefuseOrShipGate,
  type ShipDecision,
  TriggerBus,
} from "../src/sota-exports";

// ──────────── Helpers ────────────

function make_store(bb: Blackboard): BlackboardStore {
  return new BlackboardStore(bb, new TriggerBus());
}

function base_blackboard(): Blackboard {
  const now = new Date().toISOString();
  return {
    generation_id: randomUUID(),
    user_id: randomUUID(),
    jd_id: randomUUID(),
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
    cost_budget: { spent_usd: 0, ceiling_usd: 0.1, hard_kill_usd: 0.5, per_specialist_spent: {} },
    audit_trail: [],
    created_at: now,
    updated_at: now,
  };
}

function make_goal(kind: GoalKind) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    kind,
    priority: 80,
    emitted_by: "orchestrator",
    status: "pending" as const,
    satisfied_by: [],
    parent_goal_id: null,
    created_at: now,
    updated_at: now,
  };
}

function set_outcome(bb: Blackboard, point: number) {
  bb.outcome_estimate = { point, lower: point - 0.1, upper: point + 0.1, coverage: 0.95 };
}

function set_gap_map(bb: Blackboard, coverage_pct: number, hard_met = 5, hard_total = 5) {
  (bb.evidence_graph as any).gap_map = {
    summary: { coverage_pct, hard_requirements_met: hard_met, hard_requirements_total: hard_total },
  };
}

function set_ensemble(bb: Blackboard, recruiter: number, hm: number) {
  (bb.hypotheses as any).critic_ensemble_result = {
    recruiter: { score: recruiter },
    hiring_manager: { score: hm },
  };
}

function add_bullets(
  bb: Blackboard,
  n: number,
  opts: { drifted?: number; failed_honesty?: number } = {},
) {
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    (bb.draft.bullets as any)[id] = {
      id,
      text: `Bullet ${i + 1}`,
      voice_drift_cosine: i < (opts.drifted ?? 0) ? 0.3 : 0.9,
      honesty_post_check_passed: i < (opts.failed_honesty ?? 0) ? false : true,
      first_impression_passed: true,
      coherence_post_check_passed: true,
    };
  }
}

function add_audit_entry(bb: Blackboard, specialist: string) {
  bb.audit_trail.push({
    seq: bb.audit_trail.length,
    specialist,
    micro_stage: "test",
    inputs_hash: "abc",
    output_hash: "def",
    justification: `ran ${specialist}`,
    latency_ms: 50,
    cost_usd: 0.001,
    timestamp: new Date().toISOString(),
    writes: [],
  });
}

// ─────────────── Verdict tests ───────────────

test("SHIP verdict with high-quality signals", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.72);
  set_gap_map(bb, 85);
  set_ensemble(bb, 78, 82);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "ship");
  assert.ok(result.new_goals?.some((g) => g.kind === "render_documents"));
});

test("REFUSE verdict when outcome is below floor", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.12);
  set_gap_map(bb, 80);
  set_ensemble(bb, 60, 65);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "refuse");
  assert.equal(result.new_goals?.length ?? 0, 0);
  assert.ok(decision.reasons.length > 0);
  assert.ok(decision.reasons[0]!.includes("below the minimum"));
});

test("REFUSE verdict on fabrication conflicts regardless of other signals", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.85); // high outcome
  set_gap_map(bb, 90);
  set_ensemble(bb, 90, 88);
  add_bullets(bb, 6);

  // Add fabrication conflict
  bb.conflicts.push({
    id: randomUUID(),
    monitor: "fabrication",
    severity: "critical",
    payload: { claim: "false metric" },
    resolved_by: null,
    resolution_log: null,
    created_at: new Date().toISOString(),
    resolved_at: null,
  });

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "refuse");
  assert.ok(decision.reasons.some((r) => r.includes("fabrication")));
});

test("REFUSE verdict when ATS coverage below 60%", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.55);
  set_gap_map(bb, 45); // 45% — below 60% floor
  set_ensemble(bb, 65, 60);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "refuse");
  assert.ok(decision.reasons.some((r) => r.includes("ATS keyword coverage")));
});

test("REFUSE verdict when majority of bullets have voice drift", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.55);
  set_gap_map(bb, 80);
  set_ensemble(bb, 70, 65);
  add_bullets(bb, 6, { drifted: 4 }); // 4/6 = 67% drifted > 50% threshold

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "refuse");
  assert.ok(decision.reasons.some((r) => r.includes("voice drift")));
});

test("REFUSE verdict when fewer than 50% of hard requirements met", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.55);
  set_gap_map(bb, 75, 1, 5); // only 1/5 hard requirements met = 20%
  set_ensemble(bb, 65, 60);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "refuse");
  assert.ok(decision.reasons.some((r) => r.includes("hard requirements")));
});

test("REVISE verdict for moderate outcome (between floors)", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.28); // above REFUSE (0.20) but below REVISE (0.35)
  set_gap_map(bb, 72);
  set_ensemble(bb, 62, 58);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "revise");
  assert.ok(result.new_goals?.some((g) => g.kind === "request_user_input"));
  assert.ok(decision.revise_suggestions.length > 0);
});

test("REVISE emits request_user_input with question payload", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.28);
  set_gap_map(bb, 72);
  set_ensemble(bb, 62, 58);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const user_goal = result.new_goals?.find((g) => g.kind === "request_user_input");
  assert.ok(user_goal);
  assert.ok(user_goal!.payload?.question);
});

// ─────────────── GDPR audit packet ───────────────

test("GDPR audit packet is always written", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.12); // REFUSE case
  set_gap_map(bb, 80);
  set_ensemble(bb, 60, 55);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const gdpr_write = result.writes.find((w) => w.path === "hypotheses.gdpr_audit_packet");
  assert.ok(gdpr_write);
  const packet = gdpr_write!.value as GdprAuditPacket;
  assert.ok(packet.article_22_disclosure.includes("GDPR Article 22"));
  assert.ok(packet.appeal_instructions.includes("contest"));
  assert.ok(packet.data_used.length > 0);
  assert.ok(packet.decision_factors.length > 0);
});

test("GDPR packet contains generation_id and user_id", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.7);
  set_gap_map(bb, 80);
  set_ensemble(bb, 75, 72);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const packet = result.writes.find((w) => w.path === "hypotheses.gdpr_audit_packet")!
    .value as GdprAuditPacket;
  assert.equal(packet.generation_id, bb.generation_id);
  assert.equal(packet.user_id, bb.user_id);
});

test("GDPR packet pipeline_stages populated from audit_trail", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.7);
  set_gap_map(bb, 80);
  set_ensemble(bb, 75, 72);
  add_bullets(bb, 6);
  add_audit_entry(bb, "gap_mapper");
  add_audit_entry(bb, "evidence_solver");
  add_audit_entry(bb, "outcome_predictor");

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const packet = result.writes.find((w) => w.path === "hypotheses.gdpr_audit_packet")!
    .value as GdprAuditPacket;
  assert.equal(packet.pipeline_stages.length, 3);
  assert.equal(packet.pipeline_stages[0]!.specialist_id, "gap_mapper");
});

test("GDPR packet plain_language_summary is present", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.65);
  set_gap_map(bb, 82);
  set_ensemble(bb, 70, 68);
  add_bullets(bb, 6);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const packet = result.writes.find((w) => w.path === "hypotheses.gdpr_audit_packet")!
    .value as GdprAuditPacket;
  assert.ok(packet.plain_language_summary.length > 50);
});

// ─────────────── Quality scores ───────────────

test("Submission confidence = 0 on REFUSE", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.1);
  set_gap_map(bb, 80);
  set_ensemble(bb, 55, 50);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

  const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
    .value as ShipDecision;
  assert.equal(decision.verdict, "refuse");
  assert.equal(decision.submission_confidence, 0);
});

test("Interview-ready score is bounded [0, 100]", async () => {
  const gate = new RefuseOrShipGate();

  for (const [outcome, recruiter, hm, coverage] of [
    [0.05, 20, 15, 30],
    [0.9, 95, 92, 95],
    [0.5, 50, 55, 70],
  ]) {
    const bb = base_blackboard();
    set_outcome(bb, outcome as number);
    set_gap_map(bb, coverage as number);
    set_ensemble(bb, recruiter as number, hm as number);
    add_bullets(bb, 5);

    const store = make_store(bb);
    const ctx = {
      blackboard: store.snapshot(),
      tick: 10,
      trace_id: randomUUID(),
      signal: AbortSignal.timeout(5000),
    };
    const result = await gate.run(ctx, make_goal("decide_refuse_or_ship"));

    const decision = result.writes.find((w) => w.path === "hypotheses.ship_decision")!
      .value as ShipDecision;
    assert.ok(decision.interview_ready_score >= 0);
    assert.ok(decision.interview_ready_score <= 100);
  }
});

test("Decision is deterministic — same input same output", async () => {
  const gate = new RefuseOrShipGate();
  const bb = base_blackboard();
  set_outcome(bb, 0.6);
  set_gap_map(bb, 78);
  set_ensemble(bb, 70, 68);
  add_bullets(bb, 5);

  const store = make_store(bb);
  const ctx = {
    blackboard: store.snapshot(),
    tick: 10,
    trace_id: randomUUID(),
    signal: AbortSignal.timeout(5000),
  };
  const goal = make_goal("decide_refuse_or_ship");

  const r1 = await gate.run(ctx, goal);
  const r2 = await gate.run(ctx, goal);

  const d1 = r1.writes.find((w) => w.path === "hypotheses.ship_decision")!.value as ShipDecision;
  const d2 = r2.writes.find((w) => w.path === "hypotheses.ship_decision")!.value as ShipDecision;

  assert.equal(d1.verdict, d2.verdict);
  assert.equal(d1.submission_confidence, d2.submission_confidence);
  assert.equal(d1.interview_ready_score, d2.interview_ready_score);
});

// ─────────────── Structural ───────────────

test("RefuseOrShipGate handles decide_refuse_or_ship goal kind", () => {
  const gate = new RefuseOrShipGate();
  assert.ok(gate.handles_goal_kinds.includes("decide_refuse_or_ship"));
  assert.equal(gate.brain_region, "locus_coeruleus_amygdala");
  assert.equal(gate.id, "refuse_or_ship_gate");
  assert.equal(gate.estimated_cost_usd, 0);
});
