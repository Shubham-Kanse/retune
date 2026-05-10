/**
 * Failure mode: provider auth failure (prd-2.0 §9, failure #2).
 *
 * Verifies that 4xx client errors (auth failures) are NOT retried
 * and surface immediately as non-retryable errors.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { MLClientError } from "../src/ml-client/errors";
import { DEFAULT_RETRY_POLICY, with_retries } from "../src/ml-client/retry-policy";

test("401 auth errors are not retried", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  await assert.rejects(
    () =>
      with_retries(() => {
        attempts++;
        throw new MLClientError("client_4xx", "Unauthorized", 401);
      }, policy),
    (err: MLClientError) => {
      assert.equal(err.kind, "client_4xx");
      assert.equal(err.status, 401);
      return true;
    },
  );

  assert.equal(attempts, 1, "should not retry auth failures");
});

test("403 forbidden errors are not retried", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  await assert.rejects(
    () =>
      with_retries(() => {
        attempts++;
        throw new MLClientError("client_4xx", "Forbidden", 403);
      }, policy),
    (err: MLClientError) => {
      assert.equal(err.kind, "client_4xx");
      assert.equal(err.status, 403);
      return true;
    },
  );

  assert.equal(attempts, 1, "should not retry forbidden errors");
});

test("validation errors are not retried", async () => {
  let attempts = 0;
  const policy = { ...DEFAULT_RETRY_POLICY, base_delay_ms: 1, max_delay_ms: 5 };

  await assert.rejects(
    () =>
      with_retries(() => {
        attempts++;
        throw new MLClientError("validation", "response failed schema validation");
      }, policy),
    (err: MLClientError) => {
      assert.equal(err.kind, "validation");
      return true;
    },
  );

  assert.equal(attempts, 1, "should not retry validation errors");
});

test("MLClientError.is_retryable() correctly classifies error kinds", () => {
  assert.equal(new MLClientError("server_5xx", "err", 500).is_retryable(), true);
  assert.equal(new MLClientError("transport", "err").is_retryable(), true);
  assert.equal(new MLClientError("timeout", "err").is_retryable(), true);
  assert.equal(new MLClientError("client_4xx", "err", 401).is_retryable(), false);
  assert.equal(new MLClientError("validation", "err").is_retryable(), false);
  assert.equal(new MLClientError("aborted", "err").is_retryable(), false);
});
