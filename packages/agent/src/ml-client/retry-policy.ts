/**
 * Retry policy for the ML client.
 *
 * Exponential backoff with full jitter. Applied only to retryable errors
 * (transport, timeout, 5xx). Client errors (4xx, validation) are not
 * retried — they indicate a bug, not a transient failure.
 */

import { MLClientError } from "./errors";

export interface RetryPolicy {
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
  jitter: "full" | "none";
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  max_attempts: 3,
  base_delay_ms: 200,
  max_delay_ms: 5_000,
  jitter: "full",
};

export async function with_retries<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  signal?: AbortSignal,
): Promise<T> {
  let last_err: unknown;
  for (let attempt = 0; attempt < policy.max_attempts; attempt++) {
    if (signal?.aborted) {
      throw new MLClientError("aborted", "request aborted", undefined, signal.reason);
    }
    try {
      return await fn();
    } catch (err) {
      last_err = err;
      const retryable = err instanceof MLClientError && err.is_retryable();
      const last_attempt = attempt === policy.max_attempts - 1;
      if (!retryable || last_attempt) throw err;
      const delay = compute_delay(attempt, policy);
      await sleep(delay, signal);
    }
  }
  // Unreachable, but TS narrowing requires this.
  throw last_err;
}

function compute_delay(attempt: number, policy: RetryPolicy): number {
  const exp = Math.min(policy.max_delay_ms, policy.base_delay_ms * 2 ** attempt);
  if (policy.jitter === "none") return exp;
  return Math.floor(Math.random() * exp);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new MLClientError("aborted", "aborted during backoff"));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", on_abort);
      resolve();
    }, ms);
    const on_abort = (): void => {
      clearTimeout(t);
      reject(new MLClientError("aborted", "aborted during backoff"));
    };
    signal?.addEventListener("abort", on_abort, { once: true });
  });
}
