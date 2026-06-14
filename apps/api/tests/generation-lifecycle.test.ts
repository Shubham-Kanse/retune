import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generation_requests, generations, jds, users } from "@retune/db/pg";
import { createAndStartGeneration } from "../src/runtime/generation-lifecycle";
import { workflow_id_for } from "../src/runtime/workflow-ids";

const TEST_USER = "11111111-1111-4111-8111-111111111111";

function makeFakeDb() {
  const inserted: Record<string, Array<Record<string, unknown>>> = {
    users: [],
    jds: [],
    generations: [],
    generation_requests: [],
  };
  let returnExisting = false;
  return {
    inserted,
    setReturnExisting(v: boolean) {
      returnExisting = v;
    },
    db: {
      insert(table: unknown) {
        let bucket: Array<Record<string, unknown>>;
        if (table === users) bucket = inserted.users!;
        else if (table === jds) bucket = inserted.jds!;
        else if (table === generations) bucket = inserted.generations!;
        else if (table === generation_requests) bucket = inserted.generation_requests!;
        else throw new Error("unexpected table insert");
        return {
          values(value: Record<string, unknown>) {
            bucket.push(value);
            return {
              onConflictDoNothing: async () => undefined,
              then: (fn: (v: undefined) => unknown) => Promise.resolve(undefined).then(fn),
            };
          },
        };
      },
      select(_cols?: unknown) {
        // For idempotency check
        return {
          from(_table: unknown) {
            return {
              where(_w: unknown) {
                return {
                  limit: async (_n: number) =>
                    returnExisting ? [{ generation_id: "existing-gen-uuid" }] : [],
                };
              },
            };
          },
        };
      },
    },
  };
}

test("temporal path seeds FK rows + generation_requests row + starts workflow", async () => {
  const workflowStarts: Array<Record<string, unknown>> = [];
  const dualWrites: Array<Record<string, unknown>> = [];
  const fake = makeFakeDb();
  const ids = [randomUUID(), randomUUID()];

  const result = await createAndStartGeneration({
    payload: {
      jd_title: "Senior Engineer",
      company: "Acme",
      jd_text: "JD body",
      market: "US",
      idempotency_key: "test-idempotency-key-12345",
    },
    user_id: TEST_USER,
    registry: {
      create: () => ({ signal: new AbortController().signal }),
      delete_after: () => {},
    } as never,
    log: () => {},
    deps: {
      nowUuid: () => {
        const next = ids.shift();
        if (!next) throw new Error("no ids left");
        return next;
      },
      acquireTemporal: async () =>
        ({
          client: {
            workflow: {
              start: async (...args: unknown[]) => {
                workflowStarts.push({ args });
              },
            },
          },
        }) as never,
      acquireDurability: async () =>
        ({
          default_user_id: TEST_USER,
          db: fake.db,
        }) as never,
      dualWrite: async (input) => {
        dualWrites.push(input as unknown as Record<string, unknown>);
        return null;
      },
    },
  });

  assert.equal(result.runtime, "temporal");
  if (result.runtime === "temporal") {
    assert.ok(result.generation_id);
    assert.equal(result.workflow_id, workflow_id_for(result.generation_id));
    assert.equal(result.idempotent_replay, false);
  }
  assert.equal(fake.inserted.users!.length, 1);
  assert.equal(fake.inserted.jds!.length, 1);
  assert.equal(fake.inserted.generations!.length, 1);
  assert.equal(fake.inserted.generation_requests!.length, 1);
  // Workflow args should include the FULL payload (003 §6.1).
  const args = workflowStarts[0]?.args as Array<unknown>;
  const opts = args?.[1] as { args?: Array<Record<string, unknown>> };
  const seed = opts?.args?.[0];
  assert.ok(seed, "workflow start should pass a seed");
  assert.equal((seed as Record<string, unknown>).jd_text, "JD body");
  assert.equal((seed as Record<string, unknown>).market, "US");
  assert.equal((seed as Record<string, unknown>).idempotency_key, "test-idempotency-key-12345");
});

test("in-memory path creates bus, schedules cleanup, and starts run", async () => {
  const creates: string[] = [];
  const deletions: Array<{ id: string; ms: number }> = [];
  const runCalls: Array<Record<string, unknown>> = [];
  const bus = {
    signal: new AbortController().signal,
    publish: () => {},
  };
  const fake = makeFakeDb();

  const generation_id = randomUUID();
  const result = await createAndStartGeneration({
    payload: { jd_title: "Senior Engineer", company: "Acme", idempotency_key: "im-1234567890" },
    user_id: TEST_USER,
    registry: {
      create: (id: string) => {
        creates.push(id);
        return bus as never;
      },
      delete_after: (id: string, ms: number) => {
        deletions.push({ id, ms });
      },
    } as never,
    log: () => {},
    deps: {
      nowUuid: () => generation_id,
      acquireTemporal: async () => null,
      acquireDurability: async () =>
        ({
          default_user_id: TEST_USER,
          db: fake.db,
        }) as never,
      runGeneration: (input) => {
        runCalls.push(input as unknown as Record<string, unknown>);
        return Promise.resolve();
      },
    },
  });

  assert.equal(result.runtime, "in_memory");
  if (result.runtime === "in_memory") {
    assert.equal(result.generation_id, generation_id);
    assert.equal(result.stream, `/generate/${generation_id}/stream`);
    assert.equal(result.idempotent_replay, false);
  }
  assert.deepEqual(creates, [generation_id]);
  assert.equal(runCalls.length, 1);
  // The user_id MUST be propagated into the run.
  assert.equal(runCalls[0]?.user_id, TEST_USER);
  assert.deepEqual(deletions, [{ id: generation_id, ms: 10 * 60 * 1000 }]);
});

test("idempotent replay returns existing generation without starting a new one", async () => {
  const workflowStarts: Array<Record<string, unknown>> = [];
  const fake = makeFakeDb();
  fake.setReturnExisting(true);

  const result = await createAndStartGeneration({
    payload: {
      jd_text: "Same JD body",
      idempotency_key: "test-idempotency-key-12345",
    },
    user_id: TEST_USER,
    registry: {
      create: () => ({ signal: new AbortController().signal }),
      delete_after: () => {},
    } as never,
    log: () => {},
    deps: {
      nowUuid: () => randomUUID(),
      acquireTemporal: async () => null,
      acquireDurability: async () =>
        ({
          default_user_id: TEST_USER,
          db: fake.db,
        }) as never,
    },
  });

  assert.equal(result.idempotent_replay, true);
  if (result.runtime === "in_memory") {
    assert.equal(result.generation_id, "existing-gen-uuid");
  }
  // No insertions when replaying.
  assert.equal(fake.inserted.users!.length, 0);
  assert.equal(fake.inserted.generations!.length, 0);
  assert.equal(fake.inserted.generation_requests!.length, 0);
  // No workflow starts.
  assert.equal(workflowStarts.length, 0);
});

test("dual-write conflict is non-fatal on temporal path", async () => {
  const warnings: string[] = [];
  const starts: string[] = [];
  const fake = makeFakeDb();
  const ids = [randomUUID(), randomUUID()];

  const result = await createAndStartGeneration({
    payload: {
      jd_title: "Senior Engineer",
      company: "Acme",
      idempotency_key: "test-idempotency-key-67890",
    },
    user_id: TEST_USER,
    registry: {
      create: () => ({ signal: new AbortController().signal }),
      delete_after: () => {},
    } as never,
    log: (_level, _tag, msg) => {
      if (msg.includes("dual-write failed")) warnings.push(msg);
    },
    deps: {
      nowUuid: () => {
        const next = ids.shift();
        if (!next) throw new Error("no ids left");
        return next;
      },
      acquireTemporal: async () =>
        ({
          client: {
            workflow: {
              start: async () => {
                starts.push("started");
              },
            },
          },
        }) as never,
      acquireDurability: async () =>
        ({
          default_user_id: TEST_USER,
          db: fake.db,
        }) as never,
      dualWrite: async () => {
        throw new Error("duplicate key value violates unique constraint");
      },
    },
  });

  assert.equal(result.runtime, "temporal");
  if (result.runtime === "temporal") {
    assert.ok(result.generation_id);
  }
  assert.equal(starts.length, 1);
  assert.equal(warnings.length, 1);
});
