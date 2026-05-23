/**
 * Contract test (Charter 07 Epic 02 + Charter 17 Epic 03).
 *
 * Asserts that:
 *   - Every documented public route in the OpenAPI spec is routable
 *     by the live Hono app (no 404).
 *   - Every state-mutating documented route declares a security scheme.
 *
 * What this DOES NOT do (yet):
 *   - Assert response bodies match the documented schemas at runtime.
 *     That requires DB + auth + Stripe fixtures, tracked as Charter 07
 *     Epic 02 follow-up.
 *   - Pact-style consumer/provider testing — also a follow-up.
 *
 * The goal here is the "spec matches app surface" smoke baseline. Any
 * documented endpoint that returns 404 means the OpenAPI spec drifted
 * from the routing table — fail loud.
 */

import assert from "node:assert/strict";
import test from "node:test";

// Prevent main.ts from binding a real port when imported under tsx --test.
process.env.RETUNE_API_BOOT = "0";

const { app } = await import("../src/main");
const { buildOpenApiSpec } = await import("../src/lib/openapi");

interface OpenApiPath {
  parameters?: unknown;
  get?: unknown;
  post?: unknown;
  put?: unknown;
  patch?: unknown;
  delete?: unknown;
}

const SPEC = buildOpenApiSpec();
const PATHS = (SPEC.paths ?? {}) as Record<string, OpenApiPath>;

function pathTemplate(p: string): string {
  // OpenAPI uses {id} / {kind} / {format}; routing wants concrete values.
  const PARAM_FIXTURES: Record<string, string> = {
    id: "00000000-0000-4000-8000-000000000000",
    application_id: "00000000-0000-4000-8000-000000000000",
    kind: "resume",
    format: "pdf",
  };
  return p.replace(
    /\{([^}]+)\}/g,
    (_match, name: string) => PARAM_FIXTURES[name] ?? "00000000-0000-4000-8000-000000000000",
  );
}

function methodsFor(entry: OpenApiPath): string[] {
  return ["get", "post", "put", "patch", "delete"].filter(
    (m) => (entry as Record<string, unknown>)[m],
  );
}

test("OpenAPI spec uses the /v1 prefix convention", () => {
  for (const p of Object.keys(PATHS)) {
    assert.ok(
      p.startsWith("/v1") || p === "/health" || p === "/openapi.json" || p === "/docs",
      `Path ${p} doesn't follow /v1 prefix convention`,
    );
  }
});

test("Every documented route is reachable on the Hono app (no 404)", async () => {
  for (const [path, entry] of Object.entries(PATHS)) {
    for (const method of methodsFor(entry)) {
      const concrete = pathTemplate(path);
      const url = `http://test.local${concrete}`;
      const init: RequestInit = { method: method.toUpperCase() };
      if (method === "post" || method === "put" || method === "patch") {
        init.headers = { "Content-Type": "application/json" };
        init.body = "{}";
      }
      const res = await app.fetch(new Request(url, init));
      assert.notEqual(
        res.status,
        404,
        `Documented ${method.toUpperCase()} ${path} returned 404 — route missing from Hono app`,
      );
    }
  }
});

test("Every state-mutating documented route declares a security scheme", () => {
  for (const [path, entry] of Object.entries(PATHS)) {
    for (const method of ["post", "put", "patch", "delete"] as const) {
      const op = entry[method] as { security?: unknown[] } | undefined;
      if (!op) continue;
      assert.ok(
        Array.isArray(op.security) && op.security.length > 0,
        `Documented ${method.toUpperCase()} ${path} missing a security declaration`,
      );
    }
  }
});
