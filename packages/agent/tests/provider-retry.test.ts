/**
 * Failure mode: provider 5xx retry (prd-2.0 §9, failure #1).
 *
 * Verifies that retryable 5xx errors are retried up to max_attempts
 * with exponential backoff, and that the final failure is surfaced.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { MLClientError } from "../src/ml-client/errors";
import { DEFAULT_RETRY_POLICY, with_retries } from "../src/ml-client/retry-policy";

test("5xx errors are retried up to max_attempts then thrown", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  await assert.rejects(
    () =>
      with_retries(() => {
        attempts++;
        throw new MLClientError("server_5xx", "Internal Server Error", 500);
      }, policy),
    (err: MLClientError) => {
      assert.equal(err.kind, "server_5xx");
      return true;
    },
  );

  assert.equal(attempts, policy.max_attempts);
});

test("5xx recovers on second attempt", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  const result = await with_retries(() => {
    attempts++;
    if (attempts < 2) throw new MLClientError("server_5xx", "Service Unavailable", 503);
    return Promise.resolve("ok");
  }, policy);

  assert.equal(result, "ok");
  assert.equal(attempts, 2);
});

test("transport errors are retried", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  await assert.rejects(
    () =>
      with_retries(() => {
        attempts++;
        throw new MLClientError("transport", "connection reset");
      }, policy),
    (err: MLClientError) => {
      assert.equal(err.kind, "transport");
      return true;
    },
  );

  assert.equal(attempts, 3);
});

test("timeout errors are retried", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  const result = await with_retries(() => {
    attempts++;
    if (attempts < 3) throw new MLClientError("timeout", "request timed out");
    return Promise.resolve(42);
  }, policy);

  assert.equal(result, 42);
  assert.equal(attempts, 3);
});
