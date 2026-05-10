/**
 * Failure mode: ML server down — fallback heuristics (prd-2.0 §9, failure #3).
 *
 * When the ML client cannot reach the gRPC/HTTP inference server,
 * the pipeline should degrade gracefully using heuristic fallbacks
 * rather than crashing entirely.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { MLClientError } from "../src/ml-client/errors";
import { DEFAULT_RETRY_POLICY, with_retries } from "../src/ml-client/retry-policy";

test("transport failure exhausts retries then throws", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  await assert.rejects(
    () =>
      with_retries(() => {
        attempts++;
        throw new MLClientError("transport", "ECONNREFUSED 127.0.0.1:50051");
      }, policy),
    (err: MLClientError) => {
      assert.equal(err.kind, "transport");
      assert.ok(err.message.includes("ECONNREFUSED"));
      return true;
    },
  );

  assert.equal(attempts, 3, "should retry transport errors");
});

test("transport error retains cause for diagnostics", async () => {
  const cause = new Error("underlying socket closed");
  const err = new MLClientError("transport", "connection lost", undefined, cause);

  assert.equal(err.is_retryable(), true);
  assert.equal(err.cause_err, cause);
  assert.equal(err.kind, "transport");
});

test("fallback pattern: caller catches MLClientError and returns default", async () => {
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 2, max_attempts: 2 };

  async function call_with_fallback(): Promise<{ score: number; fallback: boolean }> {
    try {
      await with_retries(() => {
        throw new MLClientError("transport", "server unreachable");
      }, policy);
      return { score: 0.85, fallback: false };
    } catch (err) {
      if (err instanceof MLClientError && err.kind === "transport") {
        return { score: 0.5, fallback: true };
      }
      throw err;
    }
  }

  const result = await call_with_fallback();
  assert.equal(result.fallback, true);
  assert.equal(result.score, 0.5);
});

test("DNS resolution failure is classified as transport", () => {
  const err = new MLClientError("transport", "getaddrinfo ENOTFOUND ml.internal");
  assert.equal(err.is_retryable(), true);
  assert.equal(err.kind, "transport");
});
