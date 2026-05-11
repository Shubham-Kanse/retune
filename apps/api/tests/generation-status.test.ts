import assert from "node:assert/strict";
import test from "node:test";
import {
  completionFromDone,
  completionFromError,
  resultStatusFromMeta,
  statusFromPersistenceRow,
} from "../src/lib/generation-status";

test("statusFromPersistenceRow maps row state to run status", () => {
  assert.equal(statusFromPersistenceRow({ completed_at: null, termination: null }), "running");
  assert.equal(
    statusFromPersistenceRow({ completed_at: new Date(), termination: "no_open_work" }),
    "completed",
  );
  assert.equal(
    statusFromPersistenceRow({ completed_at: new Date(), termination: "cancelled" }),
    "cancelled",
  );
  assert.equal(
    statusFromPersistenceRow({ completed_at: new Date(), termination: "aborted" }),
    "cancelled",
  );
  assert.equal(statusFromPersistenceRow({ completed_at: new Date(), termination: "error" }), "failed");
});

test("completion mappers emit typed completion payload", () => {
  const done = completionFromDone({
    termination: "no_open_work",
    ticks_executed: 12,
    total_cost_usd: 0.01,
    total_latency_ms: 1234,
  });
  assert.equal(done.status, "completed");
  assert.equal(done.error_message, null);

  const failed = completionFromError("boom");
  assert.equal(failed.status, "failed");
  assert.equal(failed.termination, "error");
  assert.equal(failed.error_message, "boom");
});

test("resultStatusFromMeta preserves existing result-page semantics", () => {
  assert.equal(resultStatusFromMeta({ verdict: "ship", termination: null }), "complete");
  assert.equal(resultStatusFromMeta({ verdict: "revise", termination: null }), "complete");
  assert.equal(resultStatusFromMeta({ verdict: "refuse", termination: null }), "refused");
  assert.equal(resultStatusFromMeta({ verdict: null, termination: null }), "running");
  assert.equal(resultStatusFromMeta({ verdict: null, termination: "no_open_work" }), "complete");
  assert.equal(resultStatusFromMeta({ verdict: null, termination: "error" }), "error");
});

