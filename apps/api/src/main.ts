/**
 * @retune/api entrypoint.
 *
 * Hono app on Node.js. Runtime is swappable (Bun / workerd) once we move
 * off in-memory state in commit #3.
 */

import { serve } from "@hono/node-server";
import { startCron } from "@retune/agent/cron";
import { Hono } from "hono";
import { TraceBusRegistry } from "./lib/trace-bus";
import { active_questions_routes } from "./routes/active-questions";
import { applications_routes } from "./routes/applications";
import { generate_routes } from "./routes/generate";
import { health } from "./routes/health";
import { outcome_routes } from "./routes/outcome";
import { result_routes } from "./routes/result";
import { status_routes } from "./routes/status";
import { stream_routes } from "./routes/stream";
import { acquire_durability } from "./runtime/persistence-factory";

const registry = new TraceBusRegistry();

const app = new Hono();

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

const server = serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`@retune/api listening on http://localhost:${info.port}`);
  // eslint-disable-next-line no-console
  console.log(`[startup] persist=${persistMode} temporal=${temporalEnabled ? "on" : "off"}`);

  if (process.env.ENABLE_CRON !== "0") {
    acquire_durability()
      .then((durability) => {
        if (!durability) return;
        startCron(durability.db);
        // eslint-disable-next-line no-console
        console.log("[cron] nightly consolidator started");
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[cron] failed to start:", err instanceof Error ? err.message : String(err));
      });
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err?.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `[startup] port ${port} is already in use (EADDRINUSE). Stop the existing process or set PORT to a free port.`,
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.error("[startup] server error", err);
  process.exit(1);
});

export { app };
