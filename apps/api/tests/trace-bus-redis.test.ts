import assert from "node:assert/strict";
import test from "node:test";
import { TraceBusRegistry } from "../src/lib/trace-bus";
import {
  RedisTraceBusRegistry,
  _resetRedisClientForTests,
  buildTraceBusRegistry,
} from "../src/lib/trace-bus-redis";

test.beforeEach(() => {
  _resetRedisClientForTests();
  process.env.RETUNE_TRACE_BUS = "";
  process.env.REDIS_URL = "";
});

test.afterEach(() => {
  _resetRedisClientForTests();
});

test("buildTraceBusRegistry returns in-process by default", () => {
  const r = buildTraceBusRegistry();
  assert.ok(r instanceof TraceBusRegistry);
  // The base class should be the in-process one (not the Redis variant).
  assert.equal(r.constructor.name, "TraceBusRegistry");
});

test("buildTraceBusRegistry returns Redis-aware when flag is set", () => {
  process.env.RETUNE_TRACE_BUS = "redis";
  const r = buildTraceBusRegistry();
  assert.ok(r instanceof RedisTraceBusRegistry);
});

test("RedisTraceBusRegistry without REDIS_URL falls back to in-memory behaviour", async () => {
  const r = new RedisTraceBusRegistry();
  // No REDIS_URL — `ensure_redis()` returns null, `publish_to_redis` is a no-op.
  await r.publish_to_redis("gen-1", { kind: "trace" } as never);
  const replayed = await r.replay_from_redis("gen-1");
  assert.deepEqual(replayed, []);
});

test("RedisTraceBusRegistry inherits TraceBusRegistry CRUD", () => {
  const r = new RedisTraceBusRegistry();
  const bus = r.create("gen-2");
  assert.ok(bus);
  assert.equal(r.get("gen-2"), bus);
  assert.deepEqual(r.list_active(), ["gen-2"]);
  const aborted = r.abort("gen-2");
  assert.equal(aborted, true);
});
