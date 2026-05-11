/**
 * apps/api smoke test — exercises the full path:
 *   POST /generate → receive id → GET /generate/:id/stream → parse SSE
 *
 * Uses the Hono `app` directly (no real socket) via `app.fetch`.
 */

import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Hono } from "hono";
import { TraceBusRegistry } from "../src/lib/trace-bus";
import { generate_routes } from "../src/routes/generate";
import { health } from "../src/routes/health";
import { status_routes } from "../src/routes/status";
import { stream_routes } from "../src/routes/stream";

process.env.NODE_ENV = "test";

function build_app() {
  const registry = new TraceBusRegistry();
  const app = new Hono();
  app.route("/", health);
  app.route("/", generate_routes(registry));
  app.route("/", stream_routes(registry));
  app.route("/", status_routes());
  return app;
}

test("GET /health returns ok and the registered specialists", async () => {
  const app = build_app();
  const res = await app.fetch(new Request("http://test/health"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    status: string;
    features: { specialists: string[]; workbench: boolean };
  };
  assert.equal(body.status, "ok");
  assert.equal(body.features.workbench, true);
  assert.deepEqual(body.features.specialists, [
    "title_schema_retriever",
    "company_schema_retriever",
  ]);
});

test("POST /generate rejects empty body", async () => {
  const app = build_app();
  const res = await app.fetch(
    new Request("http://test/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(res.status, 400);
});

test("POST /generate + SSE stream produces trace + done frames", async () => {
  const app = build_app();

  // Start generation
  const start = await app.fetch(
    new Request("http://test/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jd_title: "Senior Software Engineer",
        company: "Stripe",
      }),
    }),
  );
  assert.equal(start.status, 202);
  const { generation_id } = (await start.json()) as { generation_id: string };
  assert.ok(generation_id);

  // Subscribe to SSE
  const stream_res = await app.fetch(new Request(`http://test/generate/${generation_id}/stream`));
  assert.equal(stream_res.status, 200);
  assert.match(stream_res.headers.get("content-type") ?? "", /text\/event-stream/);

  // Collect the full SSE body. Since the backend generation completes
  // synchronously in under 100ms for this stub, the stream closes
  // quickly and we get the full payload here.
  const body = await stream_res.text();

  // Expect at least one trace frame and one done frame.
  const trace_frames = [...body.matchAll(/^event: trace$/gm)];
  const done_frames = [...body.matchAll(/^event: done$/gm)];
  assert.ok(trace_frames.length >= 2, `expected ≥2 trace frames, got ${trace_frames.length}`);
  assert.equal(done_frames.length, 1);

  // The done frame should embed the termination reason.
  assert.match(body, /"termination":"no_open_work"/);
});

test("GET stream for unknown id returns 404", async () => {
  const app = build_app();
  const res = await app.fetch(
    new Request("http://test/generate/00000000-0000-0000-0000-000000000000/stream"),
  );
  assert.equal(res.status, 404);
});

test("SSE emits typed completion event before done", async () => {
  const registry = new TraceBusRegistry();
  const app = new Hono();
  app.route("/", stream_routes(registry));

  const generation_id = "11111111-1111-1111-1111-111111111111";
  const bus = registry.create(generation_id);

  // Publish terminal frames asynchronously after subscriber connects.
  setTimeout(() => {
    bus.publish({
      kind: "done",
      summary: {
        termination: "no_open_work",
        ticks_executed: 3,
        total_cost_usd: 0.001,
        total_latency_ms: 123,
      },
    });
  }, 0);

  const res = await app.fetch(new Request(`http://test/generate/${generation_id}/stream`));
  assert.equal(res.status, 200);
  const body = await res.text();

  const completionIdx = body.indexOf("event: completion");
  const doneIdx = body.indexOf("event: done");
  assert.ok(completionIdx >= 0, "expected completion event");
  assert.ok(doneIdx >= 0, "expected done event");
  assert.ok(completionIdx < doneIdx, "completion should be emitted before done");
  assert.match(body, /"status":"completed"/);
});

test("SSE emits typed completion event on error", async () => {
  const registry = new TraceBusRegistry();
  const app = new Hono();
  app.route("/", stream_routes(registry));

  const generation_id = "22222222-2222-2222-2222-222222222222";
  const bus = registry.create(generation_id);

  setTimeout(() => {
    bus.publish({ kind: "error", message: "boom" });
  }, 0);

  const res = await app.fetch(new Request(`http://test/generate/${generation_id}/stream`));
  assert.equal(res.status, 200);
  const body = await res.text();

  const completionIdx = body.indexOf("event: completion");
  const errorIdx = body.indexOf("event: error");
  assert.ok(completionIdx >= 0, "expected completion event");
  assert.ok(errorIdx >= 0, "expected error event");
  assert.ok(completionIdx < errorIdx, "completion should be emitted before error");
  assert.match(body, /"status":"failed"/);
  assert.match(body, /"error_message":"boom"/);
});

test("GET /generate/:id/status returns Postgres fallback when no Temporal", async () => {
  process.env.RETUNE_PERSIST = "pglite";
  process.env.RETUNE_PGLITE_DATADIR = await mkdtemp(join(tmpdir(), "retune-api-status-"));
  // RETUNE_TEMPORAL is unset, so the route falls back to Postgres.
  const app = build_app();

  const start = await app.fetch(
    new Request("http://test/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jd_title: "Senior Software Engineer", company: "Stripe" }),
    }),
  );
  const { generation_id } = (await start.json()) as { generation_id: string };

  // Drain the SSE so the in-memory generation completes and persistence flushes.
  const stream_res = await app.fetch(new Request(`http://test/generate/${generation_id}/stream`));
  await stream_res.text();

  // Now query status.
  const status_res = await app.fetch(new Request(`http://test/generate/${generation_id}/status`));
  assert.equal(status_res.status, 200);
  const body = (await status_res.json()) as {
    source: string;
    status: string;
    ticks_executed: number;
  };
  assert.equal(body.source, "postgres");
  assert.equal(body.status, "completed");
  assert.ok(body.ticks_executed >= 2);

  // Unknown id → 404.
  const not_found = await app.fetch(
    new Request("http://test/generate/00000000-0000-0000-0000-000000000000/status"),
  );
  assert.equal(not_found.status, 404);

  // Cleanup
  const { acquire_durability } = await import("../src/runtime/persistence-factory");
  const durability = await acquire_durability();
  if (durability) await durability.close();
  process.env.RETUNE_PERSIST = undefined;
  process.env.RETUNE_PGLITE_DATADIR = undefined;
});

test("pglite-backed generation persists to DB", async () => {
  // Cache-local to this test: fresh pglite per run.
  process.env.RETUNE_PERSIST = "pglite";
  process.env.RETUNE_PGLITE_DATADIR = await mkdtemp(join(tmpdir(), "retune-api-persist-"));

  // Build a fresh app after the env var is set so acquire_durability()
  // sees the right mode on first call.
  const app = build_app();

  const start = await app.fetch(
    new Request("http://test/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jd_title: "Senior Software Engineer",
        company: "Stripe",
      }),
    }),
  );
  assert.equal(start.status, 202);
  const { generation_id } = (await start.json()) as { generation_id: string };

  // Drain the stream so the generation finishes.
  const stream_res = await app.fetch(new Request(`http://test/generate/${generation_id}/stream`));
  assert.equal(stream_res.status, 200);
  const body = await stream_res.text();
  assert.match(body, /event: completion/);
  assert.match(body, /"status":"completed"/);
  assert.match(body, /"termination":"no_open_work"/);

  // Direct DB check: generation row exists with completed termination.
  const { acquire_durability } = await import("../src/runtime/persistence-factory");
  const durability = await acquire_durability();
  if (!durability) throw new Error("durability must be non-null");
  const replayed = await durability.persistence.load(generation_id);
  if (!replayed) throw new Error("replayed must be non-null");
  assert.equal(replayed.termination, "no_open_work");
  // v2.0 (PRD §13.4 issue #13): the API runtime now registers 14 cognitive
  // specialists + 3 listeners (was 8), so a smoke run with non-trivial
  // payload produces ≥ 2 audit entries depending on which goals fire.
  assert.ok(
    replayed.audit_entries.length >= 2,
    `expected ≥ 2 audit entries, got ${replayed.audit_entries.length}`,
  );

  // Clean up: close pglite so subsequent tests get a fresh process state.
  await durability.close();
  process.env.RETUNE_PERSIST = undefined;
  process.env.RETUNE_PGLITE_DATADIR = undefined;
});
