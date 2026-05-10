import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { Blackboard } from "@retune/types";
import {
  AuditTrail,
  BlackboardStore,
  GoalStack,
  TriggerBus,
  path_matches,
  read_path,
  write_path,
} from "../src/workbench";

function empty_blackboard(): Blackboard {
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

test("write_path / read_path round-trip on a nested key", () => {
  const root = { a: { b: { c: 1 } } };
  const next = write_path(root, "a.b.c", 42);
  assert.equal(read_path(next, "a.b.c"), 42);
  // Original is untouched (immutability).
  assert.equal(read_path(root, "a.b.c"), 1);
});

test("write_path creates missing path segments", () => {
  const root = { a: 1 };
  const next = write_path(root, "x.y.z", "hello");
  assert.equal(read_path(next, "x.y.z"), "hello");
  assert.equal(read_path(next, "a"), 1);
});

test("path_matches handles exact, single-wildcard, and double-wildcard globs", () => {
  assert.equal(path_matches("draft.bullets.abc", "draft.bullets.abc"), true);
  assert.equal(path_matches("draft.bullets.abc", "draft.bullets.*"), true);
  assert.equal(path_matches("draft.bullets.abc.text", "draft.bullets.*"), false);
  assert.equal(path_matches("draft.bullets.abc.text", "draft.bullets.**"), true);
  assert.equal(path_matches("hypotheses.role_schema", "hypotheses.*"), true);
  assert.equal(path_matches("anything.deep.nested.thing", "**"), true);
});

test("BlackboardStore.commit emits one event per write and appends audit entry", async () => {
  const bus = new TriggerBus();
  const store = new BlackboardStore(empty_blackboard(), bus);
  const trail = new AuditTrail();

  const events: string[] = [];
  bus.subscribe({
    id: "test-listener",
    path_glob: "draft.**",
    listener_kind: "telemetry",
    on_event(ev) {
      events.push(`${ev.type}:${ev.path}`);
    },
  });

  const audit_entry = trail.append({
    specialist: "test_specialist",
    inputs_hash: "abc",
    output_hash: "def",
    latency_ms: 10,
    cost_usd: 0,
    writes: ["draft.summary"],
  });

  await store.commit({
    by_specialist: "test_specialist",
    writes: [{ path: "draft.summary", value: "hello world" }],
    audit_entry,
  });

  assert.deepEqual(events, ["write:draft.summary"]);
  assert.equal(store.get("draft.summary"), "hello world");
});

test("snapshots are deep-frozen — specialist code cannot mutate working memory", () => {
  const bus = new TriggerBus();
  const store = new BlackboardStore(empty_blackboard(), bus);
  const snap = store.snapshot();
  assert.throws(() => {
    (snap as { generation_id: string }).generation_id = "tamper";
  });
  assert.throws(() => {
    (snap.cost_budget as { spent_usd: number }).spent_usd = 999;
  });
});

test("GoalStack peek_next prefers higher priority then earlier created_at", async () => {
  const stack = new GoalStack();
  const a = stack.add({ kind: "analyze_jd", priority: 50, emitted_by: "orch" });
  // Force a small delay so created_at differs deterministically.
  await new Promise((r) => setTimeout(r, 5));
  const b = stack.add({ kind: "analyze_profile", priority: 80, emitted_by: "orch" });
  await new Promise((r) => setTimeout(r, 5));
  const _c = stack.add({ kind: "analyze_company", priority: 80, emitted_by: "orch" });

  const next = stack.peek_next();
  assert.equal(next?.id, b.id, "highest priority + earliest created_at wins");

  stack.mark_in_progress(b.id);
  stack.mark_satisfied(b.id, "test_specialist");
  assert.equal(stack.list({ status: "satisfied" }).length, 1);
  assert.equal(stack.list({ status: "pending" }).length, 2);
  assert.equal(stack.peek_next()?.kind, "analyze_company");
  // a is still pending, lower priority.
  assert.equal(stack.get(a.id)?.status, "pending");
});

test("AuditTrail aggregates cost by specialist", () => {
  const trail = new AuditTrail();
  trail.append({
    specialist: "alpha",
    inputs_hash: "1",
    output_hash: "1",
    latency_ms: 1,
    cost_usd: 0.001,
    writes: [],
  });
  trail.append({
    specialist: "alpha",
    inputs_hash: "2",
    output_hash: "2",
    latency_ms: 1,
    cost_usd: 0.002,
    writes: [],
  });
  trail.append({
    specialist: "beta",
    inputs_hash: "3",
    output_hash: "3",
    latency_ms: 1,
    cost_usd: 0.005,
    writes: [],
  });

  assert.equal(trail.list().length, 3);
  assert.equal(trail.list()[0]?.seq, 0);
  assert.equal(trail.list()[2]?.seq, 2);
  assert.equal(Math.round(trail.total_cost_usd() * 1000), 8); // 0.001 + 0.002 + 0.005
  const by = trail.cost_by_specialist();
  assert.ok(Math.abs((by.alpha ?? 0) - 0.003) < 1e-9);
  assert.ok(Math.abs((by.beta ?? 0) - 0.005) < 1e-9);
});
