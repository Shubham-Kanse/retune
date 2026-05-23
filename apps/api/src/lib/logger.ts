/**
 * Structured logger for `@retune/api`.
 *
 * Charter 05 Epic 01.
 *
 * Outputs:
 *   - Production: single-line JSON to stdout (one line per event), so
 *     Vercel/Fly/Railway log aggregators can parse it for free.
 *   - Development: pretty-printed via `pino-pretty` for human reading.
 *
 * Use the request-scoped logger (via `requestLogger` middleware below)
 * inside route handlers — it carries `request_id`, `route`, `method`,
 * and the authenticated `user_id` if available, so log lines can be
 * joined into a single request trace.
 *
 * Levels (default): `info`. Override via `LOG_LEVEL` env var.
 */

import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";
import pino, { type Logger } from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: {
    service: "retune-api",
    pid: process.pid,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Charter 01 Epic 02 — secret redaction.
  // Redact common credential-bearing paths so a stray `log.info({ req })`
  // never leaks an Authorization header or cookie. Pino does deep-path
  // matching with wildcards.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-retune-internal-key']",
      "req.headers['x-retune-generation-access']",
      "req.headers['stripe-signature']",
      "req.body.password",
      "req.body.token",
      "req.body.api_key",
      'req.body["api-key"]',
      "headers.authorization",
      "headers.cookie",
      "headers['x-retune-internal-key']",
      "headers['x-retune-generation-access']",
      "*.password",
      "*.token",
      "*.api_key",
      "*.apiKey",
      "*.secret",
      "*.privateKey",
    ],
    censor: "[REDACTED]",
  },
  // Pretty-print only in development (transport is async, so prod stays
  // safe with a plain stdout JSON stream).
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname,service",
        },
      },
});

/**
 * Hono middleware: attaches a `requestLogger` to `c.var` and ensures
 * every request carries a stable `x-request-id`.
 *
 * Usage in routes:
 *
 *   app.get("/something", (c) => {
 *     const log = c.var.logger;
 *     log.info({ user_id: ... }, "fetched something");
 *     return c.json(...);
 *   });
 */
declare module "hono" {
  interface ContextVariableMap {
    logger: Logger;
    requestId: string;
  }
}

export async function requestLoggerMiddleware(c: Context, next: Next): Promise<void> {
  const incomingId = c.req.header("x-request-id");
  const requestId = incomingId ?? randomUUID();
  const start = Date.now();
  const requestLogger = logger.child({
    request_id: requestId,
    method: c.req.method,
    route: c.req.path,
  });
  c.set("requestId", requestId);
  c.set("logger", requestLogger);
  // Echo the request id back so callers can correlate.
  c.header("x-request-id", requestId);

  requestLogger.debug({ event: "request.start" });
  try {
    await next();
  } finally {
    const duration_ms = Date.now() - start;
    const status = c.res.status;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    requestLogger[level](
      { event: "request.end", status, duration_ms },
      `${c.req.method} ${c.req.path} → ${status} (${duration_ms}ms)`,
    );
  }
}
