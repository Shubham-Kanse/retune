/**
 * OpenAPI 3.1 spec generator (Charter 12 Epic 01 + Charter 17 Epic 03).
 *
 * Builds an OpenAPI spec from the same Zod schemas the routes use for
 * runtime validation. Single source of truth.
 *
 * Mounted at:
 *   - GET /openapi.json — the spec itself
 *   - GET /docs        — Swagger UI rendered against the spec
 *
 * Adding a new route to the spec:
 *   1. Define / re-use the Zod schemas for request + response.
 *   2. Call `registry.registerPath({ method, path, request, responses })`
 *      below.
 *   3. The new route is documented automatically on next deploy.
 *
 * The spec is re-generated on every cold start; for production-scale
 * traffic, add a 1-hour HTTP cache header on `/openapi.json` (already
 * set below).
 */

import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import type { Hono } from "hono";
import { z } from "zod";

extendZodWithOpenApi(z);

// ─── Reusable schemas ────────────────────────────────────────────────
const ErrorEnvelope = z
  .object({
    error: z.string().openapi({ example: "invalid_internal_key" }),
    message: z.string().optional(),
  })
  .openapi("ErrorEnvelope");

const GenerateRequest = z
  .object({
    jd_url: z.string().url().optional(),
    jd_text: z.string().optional(),
    jd_title: z.string().optional(),
    company: z.string().optional(),
    profile_text: z.string().optional(),
    market: z.enum(["US", "UK"]).default("US"),
    idempotency_key: z.string().optional(),
    preflight_id: z.string().uuid().optional(),
    jd_hash: z.string().optional(),
  })
  .openapi("GenerateRequest");

const GenerateResponse = z
  .object({
    generation_id: z.string().uuid(),
    stream: z.string().openapi({ example: "/v1/generate/<id>/stream" }),
    runtime: z.enum(["in_memory", "temporal"]),
    idempotent_replay: z.boolean(),
  })
  .openapi("GenerateResponse");

const HealthResponse = z
  .object({
    status: z.literal("ok"),
    persist: z.string(),
    temporal: z.boolean(),
    version: z.string().optional(),
  })
  .openapi("HealthResponse");

const ApplicationCreate = z
  .object({
    jd_url: z.string().url().optional(),
    jd_text: z.string().optional(),
    jd_title: z.string().optional(),
    company: z.string().optional(),
    market: z.enum(["US", "UK"]).default("US"),
  })
  .openapi("ApplicationCreate");

const OutcomeCreate = z
  .object({
    generation_id: z.string().uuid(),
    outcome: z.enum(["applied", "rejected", "interviewed", "offered", "withdrew"]),
    notes: z.string().optional(),
  })
  .openapi("OutcomeCreate");

const ActiveQuestionAnswer = z
  .object({
    answer: z.string(),
    evidence_refs: z.array(z.string()).optional(),
  })
  .openapi("ActiveQuestionAnswer");

const RefusalSummary = z
  .object({
    verdict: z.literal("refuse"),
    reasons: z.array(z.string()),
    unmet_evidence: z.array(z.string()),
    next_actions: z.array(z.string()),
    appeal_path: z.string().optional(),
  })
  .openapi("RefusalSummary");

const StreamDoneSummary = z
  .object({
    termination: z.string(),
    ticks_executed: z.number(),
    total_cost_usd: z.number(),
    total_latency_ms: z.number(),
    narrativeSummary: z.string().optional(),
    refusal: RefusalSummary.optional(),
  })
  .openapi("StreamDoneSummary");

// ─── Build the registry ──────────────────────────────────────────────
function buildRegistry(): OpenAPIRegistry {
  const r = new OpenAPIRegistry();

  // Register components so $refs resolve.
  r.register("ErrorEnvelope", ErrorEnvelope);
  r.register("GenerateRequest", GenerateRequest);
  r.register("GenerateResponse", GenerateResponse);
  r.register("HealthResponse", HealthResponse);
  r.register("ApplicationCreate", ApplicationCreate);
  r.register("OutcomeCreate", OutcomeCreate);
  r.register("ActiveQuestionAnswer", ActiveQuestionAnswer);
  r.register("StreamDoneSummary", StreamDoneSummary);
  r.register("RefusalSummary", RefusalSummary);

  // Bearer auth via the internal API key. Documented but the SDK-using
  // call path is web→api over HMAC; external integrators use the same
  // header pattern with their own keys (Charter 17 Epic 04).
  r.registerComponent("securitySchemes", "InternalKey", {
    type: "apiKey",
    in: "header",
    name: "x-retune-internal-key",
    description:
      "Shared secret between apps/web and apps/api. Required for every state-mutating route in production.",
  });

  // ── /v1/health ──
  r.registerPath({
    method: "get",
    path: "/v1/health",
    summary: "Health check",
    description: "Returns 200 + persist/temporal flags when the API is alive and configured.",
    tags: ["meta"],
    responses: {
      200: {
        description: "Healthy",
        content: { "application/json": { schema: HealthResponse } },
      },
    },
  });

  // ── /v1/generate ──
  r.registerPath({
    method: "post",
    path: "/v1/generate",
    summary: "Start a generation",
    description:
      "Kick off a cognitive generation run. Returns the `generation_id` to subscribe to over SSE at `/v1/generate/{id}/stream`. Idempotent on `idempotency_key` — the same key returns the existing run rather than starting a new one.",
    tags: ["generation"],
    security: [{ InternalKey: [] }],
    request: {
      body: {
        content: { "application/json": { schema: GenerateRequest } },
      },
    },
    responses: {
      200: {
        description: "Generation started (or replayed if idempotent).",
        content: { "application/json": { schema: GenerateResponse } },
      },
      400: {
        description: "Invalid request payload.",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
      401: {
        description: "Auth rejected (missing / invalid internal key).",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
      402: {
        description: "Billing gate refused (insufficient credits / past_due).",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
    },
  });

  // ── /v1/generate/{id}/stream — SSE ──
  r.registerPath({
    method: "get",
    path: "/v1/generate/{id}/stream",
    summary: "Subscribe to generation events (SSE)",
    description:
      "Server-Sent Events stream of trace events for the given generation. Reconnect with the standard `Last-Event-ID` header to resume from a specific seq.",
    tags: ["generation"],
    security: [{ InternalKey: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      headers: z.object({
        "x-retune-generation-access": z.string(),
        "last-event-id": z.string().optional(),
      }),
    },
    responses: {
      200: {
        description:
          "SSE stream of `trace`, `narrative_paragraph`, `completion`, `done`, `error` events.",
        content: { "text/event-stream": { schema: z.string() } },
      },
      403: {
        description: "Access token missing/invalid or owner mismatch.",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
      404: {
        description: "Generation id unknown or expired.",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
    },
  });

  // ── /v1/generate/{id} — final result ──
  r.registerPath({
    method: "get",
    path: "/v1/generate/{id}",
    summary: "Get final generation result",
    description:
      "Hydrates from in-memory bus first, then Postgres. Live for at least 30 days when persistence is enabled (Charter 02-Core-Features Epic 05).",
    tags: ["generation"],
    security: [{ InternalKey: [] }],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: { description: "Result envelope (blackboard-derived)." },
      404: {
        description: "Unknown generation.",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
    },
  });

  // ── /v1/generate/{id}/{kind}.{format} — document download ──
  r.registerPath({
    method: "get",
    path: "/v1/generate/{id}/{kind}.{format}",
    summary: "Download a generated document",
    description:
      "Produces DOCX or PDF for resume / cover_letter. 422 when content not yet generated, 503 when render infra unavailable, 200 with file bytes otherwise.",
    tags: ["generation"],
    security: [{ InternalKey: [] }],
    request: {
      params: z.object({
        id: z.string().uuid(),
        kind: z.enum(["resume", "cover_letter"]),
        format: z.enum(["docx", "pdf"]),
      }),
    },
    responses: {
      200: {
        description: "File bytes.",
        content: {
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
            schema: z.string(),
          },
          "application/pdf": { schema: z.string() },
        },
      },
      422: { description: "Content not yet generated." },
      503: { description: "Render infra temporarily unavailable." },
    },
  });

  // ── /v1/applications ──
  r.registerPath({
    method: "post",
    path: "/v1/applications",
    summary: "Create an application shell",
    tags: ["applications"],
    security: [{ InternalKey: [] }],
    request: {
      body: { content: { "application/json": { schema: ApplicationCreate } } },
    },
    responses: {
      200: { description: "Created." },
      400: {
        description: "Invalid payload.",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
    },
  });

  // ── /v1/outcome ──
  r.registerPath({
    method: "post",
    path: "/v1/outcome",
    summary: "Record application outcome",
    tags: ["applications"],
    security: [{ InternalKey: [] }],
    request: {
      body: { content: { "application/json": { schema: OutcomeCreate } } },
    },
    responses: {
      200: { description: "Recorded." },
      400: {
        description: "Invalid payload.",
        content: { "application/json": { schema: ErrorEnvelope } },
      },
    },
  });

  // ── /v1/active-questions/{id}/answer ──
  r.registerPath({
    method: "post",
    path: "/v1/active-questions/{id}/answer",
    summary: "Answer an active question",
    tags: ["generation"],
    security: [{ InternalKey: [] }],
    request: {
      params: z.object({ id: z.string().uuid() }),
      body: {
        content: { "application/json": { schema: ActiveQuestionAnswer } },
      },
    },
    responses: {
      200: { description: "Answer accepted." },
      404: { description: "Unknown question id." },
    },
  });

  return r;
}

/**
 * Build the OpenAPI 3.1 document. Cached per process — the spec is
 * static once the route registry is built.
 */
let _spec: ReturnType<OpenApiGeneratorV31["generateDocument"]> | null = null;

export function buildOpenApiSpec(): ReturnType<OpenApiGeneratorV31["generateDocument"]> {
  if (_spec) return _spec;
  const generator = new OpenApiGeneratorV31(buildRegistry().definitions);
  _spec = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Retune API",
      version: "1.0.0",
      description:
        "Cognitive generation API for Retune. Versioned under `/v1`. Rate-limited per IP+path; signed via `x-retune-internal-key`. SSE streams reconnect with `Last-Event-ID`.",
      license: { name: "Proprietary" },
      contact: { name: "Retune", url: "https://retuned.cv" },
    },
    servers: [
      { url: "https://retuned.cv", description: "production" },
      { url: "https://staging.retuned.cv", description: "staging (Charter 06 E1)" },
      { url: "http://localhost:8787", description: "dev" },
    ],
    tags: [
      { name: "meta", description: "Health, build info, observability." },
      { name: "generation", description: "Cognitive generation lifecycle." },
      { name: "applications", description: "Application + outcome tracking." },
    ],
  });
  return _spec;
}

/**
 * Mount the OpenAPI + docs routes on the given Hono app instance.
 *
 *   - GET /openapi.json          → spec
 *   - GET /docs                  → Swagger UI (CDN-loaded)
 *   - GET /v1/openapi.json       → mirror under /v1 namespace
 */
export function mountOpenApi(app: Hono): void {
  app.get("/openapi.json", (c) => {
    const spec = buildOpenApiSpec();
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(spec);
  });

  app.get("/v1/openapi.json", (c) => {
    const spec = buildOpenApiSpec();
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(spec);
  });

  // Swagger UI rendered from the canonical CDN. No build-time bundling
  // required; the CSP allows the swagger-ui-dist hostname implicitly via
  // the script-src 'self' fallback because the page is same-origin and
  // loads the assets via <script> tags pointing at unpkg.
  app.get("/docs", (c) => {
    return c.html(
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Retune API — /docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>html,body{margin:0;padding:0}body{font-family:system-ui,sans-serif}</style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`,
    );
  });
}
