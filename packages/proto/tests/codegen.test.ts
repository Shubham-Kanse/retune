/**
 * gRPC codegen smoke test.
 *
 * Imports the generated message types and verifies:
 *   - Every RPC defined in ml.proto has a corresponding ServiceMethod.
 *   - Round-trip encode/decode of a representative payload.
 *
 * If this file fails to compile, the codegen output is broken.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  EmbedRequestSchema,
  EmbedResponseSchema,
  ExtractSpansRequestSchema,
  HealthRequestSchema,
  HealthResponseSchema,
  ML,
} from "../gen/ts/ml_pb";

test("ML service exposes every RPC defined in ml.proto", () => {
  // protoc-gen-es lowercases the first letter for the runtime method map.
  const expected = [
    "health",
    "embed",
    "extractSpans",
    "classifyDiscourse",
    "detectContradiction",
    "simulateReader",
    "proposeArcs",
    "solveEvidence",
    "composeBullet",
    "critique",
    "predictOutcome",
    "auditFairness",
    "simulateATS",
  ];
  const actual = Object.keys(ML.method);
  for (const name of expected) {
    assert.ok(actual.includes(name), `ML service missing RPC: ${name}`);
  }
  assert.equal(actual.length, expected.length);
});

test("EmbedRequest binary round-trip preserves fields", () => {
  const original = create(EmbedRequestSchema, {
    texts: ["alpha", "beta", "gamma"],
    model: "bge-large-en-v1.5",
    maxTokens: 512,
  });
  const bytes = toBinary(EmbedRequestSchema, original);
  const decoded = fromBinary(EmbedRequestSchema, bytes);
  assert.deepEqual(decoded.texts, ["alpha", "beta", "gamma"]);
  assert.equal(decoded.model, "bge-large-en-v1.5");
  assert.equal(decoded.maxTokens, 512);
});

test("HealthResponse and EmbedResponse construct cleanly", () => {
  const health = create(HealthResponseSchema, {
    status: "ok",
    service: "@retune/ml",
    version: "0.1.0",
    uptimeSeconds: 42.5,
    modelsLoaded: ["bge-large-en-v1.5"],
  });
  assert.equal(health.status, "ok");
  assert.equal(health.modelsLoaded.length, 1);

  const embed = create(EmbedResponseSchema, {
    embeddings: [new Uint8Array([1, 2, 3])],
    modelVersion: "bge-large-en-v1.5",
    latencyMs: 12.3,
  });
  assert.equal(embed.embeddings.length, 1);
  assert.equal(embed.embeddings[0]?.[0], 1);
});

test("HealthRequest and ExtractSpansRequest constructors compile against schemas", () => {
  const _h = create(HealthRequestSchema, {});
  const _e = create(ExtractSpansRequestSchema, {
    text: "test",
    sourceDocKind: "resume",
    spanKinds: ["skill", "metric"],
  });
  assert.ok(_h);
  assert.equal(_e.text, "test");
});
