/**
 * Cross-language end-to-end test.
 *
 * Spawns the Python ML server (`apps/ml`, FastAPI + gRPC) on a real
 * loopback port, then exercises BOTH transports (HTTP + gRPC) from the
 * TS side via `MLClient`. This is the only test in the suite that
 * actually crosses a process boundary, so it's gated:
 *
 *   - skipped automatically when `apps/ml/.venv` is missing (most dev
 *     boxes that haven't bootstrapped Python yet),
 *   - skipped when `RETUNE_SKIP_E2E=1` is set,
 *   - opt-in via the `cognitive-cycle-cross-lang` CI job.
 *
 * Why both transports against one server?
 *   - Proves the proto contract is wire-compatible end-to-end.
 *   - Catches divergences between the HTTP route's JSON shape and the
 *     gRPC servicer's proto encoding (e.g. snake_case vs camelCase,
 *     bytes vs list[float] for embeddings).
 *
 * @brain corpus callosum: cross-language consistency check
 */

import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GrpcTransport, HttpTransport, MLClient } from "../src/sota-exports";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ML_DIR = path.join(REPO_ROOT, "apps/ml");
const VENV_PYTHON = path.join(ML_DIR, ".venv/bin/python");

const SHOULD_SKIP = process.env.RETUNE_SKIP_E2E === "1" || !existsSync(VENV_PYTHON);

async function pick_free_port(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const addr = srv.address();
      if (typeof addr === "string" || !addr) {
        reject(new Error("could not allocate port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

interface MLServer {
  http_port: number;
  grpc_port: number;
  process: ChildProcess;
  shutdown: () => Promise<void>;
}

async function start_ml_server(): Promise<MLServer> {
  const http_port = await pick_free_port();
  const grpc_port = await pick_free_port();

  // Start uvicorn directly so we can pin the HTTP port. The lifespan
  // hook spawns the gRPC server on `RETUNE_ML_GRPC_PORT`.
  const proc = spawn(
    VENV_PYTHON,
    [
      "-m",
      "uvicorn",
      "retune_ml.main:app",
      "--host",
      "127.0.0.1",
      "--port",
      String(http_port),
      "--log-level",
      "warning",
    ],
    {
      cwd: ML_DIR,
      env: {
        ...process.env,
        PYTHONPATH: path.join(ML_DIR, "src"),
        RETUNE_ML_GRPC_PORT: String(grpc_port),
        // Use stubs — the heavy job covers real models separately.
        RETUNE_ML_USE_STUBS: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  // Surface server logs only on test failure.
  const log_chunks: string[] = [];
  proc.stdout?.on("data", (chunk) => log_chunks.push(String(chunk)));
  proc.stderr?.on("data", (chunk) => log_chunks.push(String(chunk)));

  // Wait for `/health` to come up. Uvicorn starts in <2s on a warm
  // venv; we give it 15s before bailing.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${http_port}/health`);
      if (res.ok) break;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (Date.now() >= deadline) {
    proc.kill("SIGKILL");
    throw new Error(`ml server did not become healthy:\n${log_chunks.join("")}`);
  }

  const shutdown = async () => {
    if (proc.exitCode !== null) return;
    proc.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 3_000);
      proc.on("exit", () => {
        clearTimeout(t);
        resolve();
      });
    });
  };

  return { http_port, grpc_port, process: proc, shutdown };
}

test(
  "cross-lang E2E: HTTP transport hits real Python /extract-spans",
  { skip: SHOULD_SKIP },
  async () => {
    const server = await start_ml_server();
    try {
      const client = new MLClient({
        transport: new HttpTransport({ base_url: `http://127.0.0.1:${server.http_port}` }),
      });
      const out = await client.extract_spans({
        text: "Senior Software Engineer at Stripe building Kubernetes infra. 30% latency win.",
        source_doc_kind: "rendered_document",
        span_kinds: [],
      });
      assert.ok(out.spans.length > 0, "got spans");
      assert.equal(out.model_version, "stub-v1");
      const kinds = new Set(out.spans.map((s) => s.kind));
      assert.ok(kinds.has("company"), `expected company kind in ${[...kinds]}`);
    } finally {
      await server.shutdown();
    }
  },
);

test(
  "cross-lang E2E: gRPC transport hits real Python aio gRPC server",
  { skip: SHOULD_SKIP },
  async () => {
    const server = await start_ml_server();
    try {
      const client = new MLClient({
        transport: new GrpcTransport({
          base_url: `http://127.0.0.1:${server.grpc_port}`,
        }),
      });
      const out = await client.extract_spans({
        text: "Built systems at Google and Meta. 10x growth in 6 months.",
        source_doc_kind: "rendered_document",
        span_kinds: [],
      });
      assert.ok(out.spans.length > 0, "got spans over gRPC");
      assert.equal(out.model_version, "stub-v1");
      const company_texts = out.spans
        .filter((s) => s.kind === "company")
        .map((s) => s.text.toLowerCase());
      assert.ok(company_texts.includes("google"));
      assert.ok(company_texts.includes("meta"));

      // Health round-trip too — exercises a different RPC over the same channel.
      const health = await client.health();
      assert.equal(health.status, "ok");
      assert.equal(health.service, "retune-ml");
    } finally {
      await server.shutdown();
    }
  },
);

test(
  "cross-lang E2E: HTTP + gRPC ClassifyDiscourse round-trips function_logits",
  { skip: SHOULD_SKIP },
  async () => {
    const server = await start_ml_server();
    try {
      const http_client = new MLClient({
        transport: new HttpTransport({ base_url: `http://127.0.0.1:${server.http_port}` }),
      });
      const grpc_client = new MLClient({
        transport: new GrpcTransport({
          base_url: `http://127.0.0.1:${server.grpc_port}`,
        }),
      });
      const jd = [
        "About the role:",
        "We're hiring a Senior Software Engineer to build distributed systems.",
        "Must have an active US security clearance.",
        "Bonus points for Kafka experience.",
        "We work async-first across 8 time zones.",
        "Equal opportunity employer.",
      ].join("\n");

      const [http_out, grpc_out] = await Promise.all([
        http_client.classify_discourse({ jd_text: jd }),
        grpc_client.classify_discourse({ jd_text: jd }),
      ]);

      assert.equal(http_out.sentences.length, grpc_out.sentences.length);
      for (let i = 0; i < http_out.sentences.length; i++) {
        const h = http_out.sentences[i];
        const g = grpc_out.sentences[i];
        assert.ok(h && g);
        if (!h || !g) continue;
        assert.equal(h.text, g.text);
        assert.equal(h.function, g.function);
        assert.ok(Math.abs(h.importance - g.importance) < 1e-6);
        const known = [
          "filter",
          "actual_test",
          "aspiration",
          "culture",
          "legal",
          "boilerplate",
        ] as const;
        for (const fn of known) {
          const hv = h.function_logits[fn] ?? 0;
          const gv = g.function_logits[fn] ?? 0;
          assert.ok(
            Math.abs(hv - gv) < 1e-6,
            `function_logits[${fn}] diverges: HTTP=${hv} gRPC=${gv}`,
          );
        }
      }
    } finally {
      await server.shutdown();
    }
  },
);

test(
  "cross-lang E2E: HTTP and gRPC produce identical spans for identical input",
  { skip: SHOULD_SKIP },
  async () => {
    const server = await start_ml_server();
    try {
      const http_client = new MLClient({
        transport: new HttpTransport({ base_url: `http://127.0.0.1:${server.http_port}` }),
      });
      const grpc_client = new MLClient({
        transport: new GrpcTransport({
          base_url: `http://127.0.0.1:${server.grpc_port}`,
        }),
      });
      const text = "Built distributed systems in Python at Meta. SOC2 + GDPR compliance.";
      const [http_out, grpc_out] = await Promise.all([
        http_client.extract_spans({ text, source_doc_kind: "profile", span_kinds: [] }),
        grpc_client.extract_spans({ text, source_doc_kind: "profile", span_kinds: [] }),
      ]);

      const project = (s: { kind: string; text: string; char_start: number; char_end: number }) =>
        `${s.kind}|${s.text}|${s.char_start}|${s.char_end}`;
      const http_set = new Set(http_out.spans.map(project));
      const grpc_set = new Set(grpc_out.spans.map(project));
      assert.deepEqual(
        [...http_set].sort(),
        [...grpc_set].sort(),
        "HTTP and gRPC return the same spans for the same input (modulo unordered)",
      );
    } finally {
      await server.shutdown();
    }
  },
);
