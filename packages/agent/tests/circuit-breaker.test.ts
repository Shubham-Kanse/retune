/**
 * Circuit breaker — trip / fast-reject / probe / close, the failure
 * classifier (auth errors don't trip), and the LLM breaker translation
 * to a `circuit_open` LlmError.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  CircuitBreaker,
  CircuitBreakerState,
  CircuitOpenError,
  isTransientError,
} from "../src/error-handling/error-recovery";
import { _resetEgressBreakers, withLlmBreaker } from "../src/lib/egress-breakers";
import { LlmError } from "../src/lib/llm-error";

const transient = () => Object.assign(new Error("503 service unavailable"), { status: 503 });
const authErr = () => new LlmError("bad key", "auth_failed", "anthropic");

test("trips to OPEN after failureThreshold counted failures", async () => {
  const b = new CircuitBreaker({ failureThreshold: 3, timeoutMs: 1000, name: "t" });
  for (let i = 0; i < 3; i++) {
    await assert.rejects(b.execute(() => Promise.reject(transient())));
  }
  assert.equal(b.getState(), CircuitBreakerState.OPEN);
});

test("OPEN rejects fast with CircuitOpenError without calling fn", async () => {
  const b = new CircuitBreaker({ failureThreshold: 1, timeoutMs: 10_000, name: "t" });
  await assert.rejects(b.execute(() => Promise.reject(transient())));
  let called = false;
  await assert.rejects(
    b.execute(() => {
      called = true;
      return Promise.resolve("x");
    }),
    (e: unknown) => e instanceof CircuitOpenError,
  );
  assert.equal(called, false, "fn must not run while OPEN");
});

test("probes after cooldown and CLOSES on success", async () => {
  const b = new CircuitBreaker({ failureThreshold: 1, successThreshold: 1, timeoutMs: 20, name: "t" });
  await assert.rejects(b.execute(() => Promise.reject(transient())));
  assert.equal(b.getState(), CircuitBreakerState.OPEN);
  await new Promise((r) => setTimeout(r, 30));
  const out = await b.execute(() => Promise.resolve("ok"));
  assert.equal(out, "ok");
  assert.equal(b.getState(), CircuitBreakerState.CLOSED);
});

test("half-open re-opens when the probe fails", async () => {
  const b = new CircuitBreaker({ failureThreshold: 1, successThreshold: 1, timeoutMs: 20, name: "t" });
  await assert.rejects(b.execute(() => Promise.reject(transient())));
  await new Promise((r) => setTimeout(r, 30));
  await assert.rejects(b.execute(() => Promise.reject(transient())));
  assert.equal(b.getState(), CircuitBreakerState.OPEN);
});

test("classifier: auth failures do NOT trip the breaker", async () => {
  const b = new CircuitBreaker({
    failureThreshold: 2,
    timeoutMs: 1000,
    name: "t",
    isCountedFailure: isTransientError,
  });
  // isTransientError(LlmError auth_failed) → false (no status, message not transient)
  for (let i = 0; i < 5; i++) {
    await assert.rejects(b.execute(() => Promise.reject(authErr())));
  }
  assert.equal(b.getState(), CircuitBreakerState.CLOSED, "auth errors must not open the circuit");
});

test("snapshot reports name/state/failures", async () => {
  const b = new CircuitBreaker({ failureThreshold: 5, name: "llm:test" });
  await assert.rejects(b.execute(() => Promise.reject(transient())));
  const s = b.snapshot();
  assert.equal(s.name, "llm:test");
  assert.equal(s.state, CircuitBreakerState.CLOSED);
  assert.equal(s.failures, 1);
});

test("withLlmBreaker translates an open circuit to LlmError circuit_open", async () => {
  _resetEgressBreakers();
  const prev = process.env.RETUNE_BREAKER_FAILURE_THRESHOLD;
  process.env.RETUNE_BREAKER_FAILURE_THRESHOLD = "1";
  try {
    // First call trips the breaker with a counted (5xx) failure.
    await assert.rejects(
      withLlmBreaker("anthropic", () =>
        Promise.reject(new LlmError("boom", "5xx", "anthropic")),
      ),
    );
    // Next call should fast-fail as circuit_open.
    await assert.rejects(
      withLlmBreaker("anthropic", () => Promise.resolve("never")),
      (e: unknown) => e instanceof LlmError && e.kind === "circuit_open",
    );
  } finally {
    if (prev === undefined) delete process.env.RETUNE_BREAKER_FAILURE_THRESHOLD;
    else process.env.RETUNE_BREAKER_FAILURE_THRESHOLD = prev;
    _resetEgressBreakers();
  }
});

test("withLlmBreaker: a user's bad key (auth_failed) never opens the shared breaker", async () => {
  _resetEgressBreakers();
  const prev = process.env.RETUNE_BREAKER_FAILURE_THRESHOLD;
  process.env.RETUNE_BREAKER_FAILURE_THRESHOLD = "2";
  try {
    for (let i = 0; i < 6; i++) {
      await assert.rejects(
        withLlmBreaker("openai", () => Promise.reject(new LlmError("401", "auth_failed", "openai"))),
        (e: unknown) => e instanceof LlmError && e.kind === "auth_failed",
      );
    }
    // Still closed: a real request would be attempted (here it succeeds).
    const out = await withLlmBreaker("openai", () => Promise.resolve("ok"));
    assert.equal(out, "ok");
  } finally {
    if (prev === undefined) delete process.env.RETUNE_BREAKER_FAILURE_THRESHOLD;
    else process.env.RETUNE_BREAKER_FAILURE_THRESHOLD = prev;
    _resetEgressBreakers();
  }
});
