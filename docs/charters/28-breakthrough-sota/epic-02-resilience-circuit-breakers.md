# Epic 02: Circuit Breakers on All Egress

**Charter:** 28 — Breakthrough SOTA
**Priority:** P0
**Complexity:** M
**Movement:** Reliability

---

## Goal

Wrap every outbound dependency (Anthropic, OpenAI, the ML sidecar, and outbound webhooks) in a circuit breaker so that a failing or slow provider fails fast and recovers automatically instead of cascading. Today a single provider hang ties up the tick loop until the per-generation timeout; there is **zero** breaker logic anywhere (`grep -r CircuitBreaker` returns nothing).

## Definition of Done

- [ ] A generic, dependency-free `CircuitBreaker` lives in `packages/agent/src/lib/circuit-breaker.ts` with `closed → open → half-open → closed` semantics.
- [ ] LLM provider calls (both providers) and the ML client route through a breaker keyed by dependency.
- [ ] Breaker thresholds are env-tunable with safe defaults; unset env preserves current behaviour (breaker effectively permissive).
- [ ] Open/half-open/close transitions emit a structured log line (no PII, no keys).
- [ ] When a breaker is open, callers get a typed `LlmError`/ML error of kind `circuit_open` — never a hang.
- [ ] Unit tests cover: trips after N failures, rejects fast while open, probes after cooldown, closes on success, half-open re-open on probe failure.
- [ ] All existing agent + api tests pass.

---

## Story 2.1 — Generic circuit breaker primitive

**As a** platform engineer, **I want** a small state-machine breaker, **so that** any egress can be wrapped uniformly.

**Acceptance Criteria:**
- [ ] `CircuitBreaker` class with `run<T>(fn: () => Promise<T>): Promise<T>`.
- [ ] Config: `failureThreshold` (default 5), `cooldownMs` (default 30000), `halfOpenMax` (default 1), `name`.
- [ ] States: `closed` (pass through, count failures), `open` (reject immediately with `CircuitOpenError` until cooldown elapses), `half_open` (allow up to `halfOpenMax` probes; success → closed, failure → open).
- [ ] Consecutive-failure counter resets on any success in `closed`.
- [ ] `snapshot()` returns `{ name, state, failures, openedAt }` for observability.
- [ ] A failure classifier decides which errors count toward tripping (timeouts, 429/529/5xx, connection errors) vs which pass through uncounted (4xx auth/validation — a bad key should not trip the breaker for everyone).

## Story 2.2 — Wrap the LLM providers

**As a** user mid-generation, **I want** a wedged provider to fail fast, **so that** my generation errors cleanly or fails over instead of hanging.

**Acceptance Criteria:**
- [ ] Each provider's network call is wrapped in a breaker keyed `llm:anthropic` / `llm:openai`.
- [ ] BYOK note: the breaker key is per-provider, not per-user-key, so a single user's bad key (4xx) does not trip the shared breaker (enforced by the failure classifier in 2.1).
- [ ] `CircuitOpenError` is mapped to `LlmError` kind `circuit_open`; the existing provider-fallback path treats `circuit_open` as a fallback trigger.
- [ ] Breakers are process-singletons keyed by name (shared across generations on the instance).

## Story 2.3 — Wrap the ML client

**Acceptance Criteria:**
- [ ] `MLClient` transport calls route through a breaker keyed `ml:<op>` (embed / extract_spans / classify_discourse) or a single `ml` breaker.
- [ ] On open, the client raises the existing typed ML error so comprehension specialists fall back to their stub path (already implemented) rather than crashing the tick.

## Story 2.4 — Observability + config

**Acceptance Criteria:**
- [ ] Env: `RETUNE_BREAKER_FAILURE_THRESHOLD`, `RETUNE_BREAKER_COOLDOWN_MS` parsed once with defaults; documented in `.env.example`.
- [ ] State transitions log `{ event: "circuit.open"|"circuit.half_open"|"circuit.close", name, failures }` via the existing logger/console shim.
- [ ] No secret, key, prompt, or PII appears in any breaker log.
