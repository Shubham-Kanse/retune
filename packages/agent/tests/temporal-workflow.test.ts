/**
 * Temporal workflow integration tests.
 *
 * Boots a real Temporal dev-server (time-skipping mode, no external
 * dependency) via `@temporalio/testing`, wires the activities against
 * pglite, registers the runGenerationWorkflow, and exercises:
 *
 *   1. Happy path — known title + company → completes without signals.
 *   2. Answer-loop — unknown title → workflow suspends → client signals
 *      → workflow resumes → second pass resolves the corrected title.
 *   3. Query — `getStatus` returns the right state transitions.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { active_questions, jds } from "@retune/db/pg";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { eq } from "drizzle-orm";
import {
  COGNITIVE_TASK_QUEUE,
  getStatusQuery,
  make_activities,
  runGenerationWorkflow,
  userAnsweredSignal,
} from "../src/temporal";
import { build_pglite_harness } from "./helpers/pglite-harness";

// Shared env — one Temporal dev-server per test file (boot cost ~3s).
let env: TestWorkflowEnvironment | null = null;

async function get_env(): Promise<TestWorkflowEnvironment> {
  // Time-skipping mode uses the embedded Rust dev server — no binary
  // download or external dependency. Workflow timers also fast-forward.
  if (!env) env = await TestWorkflowEnvironment.createTimeSkipping();
  return env;
}

// tsx runs ESM; `require.resolve` isn't defined. Resolve paths against
// `import.meta.url` instead.
const workflows_path = new URL("../src/temporal/workflows/index.ts", import.meta.url).pathname;

test("happy path: workflow completes without user input", async () => {
  const [h, env_] = await Promise.all([build_pglite_harness(), get_env()]);
  try {
    const jd_id = randomUUID();
    await h.db.insert(jds).values({
      id: jd_id,
      source: "test",
      content_hash: "abc",
      raw_text: "seed",
    });

    const worker = await Worker.create({
      connection: env_.nativeConnection,
      taskQueue: COGNITIVE_TASK_QUEUE,
      workflowsPath: workflows_path,
      activities: make_activities({ db: h.db, persistence: h.persistence }),
    });

    const generation_id = randomUUID();
    const result = await worker.runUntil(
      env_.client.workflow.execute(runGenerationWorkflow, {
        taskQueue: COGNITIVE_TASK_QUEUE,
        workflowId: `retune-${generation_id}`,
        args: [
          {
            generation_id,
            user_id: h.user_id,
            jd_id,
            jd_title: "Senior Software Engineer",
            company: "Stripe",
          },
        ],
      }),
    );

    assert.equal(result.termination, "no_open_work");
    assert.equal(result.loops, 1);
    assert.ok(result.ticks_executed_total >= 2);

    // Verify state persisted through the workflow path. The pipeline runs
    // many specialists per generation (JD span extraction, discourse
    // classification, gap mapping, schema retrieval, ...). We only assert
    // that ≥ 2 audit entries persisted; the exact count is incidental.
    const replayed = await h.persistence.load(generation_id);
    if (!replayed) throw new Error("replayed must exist");
    assert.equal(replayed.termination, "no_open_work");
    assert.ok(
      replayed.audit_entries.length >= 2,
      `expected ≥2 audit entries, got ${replayed.audit_entries.length}`,
    );
    // ticks_executed_total may exceed audit_entries.length: some ticks
    // (e.g. refused / no-op specialist outcomes) don't append an audit
    // row. We only assert the audit log is non-empty and bounded above.
    assert.ok(
      replayed.audit_entries.length <= result.ticks_executed_total,
      `audit_entries (${replayed.audit_entries.length}) > ticks_total (${result.ticks_executed_total})`,
    );
  } finally {
    await h.close();
  }
});

test("answer-loop: unknown title → signal → resume → completes", async () => {
  const [h, env_] = await Promise.all([build_pglite_harness(), get_env()]);
  try {
    const jd_id = randomUUID();
    await h.db.insert(jds).values({
      id: jd_id,
      source: "test",
      content_hash: "abc",
      raw_text: "seed",
    });

    const worker = await Worker.create({
      connection: env_.nativeConnection,
      taskQueue: COGNITIVE_TASK_QUEUE,
      workflowsPath: workflows_path,
      activities: make_activities({ db: h.db, persistence: h.persistence }),
    });

    const generation_id = randomUUID();

    const outcome = await worker.runUntil(async () => {
      // Start the workflow with an unresolvable title.
      const handle = await env_.client.workflow.start(runGenerationWorkflow, {
        taskQueue: COGNITIVE_TASK_QUEUE,
        workflowId: `retune-${generation_id}`,
        args: [
          {
            generation_id,
            user_id: h.user_id,
            jd_id,
            jd_title: "Chief Vibes Officer", // not in seed ontology
          },
        ],
      });

      // Poll for the workflow to reach awaiting_user_answer.
      for (let attempt = 0; attempt < 20; attempt++) {
        const snapshot = await handle.query(getStatusQuery);
        if (snapshot.status === "awaiting_user_answer") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const mid = await handle.query(getStatusQuery);
      assert.equal(mid.status, "awaiting_user_answer");

      // The active_questions row should exist at this point.
      const aq = (
        await h.db
          .select()
          .from(active_questions)
          .where(eq(active_questions.generation_id, generation_id))
      )[0];
      if (!aq) throw new Error("active_question not recorded");
      assert.match(aq.question, /canonical role family/i);

      // Signal the answer.
      await handle.signal(userAnsweredSignal, {
        question_id: aq.id,
        answer_text: "Senior Software Engineer",
      });

      // Wait for the workflow to complete.
      return handle.result();
    });

    assert.equal(outcome.termination, "no_open_work");
    assert.ok(outcome.loops >= 2, `expected ≥2 loops, got ${outcome.loops}`);

    // Final replayed state: both original subgoal and parent satisfied.
    const replayed = await h.persistence.load(generation_id);
    if (!replayed) throw new Error("replayed must exist");
    assert.equal(replayed.termination, "no_open_work");
    assert.ok(
      replayed.goals.some((g) => g.kind === "analyze_jd" && g.status === "satisfied"),
      "original analyze_jd goal should be satisfied after answer loop",
    );
    // Role schema resolved to the canonical Senior SWE.
    const role = replayed.blackboard.hypotheses.role_schema as { canonical_role_id: string } | null;
    assert.equal(role?.canonical_role_id, "role.swe.senior");

    // The active_question was marked answered.
    const aq_final = (
      await h.db
        .select()
        .from(active_questions)
        .where(eq(active_questions.generation_id, generation_id))
    )[0];
    assert.ok(aq_final?.answered_at);
    assert.equal(aq_final?.answer_text, "Senior Software Engineer");
  } finally {
    await h.close();
  }
});

test.after(async () => {
  if (env) {
    await env.teardown();
    env = null;
  }
});
