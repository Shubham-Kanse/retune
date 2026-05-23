import assert from "node:assert/strict";
import test from "node:test";
import { buildOpenApiSpec } from "../src/lib/openapi";

test("OpenAPI spec is valid 3.1 with required top-level fields", () => {
  const spec = buildOpenApiSpec();
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.title, "Retune API");
  assert.equal(spec.info.version, "1.0.0");
  assert.ok(Array.isArray(spec.servers) && spec.servers.length >= 1);
  assert.ok(Array.isArray(spec.tags) && spec.tags.length >= 1);
});

test("OpenAPI spec exposes the public generation routes", () => {
  const spec = buildOpenApiSpec();
  const paths = Object.keys(spec.paths ?? {});
  // /health is intentionally unprefixed — it's an infra route, not a v1 contract.
  assert.ok(paths.includes("/health"), "missing /health");
  assert.ok(paths.includes("/v1/generate"), "missing /v1/generate");
  assert.ok(paths.includes("/v1/generate/{id}"), "missing /v1/generate/{id}");
  assert.ok(paths.includes("/v1/generate/{id}/stream"), "missing /v1/generate/{id}/stream");
  assert.ok(paths.includes("/v1/applications"), "missing /v1/applications");
  assert.ok(paths.includes("/v1/generate/{id}/outcome"), "missing /v1/generate/{id}/outcome");
});

test("OpenAPI components include shared schemas", () => {
  const spec = buildOpenApiSpec();
  const components = (spec.components ?? {}) as { schemas?: Record<string, unknown> };
  assert.ok(components.schemas?.GenerateRequest);
  assert.ok(components.schemas?.GenerateResponse);
  assert.ok(components.schemas?.ErrorEnvelope);
  assert.ok(components.schemas?.RefusalSummary);
});

test("OpenAPI spec declares the InternalKey security scheme", () => {
  const spec = buildOpenApiSpec();
  const components = (spec.components ?? {}) as {
    securitySchemes?: Record<string, { type: string; in?: string; name?: string }>;
  };
  const scheme = components.securitySchemes?.InternalKey;
  assert.ok(scheme, "InternalKey scheme missing");
  assert.equal(scheme?.type, "apiKey");
  assert.equal(scheme?.in, "header");
  assert.equal(scheme?.name, "x-retune-internal-key");
});

test("buildOpenApiSpec is memoised — same instance on subsequent calls", () => {
  const a = buildOpenApiSpec();
  const b = buildOpenApiSpec();
  assert.equal(a, b);
});
