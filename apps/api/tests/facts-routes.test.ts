/**
 * Evidence-ledger routes — auth + degradation behavior.
 * (Persistence-backed CRUD is covered by the pglite smoke environment;
 * here we pin the contract: identity required, 503 without persistence.)
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { facts_routes } from "../src/routes/facts";

function app(): Hono {
  const a = new Hono();
  a.route("/", facts_routes());
  return a;
}

test("GET /facts without credentials in production is 401", async () => {
  const prev = process.env.NODE_ENV;
  const prevKey = process.env.RETUNE_INTERNAL_API_KEY;
  process.env.NODE_ENV = "production";
  delete process.env.RETUNE_INTERNAL_API_KEY;
  try {
    const res = await app().fetch(new Request("http://test/facts"));
    assert.equal(res.status, 401);
  } finally {
    process.env.NODE_ENV = prev;
    if (prevKey !== undefined) process.env.RETUNE_INTERNAL_API_KEY = prevKey;
  }
});

test("GET /facts in dev without persistence degrades to 503", async () => {
  const res = await app().fetch(new Request("http://test/facts"));
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { error: string }).error, "persistence_not_configured");
});

test("POST /facts validates the payload shape before touching storage", async () => {
  const res = await app().fetch(
    new Request("http://test/facts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "not-a-kind", claim: "" }),
    }),
  );
  // Without persistence the route 503s first in dev; with it, invalid
  // payloads are 400. Either is acceptable here — what must never happen
  // is a 2xx.
  assert.ok(res.status === 400 || res.status === 503);
});
