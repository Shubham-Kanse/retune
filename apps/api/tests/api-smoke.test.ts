/**
 * apps/api smoke test — exercises the full path:
 *   POST /generate → receive id → GET /generate/:id/stream → parse SSE
 *
 * Uses the Hono `app` directly (no real socket) via `app.fetch`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { TraceBusRegistry } from "../src/lib/trace-bus";
import { generate_routes } from "../src/routes/generate";
import { health } from "../src/routes/health";
import { status_routes } from "../src/routes/status";
import { stream_routes } from "../src/routes/stream";

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

test("GET /generate/:id/status returns Postgres fallback when no Temporal", async () => {
  process.env.RETUNE_PERSIST = "pglite";
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
});

test("pglite-backed generation persists to DB", async () => {
  // Cache-local to this test: fresh pglite per run.
  process.env.RETUNE_PERSIST = "pglite";

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
});
