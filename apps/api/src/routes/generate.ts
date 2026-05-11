/**
 * POST /generate
 *
 * Accepts a generation request, validates payload, and delegates
 * lifecycle create/start orchestration to the GenerationLifecycleModule.
 */

import type { GdprAuditPacket } from "@retune/agent";
import { generations, jds } from "@retune/db/pg";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { renderGdprPacketAsText } from "../lib/gdpr-pdf-renderer";
import type { TraceBusRegistry } from "../lib/trace-bus";
import { acquire_durability } from "../runtime/persistence-factory";
import { createAndStartGeneration } from "../runtime/generation-lifecycle";

const log = (level: "info" | "warn" | "error", tag: string, msg: string, meta?: unknown) => {
  const prefix = `[generate:${tag}]`;
  const line = meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else console.log(line);
};

const GenerateRequestSchema = z.object({
  jd_title: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  market: z.enum(["US", "UK"]).optional().default("US"),
  jd_url: z.string().url().optional(),
  jd_text: z.string().min(1).max(50_000).optional(),
  profile_text: z.string().min(1).max(50_000).optional(),
});

export function generate_routes(registry: TraceBusRegistry) {
  const app = new Hono();

  app.get("/generations", async (c) => {
    const durability = await acquire_durability();
    if (durability) {
      const rows = await durability.db
        .select({
          id: generations.id,
          ticks_executed: generations.ticks_executed,
          total_cost_usd: generations.total_cost_usd,
          created_at: generations.created_at,
          completed_at: generations.completed_at,
          jd_raw_text: jds.raw_text,
        })
        .from(generations)
        .leftJoin(jds, eq(generations.jd_id, jds.id))
        .orderBy(desc(generations.created_at))
        .limit(50);

      return c.json(
        rows.map((row) => {
          const lines = row.jd_raw_text?.split("\n") ?? [];
          return {
            id: row.id,
            status: row.completed_at ? "complete" : "running",
            role: lines[0]?.slice(0, 100) || "Cognitive Cycle",
            company: lines[1]?.slice(0, 100) || "Retune",
            ticks_executed: row.ticks_executed,
            total_cost_usd: row.total_cost_usd,
            createdAt: row.created_at,
            runtime: "temporal",
          };
        }),
      );
    }

    const active = registry.list_active().map((id) => ({
      id,
      status: "running",
      role: "Active Thought",
      company: "Cognitive Substrate",
      runtime: "in_memory",
    }));
    return c.json(active);
  });

  app.post("/generate", async (c) => {
    log("info", "POST /generate", "request received");
    const body = await c.req.json().catch(() => ({}));
    const parsed = GenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      log("warn", "POST /generate", "validation failed", parsed.error.issues);
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    if (
      !parsed.data.jd_title &&
      !parsed.data.company &&
      !parsed.data.jd_text &&
      !parsed.data.profile_text &&
      !parsed.data.jd_url
    ) {
      log("warn", "POST /generate", "rejected — no usable input fields");
      return c.json(
        {
          error: "invalid_request",
          message: "at least one of jd_title / company / jd_text / jd_url / profile_text required",
        },
        400,
      );
    }

    log("info", "POST /generate", "payload accepted", {
      has_jd_url: !!parsed.data.jd_url,
      has_jd_text: !!parsed.data.jd_text,
      has_profile_text: !!parsed.data.profile_text,
      market: parsed.data.market,
    });

    try {
      const result = await createAndStartGeneration({
        payload: parsed.data,
        registry,
        log,
      });
      return c.json(result, 202);
    } catch (err) {
      if (err instanceof Error && err.message === "persistence_required") {
        return c.json(
          { error: "persistence_required", message: "RETUNE_TEMPORAL requires RETUNE_PERSIST" },
          503,
        );
      }

      log("error", "POST /generate", "lifecycle create/start failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: "generation_start_failed" }, 500);
    }
  });

  app.delete("/generate/:id", (c) => {
    const id = c.req.param("id");
    const aborted = registry.abort(id);
    if (!aborted) {
      return c.json({ error: "not_found_or_already_complete" }, 404);
    }
    return c.json({ cancelled: true, generation_id: id });
  });

  app.get("/generate/:id/gdpr-pdf", async (c) => {
    const id = c.req.param("id");
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }
    const { gdpr_packets } = await import("@retune/db/pg");
    const { eq } = await import("drizzle-orm");
    const row = await durability.db
      .select()
      .from(gdpr_packets)
      .where(eq(gdpr_packets.generation_id, id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }
    let packet: GdprAuditPacket;
    try {
      packet = (
        typeof row.packet === "string" ? JSON.parse(row.packet) : row.packet
      ) as GdprAuditPacket;
    } catch {
      return c.json({ error: "malformed_packet" }, 500);
    }
    const buf = renderGdprPacketAsText(packet);
    return new Response(buf, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="gdpr-audit-${id}.txt"`,
      },
    });
  });

  return app;
}
