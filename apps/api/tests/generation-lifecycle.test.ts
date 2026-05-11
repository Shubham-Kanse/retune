import assert from "node:assert/strict";
import test from "node:test";
import { jds, users } from "@retune/db/pg";
import { createAndStartGeneration } from "../src/runtime/generation-lifecycle";
import { workflow_id_for } from "../src/runtime/workflow-ids";

test("temporal path seeds FK rows and starts workflow", async () => {
  const insertedUsers: Array<Record<string, unknown>> = [];
  const insertedJds: Array<Record<string, unknown>> = [];
  const workflowStarts: Array<Record<string, unknown>> = [];
  const dualWrites: Array<Record<string, unknown>> = [];
  const ids = ["gen-1", "jd-1"];

  const fakeDb = {
    insert(table: unknown) {
      return {
        values(value: Record<string, unknown>) {
          if (table === users) {
            insertedUsers.push(value);
            return { onConflictDoNothing: async () => undefined };
          }
          if (table === jds) {
            insertedJds.push(value);
            return Promise.resolve(undefined);
          }
          throw new Error("unexpected table insert");
        },
      };
    },
  };

  const result = await createAndStartGeneration({
    payload: { jd_title: "Senior Engineer", company: "Acme", jd_text: "JD body", market: "US" },
    registry: { create: () => ({ signal: new AbortController().signal }), delete_after: () => {} } as never,
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
          default_user_id: "dev-user-1",
          db: fakeDb,
        }) as never,
      dualWrite: async (input) => {
        dualWrites.push(input as unknown as Record<string, unknown>);
      },
    },
  });

  assert.equal(result.runtime, "temporal");
  assert.equal(result.generation_id, "gen-1");
  assert.equal(result.workflow_id, workflow_id_for("gen-1"));
  assert.equal(insertedUsers.length, 1);
  assert.equal(insertedJds.length, 1);
  assert.equal(insertedJds[0]?.id, "jd-1");
  assert.equal(dualWrites.length, 1);
  assert.equal(dualWrites[0]?.jdId, "jd-1");
  assert.equal(workflowStarts.length, 1);
});

test("in-memory path creates bus, schedules cleanup, and starts run", async () => {
  const creates: string[] = [];
  const deletions: Array<{ id: string; ms: number }> = [];
  const runCalls: Array<Record<string, unknown>> = [];
  const bus = {
    signal: new AbortController().signal,
    publish: () => {},
  };

  const result = await createAndStartGeneration({
    payload: { jd_title: "Senior Engineer", company: "Acme" },
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
      nowUuid: () => "gen-2",
      acquireTemporal: async () => null,
      runGeneration: (input) => {
        runCalls.push(input as unknown as Record<string, unknown>);
        return Promise.resolve();
      },
    },
  });

  assert.equal(result.runtime, "in_memory");
  assert.equal(result.generation_id, "gen-2");
  assert.equal(result.stream, "/generate/gen-2/stream");
  assert.deepEqual(creates, ["gen-2"]);
  assert.equal(runCalls.length, 1);
  assert.deepEqual(deletions, [{ id: "gen-2", ms: 10 * 60 * 1000 }]);
});

test("dual-write conflict is non-fatal on temporal path", async () => {
  const warnings: string[] = [];
  const starts: string[] = [];
  const ids = ["gen-3", "jd-3"];

  const fakeDb = {
    insert(table: unknown) {
      return {
        values() {
          if (table === users) return { onConflictDoNothing: async () => undefined };
          if (table === jds) return Promise.resolve(undefined);
          throw new Error("unexpected table");
        },
      };
    },
  };

  const result = await createAndStartGeneration({
    payload: { jd_title: "Senior Engineer", company: "Acme" },
    registry: { create: () => ({ signal: new AbortController().signal }), delete_after: () => {} } as never,
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
          default_user_id: "dev-user-1",
          db: fakeDb,
        }) as never,
      dualWrite: async () => {
        throw new Error("duplicate key value violates unique constraint");
      },
    },
  });

  assert.equal(result.runtime, "temporal");
  assert.equal(result.generation_id, "gen-3");
  assert.equal(starts.length, 1);
  assert.equal(warnings.length, 1);
});

