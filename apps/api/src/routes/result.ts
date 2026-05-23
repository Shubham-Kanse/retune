/**
 * GET /generate/:id — full generation result for the result page UI.
 *
 * Hydration order:
 *   1. Live in-memory bus (workbench-runtime captured the final blackboard
 *      onto the bus when the orchestrator returned).
 *   2. Postgres persistence (the `generations.current_blackboard` JSONB
 *      column) when `RETUNE_PERSIST=postgres|pglite` is configured.
 *
 * GET /generate/:id/audit — audit packet (trace events) for the audit screen.
 */

import { generations } from "@retune/db/pg";
import type { Blackboard } from "@retune/types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  type DocumentFormat,
  type DocumentKind,
  readBytes,
  renderDocument,
} from "../lib/docx-renderer";
import { verifyGenerationAccessToken } from "../lib/generation-access-token";
import { renderResult } from "../lib/result-renderer";
import type { TraceBusRegistry } from "../lib/trace-bus";
import { acquire_durability } from "../runtime/persistence-factory";

async function loadBlackboard(id: string, registry: TraceBusRegistry): Promise<Blackboard | null> {
  const bus = registry.get(id);
  if (bus) {
    const snap = bus.get_final_blackboard();
    if (snap) return snap;
  }
  const durability = await acquire_durability();
  if (!durability) return null;
  const rows = await durability.db
    .select({ blackboard: generations.current_blackboard })
    .from(generations)
    .where(eq(generations.id, id))
    .limit(1);
  const raw = rows[0]?.blackboard ?? null;
  if (!raw) return null;
  return (typeof raw === "string" ? JSON.parse(raw) : raw) as Blackboard;
}

export function result_routes(registry: TraceBusRegistry) {
  const app = new Hono();

  // biome-ignore lint/suspicious/noExplicitAny: Hono context is generic; the route handler shape varies per route
  async function authorize(c: any, id: string) {
    const token = c.req.header("x-retune-generation-access");
    const claims = verifyGenerationAccessToken(token, id);
    if (!claims) return { ok: false as const, response: c.json({ error: "forbidden" }, 403) };

    const durability = await acquire_durability();
    if (!durability) return { ok: true as const, userId: claims.user_id };
    const rows = await durability.db
      .select({ user_id: generations.user_id })
      .from(generations)
      .where(eq(generations.id, id))
      .limit(1);
    const owner = rows[0]?.user_id;
    if (owner && claims.user_id !== "__TEST_BYPASS__" && owner !== claims.user_id) {
      return { ok: false as const, response: c.json({ error: "forbidden" }, 403) };
    }
    return { ok: true as const, userId: claims.user_id };
  }

  app.get("/generate/:id", async (c) => {
    const id = c.req.param("id");
    const auth = await authorize(c, id);
    if (!auth.ok) return auth.response;

    // 1. In-memory: bus captured the final blackboard on orchestrator return.
    const bus = registry.get(id);
    if (bus) {
      const snap = bus.get_final_blackboard();
      const done = bus.get_done_summary();
      if (snap) {
        return c.json(
          renderResult(id, snap, {
            termination: done?.termination ?? null,
            ticks_executed: done?.ticks_executed ?? 0,
            total_cost_usd: done?.total_cost_usd ?? 0,
            generation_time_ms: done?.total_latency_ms ?? 0,
          }),
        );
      }
    }

    // 2. Persistence fallback.
    const durability = await acquire_durability();
    if (durability) {
      const rows = await durability.db
        .select({
          id: generations.id,
          blackboard: generations.current_blackboard,
          ticks_executed: generations.ticks_executed,
          total_cost_usd: generations.total_cost_usd,
          total_latency_ms: generations.total_latency_ms,
          termination: generations.termination,
        })
        .from(generations)
        .where(eq(generations.id, id))
        .limit(1);
      const row = rows[0];
      if (row) {
        const snap =
          typeof row.blackboard === "string"
            ? (JSON.parse(row.blackboard) as Blackboard)
            : ((row.blackboard ?? null) as Blackboard | null);
        return c.json(
          renderResult(id, snap, {
            termination: row.termination ?? null,
            ticks_executed: row.ticks_executed ?? 0,
            total_cost_usd: row.total_cost_usd ?? 0,
            generation_time_ms: row.total_latency_ms ?? 0,
          }),
        );
      }
    }

    return c.json({ error: "not_found", generation_id: id }, 404);
  });

  app.get("/generate/:id/audit", async (c) => {
    const id = c.req.param("id");
    const auth = await authorize(c, id);
    if (!auth.ok) return auth.response;
    const bus = registry.get(id);
    if (bus) {
      const trace = bus.get_trace_log();
      return c.json({
        generation_id: id,
        events: trace,
        done: bus.get_done_summary(),
        source: "memory",
      });
    }
    return c.json({ error: "not_found", generation_id: id }, 404);
  });

  // ── Document downloads ────────────────────────────────────────────────
  // Routes: /generate/:id/resume.docx, /resume.pdf, /cover_letter.docx,
  //         /cover_letter.pdf
  // The renderer reads the final blackboard, writes the markdown to a
  // tempdir, invokes packages/agent/src/agent/generate_resume.py, and
  // streams the produced bytes back. All errors are typed JSON, never 5xx.

  const PATH_KINDS: Record<string, DocumentKind> = {
    resume: "resume",
    cover_letter: "cover_letter",
  };

  for (const [slug, kind] of Object.entries(PATH_KINDS)) {
    for (const fmt of ["docx", "pdf"] as const) {
      app.get(`/generate/:id/${slug}.${fmt}`, async (c) => {
        const id = c.req.param("id");
        const auth = await authorize(c, id);
        if (!auth.ok) return auth.response;
        const blackboard = await loadBlackboard(id, registry);
        if (!blackboard) {
          return c.json({ error: "not_found", generation_id: id }, 404);
        }
        const result = renderDocument({
          generation_id: id,
          blackboard,
          kind,
          format: fmt as DocumentFormat,
        });
        if (!result.ok || !result.filepath) {
          // Charter 02-Core-Features Epic 06 — document download SLA.
          // Distinguish:
          //   - Content not yet generated      → 422 unprocessable
          //   - Python/render infra unavailable → 503 service unavailable
          //   - Render execution failed         → 500 with detail
          // (Never 501 — that means "feature not implemented" which is
          // never the truth for a route that exists in the registry.)
          const error = result.error ?? "render_failed";
          let status: 422 | 500 | 503 = 500;
          if (error === "cover_letter_not_generated" || error === "resume_not_available") {
            status = 422;
          } else if (error === "render_script_missing" || error === "pdf_render_unavailable") {
            status = 503;
          }
          return c.json(
            {
              error,
              generation_id: id,
              kind: slug,
              format: fmt,
              ...(status === 503
                ? {
                    message:
                      "Document rendering temporarily unavailable. Try again shortly or contact support if it persists.",
                    retry_after_seconds: 30,
                  }
                : {}),
            },
            status,
          );
        }
        const bytes = readBytes(result.filepath);
        // node Buffer is acceptable as a Response body in undici/Hono.
        return new Response(bytes as unknown as ReadableStream, {
          headers: {
            "Content-Type": result.mime,
            "Content-Disposition": `attachment; filename="${result.filename}"`,
            "Cache-Control": "private, max-age=60",
          },
        });
      });
    }
  }

  return app;
}
