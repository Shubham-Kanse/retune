import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generation_requests, generations, jds, users } from "@retune/db/pg";
import { createAndStartGeneration } from "../src/runtime/generation-lifecycle";

const TEST_USER = "11111111-1111-4111-8111-111111111111";

function makeFakeDb() {
  const inserted: Record<string, Array<Record<string, unknown>>> = {
    users: [],
    jds: [],
    generations: [],
    generation_requests: [],
  };
  return {
    inserted,
    db: {
      insert(table: unknown) {
        let bucket: Array<Record<string, unknown>> | undefined;
        if (table === users) bucket = inserted.users;
        else if (table === jds) bucket = inserted.jds;
        else if (table === generations) bucket = inserted.generations;
        else if (table === generation_requests) bucket = inserted.generation_requests;
        if (!bucket) throw new Error("unexpected table insert");
        const target = bucket;
        return {
          values(value: Record<string, unknown>) {
            target.push(value);
            const result = {
              onConflictDoNothing: async () => undefined,
              // biome-ignore lint/suspicious/noThenProperty: drizzle builders are awaitable
              then: (fn: (v: undefined) => unknown) => Promise.resolve(undefined).then(fn),
            };
            return result;
          },
        };
      },
      select(_cols?: unknown) {
        return {
          from(_table: unknown) {
            return {
              where(_w: unknown) {
                return {
                  limit: async (_n: number) => [] as Array<Record<string, unknown>>,
                };
              },
            };
          },
        };
      },
    },
  };
}

test("temporal seed receives career_profile + career_understanding (004 §11.4)", async () => {
  const workflowStarts: Array<Record<string, unknown>> = [];
  const fake = makeFakeDb();
  const ids = [randomUUID(), randomUUID()];

  const careerProfile = { schemaVersion: "career-profile-v1", id: "p1" };
  const careerUnderstanding = {
    schemaVersion: "career-understanding-v1",
    id: "cu-1",
    revision: 1,
  };

  const result = await createAndStartGeneration({
    payload: {
      jd_title: "Senior Engineer",
      company: "Acme",
      jd_text: "JD body",
      market: "US",
      idempotency_key: "career-understanding-test-key",
      career_profile: careerProfile,
      career_understanding: careerUnderstanding,
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
      dualWrite: async () => null,
    },
  });

  assert.equal(result.runtime, "temporal");
  const args = workflowStarts[0]?.args as Array<unknown> | undefined;
  const opts = args?.[1] as { args?: Array<Record<string, unknown>> } | undefined;
  const seed = opts?.args?.[0] as Record<string, unknown> | undefined;
  assert.ok(seed, "workflow seed should be passed to start()");
  assert.deepEqual(seed.career_profile, careerProfile);
  assert.deepEqual(seed.career_understanding, careerUnderstanding);
});

test("in-memory path forwards career_profile + career_understanding into runGeneration", async () => {
  const fake = makeFakeDb();
  const runCalls: Array<Record<string, unknown>> = [];
  const generation_id = randomUUID();

  const careerProfile = { schemaVersion: "career-profile-v1", id: "p1" };
  const careerUnderstanding = {
    schemaVersion: "career-understanding-v1",
    id: "cu-1",
  };

  await createAndStartGeneration({
    payload: {
      jd_title: "Senior Engineer",
      company: "Acme",
      idempotency_key: "im-career-understanding-test",
      career_profile: careerProfile,
      career_understanding: careerUnderstanding,
    },
    user_id: TEST_USER,
    registry: {
      create: () => ({ signal: new AbortController().signal, publish: () => {} }) as never,
      delete_after: () => {},
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

  assert.equal(runCalls.length, 1);
  const payload = runCalls[0]?.payload as Record<string, unknown>;
  assert.deepEqual(payload.career_profile, careerProfile);
  assert.deepEqual(payload.career_understanding, careerUnderstanding);
});
