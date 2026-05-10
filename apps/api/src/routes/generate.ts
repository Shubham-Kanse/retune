/**
 * POST /generate
 *
 * Accepts a (jd_title, company) pair, mints a `generation_id`, spins up a
 * cognitive cycle in the background, and returns the id so the caller
 * can subscribe to the SSE trace stream.
 *
 * Commit #3 replaces the background promise with a Temporal workflow so
 * generations survive server restarts.
 */

import { randomUUID } from "node:crypto";
import { COGNITIVE_TASK_QUEUE, type GdprAuditPacket, runGenerationWorkflow } from "@retune/agent";
import { generations, jds, users } from "@retune/db/pg";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { renderGdprPacketAsText } from "../lib/gdpr-pdf-renderer";
import { dualWriteJobDescription } from "../lib/optimized-dual-write";
import type { TraceBusRegistry } from "../lib/trace-bus";
import { acquire_durability } from "../runtime/persistence-factory";
import { acquire_temporal } from "../runtime/temporal-factory";
import { run_generation } from "../runtime/workbench-runtime";
import { workflow_id_for } from "../runtime/workflow-ids";

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

  // GET /generations — list generations for the dashboard
  app.get("/generations", async (c) => {
    const durability = await acquire_durability();
    if (durability) {
      // In production/postgres mode, read from the database with JD info
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

    // In-memory mode fallback — list active generations from the registry
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

    const generation_id = randomUUID();
    const temporal = await acquire_temporal();

    // Temporal path — durable workflow handles the generation end-to-end.
    // No local TraceBus; the frontend polls `/generate/:id` for status
    // or will consume the workflow's trace stream in commit #5.
    log("info", "POST /generate", `minted generation_id=${generation_id}`);

    if (temporal) {
      log("info", "POST /generate", "temporal runtime detected, starting workflow");
      const durability = await acquire_durability();
      if (!durability) {
        log("error", "POST /generate", "temporal requires persistence but none configured");
        return c.json(
          { error: "persistence_required", message: "RETUNE_TEMPORAL requires RETUNE_PERSIST" },
          503,
        );
      }
      // Seed the jds + user rows so the workflow's FK targets exist.
      const dev_user_id = durability.default_user_id;
      // Ensure dev user exists (idempotent).
      await durability.db
        .insert(users)
        .values({
          id: dev_user_id,
          email: "dev@retune.local",
          personaType: "experienced",
          market: "US",
          locale: "en-US",
        })
        .onConflictDoNothing();
      const jd_id = randomUUID();
      await durability.db.insert(jds).values({
        id: jd_id,
        source: "api",
        content_hash: generation_id.slice(0, 16),
        raw_text: `${parsed.data.jd_title ?? ""}\n${parsed.data.company ?? ""}`.trim(),
      });
      try {
        await dualWriteJobDescription({
          db: durability.db,
          userId: dev_user_id,
          jdText: `${parsed.data.jd_text ?? ""}\n${parsed.data.jd_title ?? ""}\n${parsed.data.company ?? ""}`.trim(),
          jdUrl: parsed.data.jd_url ?? null,
          title: parsed.data.jd_title ?? null,
          company: parsed.data.company ?? null,
          market: parsed.data.market ?? "US",
        });
      } catch (err) {
        log("warn", "POST /generate", "optimized job_descriptions dual-write failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      await temporal.client.workflow.start(runGenerationWorkflow, {
        taskQueue: COGNITIVE_TASK_QUEUE,
        workflowId: workflow_id_for(generation_id),
        args: [
          {
            generation_id,
            user_id: dev_user_id,
            jd_id,
            jd_title: parsed.data.jd_title,
            company: parsed.data.company,
          },
        ],
      });

      return c.json(
        {
          generation_id,
          workflow_id: workflow_id_for(generation_id),
          runtime: "temporal",
        },
        202,
      );
    }

    // In-memory path (commit #2): fire-and-forget with a TraceBus.
    log("info", "POST /generate", "in-memory runtime, spawning workbench");
    const bus = registry.create(generation_id);
    run_generation({
      generation_id,
      payload: parsed.data,
      bus,
      external_signal: bus.signal,
    })
      .then(() => {
        log("info", "run_generation", `completed generation_id=${generation_id}`);
      })
      .catch((err) => {
        log("error", "run_generation", `failed generation_id=${generation_id}`, {
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack?.split("\n").slice(0, 5).join(" | ") : undefined,
        });
        bus.publish({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    registry.delete_after(generation_id, 10 * 60 * 1000);
    return c.json(
      {
        generation_id,
        stream: `/generate/${generation_id}/stream`,
        runtime: "in_memory",
      },
      202,
    );
  });

  // DELETE /generate/:id — cancel a running in-memory generation
  app.delete("/generate/:id", (c) => {
    const id = c.req.param("id");
    const aborted = registry.abort(id);
    if (!aborted) {
      return c.json({ error: "not_found_or_already_complete" }, 404);
    }
    return c.json({ cancelled: true, generation_id: id });
  });

  // GET /generate/:id/gdpr-pdf — download the GDPR Article 22 audit packet as text
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
