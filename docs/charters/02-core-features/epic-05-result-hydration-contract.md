# Epic 05 — Result Hydration Contract

**Charter:** 02-Core-Features
**Priority:** P1 — Week 3 (after runtime contract enforcement lands)
**Complexity:** S
**Owner:** Staff Engineer
**Status:** Created in architect rewrite (2026-05-22). The support contract is undocumented and untested.

---

## Goal

Document and enforce the result hydration support contract: generation results must be retrievable for at least 30 days after creation. Today, the in-memory trace bus GCs results after 10 minutes, and the DB fallback only works when `RETUNE_PERSIST` is not `off`. The user-facing contract for "can I still see my result tomorrow?" is undefined.

## Definition of Done

- [ ] `RETUNE_PERSIST=off` is prohibited in production (enforced by Epic 02 of this charter).
- [ ] An integration test proves a result is retrievable 30 days after creation (simulated via direct DB insertion with a past timestamp).
- [ ] The `not_found` error taxonomy in `apps/api/src/routes/result.ts` is documented: when it fires, what it means, and what the user should see.
- [ ] User-facing documentation states the 30-day retention guarantee.

---

## Code grounding (verified)

- `apps/api/src/lib/trace-bus.ts:190` — `delete_after(generation_id: string, ms: number): void` method on the in-memory bus.
- `apps/api/src/runtime/generation-lifecycle.ts:325` — calls `registry.delete_after(generation_id, 10 * 60 * 1000)` — 10-minute GC of the in-memory bus entry.
- `apps/api/src/routes/result.ts:37-39` — falls through to DB: `select({ blackboard: generations.current_blackboard }).from(generations).where(eq(generations.id, id))`.
- `apps/api/src/routes/result.ts:122,139,162` — returns `{ error: "not_found", generation_id: id }` with 404 in three distinct code paths.
- `apps/api/src/routes/result.ts:7` — comment documents the two-tier hydration: "Postgres persistence (the `generations.current_blackboard` JSONB".
- With `RETUNE_PERSIST=off`, the DB fallback has no data — result vanishes after the 10-minute bus GC.

---

## Story 5.1 — Prohibit RETUNE_PERSIST=off in production

**As a** platform engineer,
**I want** production to always have database persistence,
**so that** results survive beyond the 10-minute in-memory bus window.

### Acceptance criteria

- [ ] This is enforced by Epic 02 Story 2.1 (`assertProductionRuntime()` requires `RETUNE_PERSIST=postgres`).
- [ ] This story is a verification checkpoint — confirm Epic 02 is merged and the assertion covers `RETUNE_PERSIST`.
- [ ] If Epic 02 is not yet merged, this story blocks until it is.

### Tasks

- **5.1.1** Verify `apps/api/src/runtime/assert-production-runtime.ts` checks `RETUNE_PERSIST=postgres` (from Epic 02).
- **5.1.2** If not yet implemented, raise a blocker on Epic 02.

---

## Story 5.2 — Integration test for 30-day result retrieval

**As a** developer,
**I want** a test that proves results are retrievable 30 days after creation,
**so that** the support contract is enforced by CI.

### Acceptance criteria

- [ ] Test file: `apps/api/tests/result-hydration-30d.test.ts`.
- [ ] Test inserts a generation row into the database with `created_at` set to 30 days ago and a valid `current_blackboard` JSONB payload.
- [ ] Test calls `GET /generate/:id` (the result endpoint) and asserts 200 with the blackboard data.
- [ ] Test also verifies that a generation with `created_at` 31 days ago still returns 200 (no automatic expiry today — the contract is "at least 30 days", not "exactly 30 days").
- [ ] Test runs against PGlite in CI (no external Postgres required).

### Tasks

- **5.2.1** Create `apps/api/tests/result-hydration-30d.test.ts`.
- **5.2.2** Use the existing test database setup (PGlite) to insert a backdated generation row.
- **5.2.3** Call the result endpoint via the Hono test client. Assert 200 + correct payload.
- **5.2.4** Add a negative case: generation that does NOT exist → 404 with `not_found` error.

---

## Story 5.3 — Document the not_found taxonomy

**As a** frontend developer,
**I want** to know exactly when and why `not_found` is returned from the result endpoint,
**so that** I can show the user an appropriate message.

### Acceptance criteria

- [ ] `docs/api/result-hydration.md` documents:
  - The two-tier hydration strategy (bus → DB).
  - The 10-minute bus TTL and why it exists (memory pressure).
  - The 30-day DB retention guarantee.
  - The three `not_found` code paths in `apps/api/src/routes/result.ts` (lines 122, 139, 162) and what triggers each.
  - What the frontend should show for each case.
- [ ] The document is linked from the charter README.

### Tasks

- **5.3.1** Write `docs/api/result-hydration.md`.
- **5.3.2** For each `not_found` return in `apps/api/src/routes/result.ts`, document: the condition, the meaning, and the recommended user-facing message.
- **5.3.3** Link from `docs/charters/02-core-features/README.md`.

---

## Out of scope

- Automatic result expiry after N days (no TTL enforcement today; future work if storage costs require it).
- Result archival to cold storage (Charter 08 data integrity future work).
- Bus TTL tuning (10 minutes is acceptable; the DB fallback is the durable path).

---

## Hard dependencies

- **Epic 02 (Generation Runtime Contract)** — Story 5.1 depends on the production enforcement of `RETUNE_PERSIST=postgres`. Without it, the 30-day guarantee is unenforceable.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Database storage grows unbounded with no expiry | Monitor `generations` table size; add TTL-based cleanup in Charter 08 if needed |
| Test with backdated `created_at` doesn't reflect real-world conditions | The test proves the query works regardless of age; real retention depends on no DELETE running |
| `not_found` taxonomy changes as new features land | Document is versioned in git; update requirement added to PR template for result.ts changes |

---

## Verification matrix

| Control | Verification | Test |
|---------|--------------|------|
| RETUNE_PERSIST=off blocked in prod | Epic 02 integration test (cross-reference) | CI |
| 30-day-old result retrievable | `apps/api/tests/result-hydration-30d.test.ts` passes | CI |
| not_found taxonomy documented | `docs/api/result-hydration.md` exists and covers all 3 code paths | PR review checklist |
| No automatic expiry deletes results | Confirm no scheduled job or trigger deletes from `generations` table | Code audit |
