import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { Hono } from "hono";
import { TraceBusRegistry } from "../src/lib/trace-bus";
import { result_routes } from "../src/routes/result";
import { stream_routes } from "../src/routes/stream";

function signToken(generationId: string, userId: string): string {
  const payload = {
    generation_id: generationId,
    user_id: userId,
    exp: Math.floor(Date.now() / 1000) + 60,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET as string;
  const sig = createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

test("stream route rejects missing token in non-test mode", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET;
  process.env.NODE_ENV = "production";
  process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    const registry = new TraceBusRegistry();
    registry.create("gen-1");
    const app = new Hono();
    app.route("/", stream_routes(registry));
    const res = await app.fetch(new Request("http://test/generate/gen-1/stream"));
    assert.equal(res.status, 403);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET = prevSecret;
  }
});

test("stream route accepts valid signed token in non-test mode", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET;
  process.env.NODE_ENV = "production";
  process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    const registry = new TraceBusRegistry();
    const bus = registry.create("gen-2");
    setTimeout(() => {
      bus.publish({
        kind: "done",
        summary: {
          termination: "no_open_work",
          ticks_executed: 1,
          total_cost_usd: 0,
          total_latency_ms: 1,
        },
      });
    }, 0);
    const app = new Hono();
    app.route("/", stream_routes(registry));
    const token = signToken("gen-2", "u1");
    const res = await app.fetch(
      new Request("http://test/generate/gen-2/stream", {
        headers: { "x-retune-generation-access": token },
      }),
    );
    assert.equal(res.status, 200);
    await res.text();
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET = prevSecret;
  }
});

test("result route rejects missing token in non-test mode", async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevSecret = process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET;
  process.env.NODE_ENV = "production";
  process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET = "0123456789abcdef0123456789abcdef";
  try {
    const registry = new TraceBusRegistry();
    const app = new Hono();
    app.route("/", result_routes(registry));
    const res = await app.fetch(new Request("http://test/generate/gen-3"));
    assert.equal(res.status, 403);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET = prevSecret;
  }
});
