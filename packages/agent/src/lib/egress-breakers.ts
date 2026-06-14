/**
 * Process-singleton circuit breakers for outbound dependencies.
 *
 * One breaker per dependency name, shared across all generations on the
 * instance. Thresholds are env-tunable with safe defaults; unset env
 * preserves permissive behaviour.
 *
 * LLM provider breakers use the transient-error classifier so a single
 * user's bad BYOK key (a 401/403) never counts toward tripping a breaker
 * shared by everyone — only genuine provider trouble (timeouts, 429/529,
 * 5xx, connection errors) opens the circuit.
 */

import { CircuitBreaker, isTransientError } from "../error-handling/error-recovery";
import { LlmError, type LlmProvider } from "./llm-error";

/**
 * LLM failures that count toward tripping a provider breaker: genuine
 * provider trouble only. Auth failures (a user's bad BYOK key) and
 * content bugs (malformed/tool_call_missing) must NOT open a breaker
 * shared across users.
 */
function isCountedLlmFailure(error: Error): boolean {
  if (error instanceof LlmError) return error.kind === "rate_limit" || error.kind === "5xx";
  return isTransientError(error);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function breakerConfig() {
  return {
    failureThreshold: envInt("RETUNE_BREAKER_FAILURE_THRESHOLD", 5),
    timeoutMs: envInt("RETUNE_BREAKER_COOLDOWN_MS", 30_000),
    successThreshold: 1,
  };
}

const _breakers = new Map<string, CircuitBreaker>();

/**
 * Get-or-create the singleton breaker for `name`. LLM/ML egress passes
 * `transientOnly: true` so non-transient errors don't trip the shared
 * circuit.
 */
export function egressBreaker(name: string, transientOnly = true): CircuitBreaker {
  let b = _breakers.get(name);
  if (!b) {
    b = new CircuitBreaker({
      ...breakerConfig(),
      name,
      isCountedFailure: transientOnly ? isTransientError : undefined,
    });
    _breakers.set(name, b);
  }
  return b;
}

/**
 * Run an LLM provider call through the provider's shared breaker. When
 * the breaker is open, the raw `CircuitOpenError` is translated to a
 * typed `LlmError` of kind `circuit_open` so the provider-fallback
 * router treats it as a fallover trigger.
 */
export async function withLlmBreaker<T>(provider: LlmProvider, call: () => Promise<T>): Promise<T> {
  const name = `llm:${provider}`;
  let b = _breakers.get(name);
  if (!b) {
    b = new CircuitBreaker({ ...breakerConfig(), name, isCountedFailure: isCountedLlmFailure });
    _breakers.set(name, b);
  }
  try {
    return await b.execute(call);
  } catch (err) {
    if (err instanceof Error && (err as { circuitOpen?: boolean }).circuitOpen) {
      throw new LlmError(err.message, "circuit_open", provider, err);
    }
    throw err;
  }
}

/** Test-only — drop all breakers so thresholds/env re-read on next use. */
export function _resetEgressBreakers(): void {
  _breakers.clear();
}

/** Observability — snapshots of every live breaker. */
export function egressBreakerSnapshots() {
  return [..._breakers.values()].map((b) => b.snapshot());
}
