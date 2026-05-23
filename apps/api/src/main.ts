/**
 * @retune/api entrypoint.
 *
 * Hono app on Node.js. Runtime is swappable (Bun / workerd) once we move
 * off in-memory state in commit #3.
 */

import { serve } from "@hono/node-server";
import { startCron } from "@retune/agent/cron";
import { Hono } from "hono";
import { logger, requestLoggerMiddleware } from "./lib/logger";
import { metricsHandler, metricsMiddleware } from "./lib/metrics";
import { mountOpenApi } from "./lib/openapi";
import { initOTel, shutdownOTel } from "./lib/otel";
import { initSentryNode } from "./lib/sentry";
import type { TraceBusRegistry } from "./lib/trace-bus";
import { buildTraceBusRegistry } from "./lib/trace-bus-redis";
import { active_questions_routes } from "./routes/active-questions";
import { applications_routes } from "./routes/applications";
import { generate_routes } from "./routes/generate";
import { health } from "./routes/health";
import { outcome_routes } from "./routes/outcome";
import { result_routes } from "./routes/result";
import { status_routes } from "./routes/status";
import { stream_routes } from "./routes/stream";
import { acquire_durability } from "./runtime/persistence-factory";

// Charter 04 Epic 04 — TraceBus durability. The factory returns the
// in-process registry by default; wrapping behind RETUNE_TRACE_BUS=redis
// turns on a Redis Streams adapter so SSE survives across multiple
// API instances.
const registry: TraceBusRegistry = buildTraceBusRegistry();

const app = new Hono();

// Charter 05 Epic 01 — request-id propagation + structured logging
// must run before everything else so subsequent middleware/handlers
// can use `c.var.logger` and the response carries `x-request-id`.
app.use("*", requestLoggerMiddleware);

// Charter 05 Epic 04 — Prometheus metrics. Records request count +
// duration for every route. Place BEFORE the routes so middleware
// runs the next() chain through them.
app.use("*", metricsMiddleware);

// Charter 05 Epic 04 — /metrics scrape endpoint (no auth — Prometheus
// scrapes are typically gated at the network / load-balancer layer).
app.get("/metrics", metricsHandler);

// CORS — registered BEFORE routes so preflight + response headers apply
// to every endpoint. The Next.js dev server (apps/web on :3000) needs
// this to call the cognitive API on :8787 directly. Production tightens
// the allowed origin via `RETUNE_API_CORS`.
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "*";
  const allowed = process.env.RETUNE_API_CORS ?? "*";
  c.header("Access-Control-Allow-Origin", allowed === "*" ? "*" : origin);
  c.header("Vary", "Origin");
  c.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Credentials", "true");
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
  return;
});

app.route("/", health);

// Charter 12 Epic 01 + Charter 17 Epic 03 — OpenAPI 3.1 spec + Swagger UI.
// /openapi.json + /v1/openapi.json + /docs.
mountOpenApi(app);

// Charter 17 Epic 01 — API versioning.
//
// All public mutating + read endpoints are now mounted under /v1 (the
// stable contract). The unprefixed legacy paths are kept for backward
// compatibility BUT carry a `Sunset` + `Deprecation` header so clients
// migrate. Internal routes (/health, /metrics) stay unprefixed.
app.route("/v1", applications_routes());
app.route("/v1", generate_routes(registry));
app.route("/v1", stream_routes(registry));
app.route("/v1", result_routes(registry));
app.route("/v1", outcome_routes());
app.route("/v1", active_questions_routes());
app.route("/v1", status_routes());

// Legacy unprefixed mounts — emit deprecation headers on every response.
app.use("*", async (c, next) => {
  await next();
  const path = c.req.path;
  // Mark only legacy unprefixed cognitive paths; /health / /v1/* / /metrics stay clean.
  if (
    path.startsWith("/generate") ||
    path.startsWith("/applications") ||
    path.startsWith("/outcome") ||
    path.startsWith("/active-questions") ||
    path.startsWith("/status")
  ) {
    c.header("Deprecation", "true");
    c.header("Sunset", "Wed, 31 Dec 2026 23:59:59 GMT");
    c.header("Link", `</v1${path}>; rel="successor-version"`);
  }
});

app.route("/", applications_routes());
app.route("/", generate_routes(registry));
app.route("/", stream_routes(registry));
app.route("/", result_routes(registry));
app.route("/", outcome_routes());
app.route("/", active_questions_routes());
app.route("/", status_routes());

const port = Number(process.env.PORT ?? 8787);
const temporalEnabled =
  process.env.RETUNE_TEMPORAL === "1" || Boolean(process.env.RETUNE_TEMPORAL_ADDRESS);
const persistMode = (process.env.RETUNE_PERSIST ?? "none").toLowerCase();

/**
 * Charter 02-Core-Features Epic 02 — production runtime contract.
 *
 * In production, the API MUST run with persistence + Temporal. The
 * in-memory runtime is dev-only (a process restart loses all in-flight
 * generations). Fail-fast at boot rather than serving requests in a
 * degraded mode that's invisible until a user hits it.
 */
function assertProductionRuntime(): void {
  if (process.env.NODE_ENV !== "production") return;
  const errors: string[] = [];
  if (!process.env.RETUNE_INTERNAL_API_KEY) {
    errors.push("RETUNE_INTERNAL_API_KEY is required in production (Charter 01 Epic 03)");
  }
  if (!process.env.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET) {
    errors.push("RETUNE_INTERNAL_GENERATION_ACCESS_SECRET is required in production");
  }
  if (persistMode !== "postgres") {
    errors.push(
      `RETUNE_PERSIST must be 'postgres' in production (got '${persistMode}'). In-memory generation is data-loss-prone; see Charter 02-Core-Features Epic 02.`,
    );
  }
  if (!temporalEnabled) {
    errors.push(
      "RETUNE_TEMPORAL=1 is required in production (Charter 04 Epic 01 + 02-Core-Features Epic 02). " +
        "Without Temporal, an API restart loses all in-flight generations.",
    );
  }
  if (errors.length > 0) {
    logger.error(
      { event: "startup.production_contract_failed", errors },
      "production runtime contract violated — refusing to start",
    );
    for (const e of errors) logger.error({ event: "startup.error" }, e);
    process.exit(1);
  }
}

assertProductionRuntime();

// Charter 05 — observability bootstrap. Both calls are no-ops unless
// their respective env vars (OTEL_EXPORTER_OTLP_ENDPOINT / SENTRY_DSN)
// are set, so this is safe in dev and test.
await initOTel();
await initSentryNode();

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info(
    { event: "startup", port: info.port, persist: persistMode, temporal: temporalEnabled },
    `@retune/api listening on http://localhost:${info.port}`,
  );

  if (process.env.ENABLE_CRON !== "0") {
    acquire_durability()
      .then((durability) => {
        if (!durability) return;
        startCron(durability.db);
        logger.info({ event: "cron.start" }, "nightly consolidator started");
      })
      .catch((err: unknown) => {
        logger.error(
          { event: "cron.start_failed", err: err instanceof Error ? err.message : String(err) },
          "cron failed to start",
        );
      });
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err?.code === "EADDRINUSE") {
    logger.error(
      { event: "startup_failed", code: err.code, port },
      `port ${port} is already in use (EADDRINUSE). Stop the existing process or set PORT to a free port.`,
    );
    process.exit(1);
  }
  logger.error({ event: "server_error", err: err.message, code: err.code }, "server error");
  process.exit(1);
});

// Graceful shutdown — flush OTel spans before the process exits so
// the last few seconds of traces aren't dropped.
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info({ event: "shutdown.start", signal }, `received ${signal}, shutting down`);
  try {
    server.close();
    await shutdownOTel();
  } catch (err) {
    logger.error(
      { event: "shutdown.error", err: err instanceof Error ? err.message : String(err) },
      "error during shutdown",
    );
  }
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

export { app };
