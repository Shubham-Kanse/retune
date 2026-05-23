# Epic 02 — Generation Runtime Contract

**Charter:** 02-Core-Features
**Priority:** P0 — Week 2 (blocks production stability)
**Complexity:** S
**Owner:** Staff Engineer + DevOps Engineer
**Status:** Created in architect rewrite (2026-05-22). The enforcement gap is documented in the charter README.

---

## Goal

Enforce the production runtime contract: `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres` are REQUIRED in any non-development `NODE_ENV`. Today, production can boot with in-memory runtime and no persistence — a single API restart loses all in-flight generations. The substrate is wired for durability; the boot path does not enforce it.

## Definition of Done

- [ ] `apps/api` and `apps/worker` refuse to start in `NODE_ENV=production` (or `staging`) without `RETUNE_TEMPORAL=1` and `RETUNE_PERSIST=postgres`.
- [ ] `apps/api/src/main.ts` calls `assertProductionRuntime()` before `serve()`.
- [ ] `apps/worker/src/main.ts` errors (not silently sleeps) when `RETUNE_TEMPORAL` is unset in production.
- [ ] Integration test proves the enforcement works.
- [ ] Development mode (`NODE_ENV=development` or unset) retains current permissive behaviour.

---

## Code grounding (verified)

- `apps/api/src/runtime/generation-lifecycle.ts:143` throws `persistence_required` when Temporal is on but persistence is off. This is the only direction enforced today — the inverse (persistence on, Temporal off) and the fully-off case are not caught.
- `apps/worker/src/main.ts:73-77` checks `!process.env.RETUNE_TEMPORAL && !process.env.RETUNE_TEMPORAL_ADDRESS` — if both unset, logs a message and sleeps forever (`await new Promise(() => {})`). In production this means the worker process consumes resources doing nothing, silently.
- `apps/api/src/main.ts` currently has no production env assertion at boot.
- `apps/api/src/runtime/persistence-factory.ts` selects persistence mode from `RETUNE_PERSIST` env var — `off`, `pglite`, or `postgres`.
- `apps/api/src/runtime/temporal-factory.ts` creates the Temporal client when `RETUNE_TEMPORAL` is set.

---

## Story 2.1 — Production environment enforcer

**As a** platform engineer,
**I want** the API and worker to fail-fast at boot when the production runtime contract is violated,
**so that** misconfigured deploys are caught before any user request is processed.

### Acceptance criteria

- [ ] `apps/api/src/runtime/assert-production-runtime.ts` exports `assertProductionRuntime()`.
- [ ] The function throws (with a clear message) if `NODE_ENV` is `production` or `staging` AND either `RETUNE_TEMPORAL` is not `1` or `RETUNE_PERSIST` is not `postgres`.
- [ ] `apps/api/src/main.ts` calls `assertProductionRuntime()` before `app.listen()` / `serve()`.
- [ ] `apps/worker/src/main.ts` replaces the silent sleep with `process.exit(1)` and a logged error when `NODE_ENV=production` and `RETUNE_TEMPORAL` is unset.
- [ ] In `NODE_ENV=development` (or unset), both services retain current permissive behaviour — no enforcement, no exit.

### Tasks

- **2.1.1** Create `apps/api/src/runtime/assert-production-runtime.ts`. Logic: if `NODE_ENV ∈ {production, staging}`, require `RETUNE_TEMPORAL=1` and `RETUNE_PERSIST=postgres`. Throw descriptive error on violation.
- **2.1.2** Import and call in `apps/api/src/main.ts` at the top of the boot sequence.
- **2.1.3** Modify `apps/worker/src/main.ts:73-77`: when `NODE_ENV=production` and Temporal is not configured, log an error and `process.exit(1)` instead of sleeping.
- **2.1.4** Retain the existing sleep behaviour for development mode (keeps turbo from restarting the process).

---

## Story 2.2 — Feature-flag the enforcement

**As a** DevOps engineer,
**I want** an escape hatch for exceptional circumstances (e.g., debugging a production issue with in-memory mode),
**so that** the enforcement doesn't block emergency access.

### Acceptance criteria

- [ ] `RETUNE_RUNTIME_ENFORCE=0` disables the assertion (default is `1` — enforcement on).
- [ ] When the escape hatch is used, a `WARN`-level log is emitted every 60 seconds: "Production runtime contract bypassed — RETUNE_RUNTIME_ENFORCE=0".
- [ ] The escape hatch is documented in `.env.example` with a comment: "DO NOT set in production unless debugging".

### Tasks

- **2.2.1** Add `RETUNE_RUNTIME_ENFORCE` check to `assertProductionRuntime()`. If `0`, skip the throw but start a repeating warning log.
- **2.2.2** Add the variable to `.env.example` with documentation.

---

## Story 2.3 — Integration test for enforcement

**As a** developer,
**I want** a test that proves the enforcement works,
**so that** regressions are caught in CI.

### Acceptance criteria

- [ ] Test in `apps/api/tests/` spawns the API process with `NODE_ENV=production`, `RETUNE_TEMPORAL` unset, `RETUNE_PERSIST=off`.
- [ ] Asserts the process exits with code 1 within 5 seconds.
- [ ] A second test case sets `RETUNE_TEMPORAL=1` + `RETUNE_PERSIST=postgres` (with a mock Temporal address) — asserts the process does NOT exit with code 1 (it may fail later due to no Temporal server, but the assertion passes).
- [ ] Test runs in CI as part of `pnpm test`.

### Tasks

- **2.3.1** Create `apps/api/tests/production-runtime-enforcement.test.ts`.
- **2.3.2** Use `child_process.spawn` with env overrides. Assert exit code.
- **2.3.3** Add to the existing test configuration so it runs in CI.

---

## Out of scope

- Temporal cluster provisioning (Charter 06 CI/CD).
- PGlite-in-production support (explicitly disallowed by this epic).
- In-memory mode removal from the codebase (it remains available for development and testing).

---

## Hard dependencies

- None blocking. This epic is self-contained and can ship independently.
- Epic 05 (result hydration contract) depends on this epic's enforcement of `RETUNE_PERSIST=postgres` in production.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Enforcement breaks existing production deploy that lacks `RETUNE_TEMPORAL=1` | Verify current production env vars before merging; coordinate deploy with DevOps |
| Escape hatch (`RETUNE_RUNTIME_ENFORCE=0`) left on permanently | Repeating WARN log; alerting rule on the log pattern |
| Worker exit(1) causes container orchestrator restart loop | Expected behaviour — orchestrator should alert on repeated restarts, which surfaces the misconfiguration |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| API refuses to boot without Temporal in prod | `NODE_ENV=production RETUNE_PERSIST=off node apps/api/dist/main.js` exits 1 | CI integration test |
| Worker refuses to boot without Temporal in prod | `NODE_ENV=production node apps/worker/dist/main.js` exits 1 | CI integration test |
| Dev mode unaffected | `NODE_ENV=development node apps/api/dist/main.js` does NOT exit 1 | CI integration test |
| Escape hatch works | `NODE_ENV=production RETUNE_RUNTIME_ENFORCE=0` boots (with warnings) | CI integration test |
