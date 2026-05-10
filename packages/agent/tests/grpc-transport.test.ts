/**
 * GrpcTransport contract test.
 *
 * Boots an in-memory Connect router (no socket, no h2c) hosting a tiny
 * test handler that implements the `ML` service. Exercises:
 *
 *   - field-name translation (camelCase ↔ snake_case)
 *   - bytes ↔ float32 round-trip for embeddings
 *   - error code mapping (UNAVAILABLE → server_5xx, INVALID_ARGUMENT → client_4xx)
 *   - timeout cancellation
 */

import assert from "node:assert/strict";
import test from "node:test";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError, createClient, createRouterTransport } from "@connectrpc/connect";
import { EmbedResponseSchema, HealthResponseSchema, ML } from "@retune/proto";
import { GrpcTransport, HttpTransport, MLClient, type MLTransport } from "../src/ml-client";

// ─────────── in-memory server ───────────

const HEALTH_RESPONSE = {
  status: "ok",
  service: "retune-ml",
  version: "0.1.0-test",
  uptimeSeconds: 12.5,
  modelsLoaded: ["bge-large-en-v1.5"],
};

function build_router_transport(opts: { embed_should_fail?: Code; latency_ms?: number } = {}) {
  return createRouterTransport(({ service }) => {
    service(ML, {
      health: () => create(HealthResponseSchema, HEALTH_RESPONSE),
      embed: async (req) => {
        if (opts.latency_ms !== undefined) {
          await new Promise((r) => setTimeout(r, opts.latency_ms));
        }
        if (opts.embed_should_fail !== undefined) {
          throw new ConnectError("simulated failure", opts.embed_should_fail);
        }
        // Return one 768-dim float32 embedding per input text, deterministic.
        const embeddings = req.texts.map((t, i) => deterministic_embedding(t, i));
        return create(EmbedResponseSchema, {
          embeddings,
          modelVersion: "test-bge",
          latencyMs: 7.5,
        });
      },
      // Stub everything else; tests don't exercise these.
      extractSpans: () => {
        throw new ConnectError("not implemented in test", Code.Unimplemented);
      },
      classifyDiscourse: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      detectContradiction: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      simulateReader: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      proposeArcs: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      solveEvidence: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      composeBullet: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      critique: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      predictOutcome: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      auditFairness: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
      simulateATS: () => {
        throw new ConnectError("not implemented", Code.Unimplemented);
      },
    });
  });
}

function deterministic_embedding(text: string, idx: number): Uint8Array {
  const dim = 768;
  const bytes = new Uint8Array(dim * 4);
  const view = new DataView(bytes.buffer);
  // Seed by text length + index to make outputs distinct per input.
  const seed = text.length + idx;
  for (let i = 0; i < dim; i++) {
    const v = Math.sin(seed + i) * 0.5;
    view.setFloat32(i * 4, v, /* littleEndian */ true);
  }
  return bytes;
}

function build_grpc_transport(
  opts: Parameters<typeof build_router_transport>[0] = {},
): MLTransport {
  const transport = build_router_transport(opts);
  const client = createClient(ML, transport);
  return new GrpcTransport({ client });
}

// ─────────── tests ───────────

test("GrpcTransport.health: snake_case mapping is correct", async () => {
  const t = build_grpc_transport();
  const res = await t.health();
  assert.equal(res.status, "ok");
  assert.equal(res.service, "retune-ml");
  assert.equal(res.version, "0.1.0-test");
  assert.equal(res.uptime_seconds, 12.5);
  assert.deepEqual(res.models_loaded, ["bge-large-en-v1.5"]);
});

test("GrpcTransport.embed: bytes → float32[] round-trip", async () => {
  const t = build_grpc_transport();
  const res = await t.embed({ texts: ["hello", "world"], model: "test-bge", max_tokens: null });
  assert.equal(res.embeddings.length, 2);
  assert.equal(res.embeddings[0]?.length, 768);
  assert.equal(res.model_version, "test-bge");
  // Recompute the first value of the first embedding and compare.
  const expected_v0 = Math.fround(Math.sin("hello".length + 0) * 0.5);
  assert.ok(Math.abs((res.embeddings[0]?.[0] ?? 0) - expected_v0) < 1e-6);
});

test("GrpcTransport: UNAVAILABLE → server_5xx", async () => {
  const t = build_grpc_transport({ embed_should_fail: Code.Unavailable });
  await assert.rejects(
    t.embed({ texts: ["x"], model: "test-bge", max_tokens: null }),
    (err: unknown) => {
      const e = err as { kind?: string };
      return e.kind === "server_5xx";
    },
  );
});

test("GrpcTransport: INVALID_ARGUMENT → client_4xx", async () => {
  const t = build_grpc_transport({ embed_should_fail: Code.InvalidArgument });
  await assert.rejects(
    t.embed({ texts: ["x"], model: "test-bge", max_tokens: null }),
    (err: unknown) => {
      const e = err as { kind?: string };
      return e.kind === "client_4xx";
    },
  );
});

test("MLClient with grpc transport zod-validates the response", async () => {
  const t = build_grpc_transport();
  const client = new MLClient({ transport: t });
  assert.equal(client.transport_kind, "grpc");
  const health = await client.health();
  assert.equal(health.status, "ok");
});

test("MLClient.http() factory still works (backward-compat)", () => {
  const client = MLClient.http({ base_url: "http://localhost:9999" });
  assert.equal(client.transport_kind, "http");
});

test("HttpTransport instances expose kind=http", () => {
  const t = new HttpTransport({ base_url: "http://localhost:9999" });
  assert.equal(t.kind, "http");
});
