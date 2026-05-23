/**
 * POST /generate
 *
 * Accepts a generation request, validates payload, and delegates
 * lifecycle create/start orchestration to the GenerationLifecycleModule.
 *
 * v003 SOTA upgrade:
 *   - Idempotency: clients pass `idempotency_key` (or one is derived
 *     deterministically) so duplicate submissions return the existing
 *     generation_id.
 *   - Authenticated user propagation: `x-retune-user-id` header is
 *     verified against the internal API key (when configured) so the
 *     blackboard's user_id is the authenticated user, not a dev seed.
 *   - SSRF defence: JD URLs are validated against private/loopback
 *     ranges and metadata endpoints before being forwarded to Jina.
 */

import type { GdprAuditPacket } from "@retune/agent";
import { generations, jds } from "@retune/db/pg";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { renderGdprPacketAsText } from "../lib/gdpr-pdf-renderer";
import { resolveAuthenticatedIdentity } from "../lib/internal-auth";
import { recordSecurityEvent } from "../lib/security-audit";
import type { TraceBusRegistry } from "../lib/trace-bus";
import { createAndStartGeneration } from "../runtime/generation-lifecycle";
import { acquire_durability } from "../runtime/persistence-factory";

const log = (level: "info" | "warn" | "error", tag: string, msg: string, meta?: unknown) => {
  const prefix = `[generate:${tag}]`;
  const line = meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
  // eslint-disable-next-line no-console
  if (level === "error") console.error(line);
  // eslint-disable-next-line no-console
  else console.log(line);
};

const GenerateRequestSchema = z.object({
  jd_title: z.string().min(1).max(256).optional(),
  company: z.string().min(1).max(256).optional(),
  market: z.enum(["US", "UK"]).optional().default("US"),
  jd_url: z.string().url().optional(),
  jd_text: z.string().min(1).max(50_000).optional(),
  profile_text: z.string().min(1).max(50_000).optional(),
  jd_hash: z.string().min(8).max(128).optional(),
  /** Client-supplied idempotency key (recommended). */
  idempotency_key: z.string().min(8).max(256).optional(),
  /** Optional preflight envelope id linking back to drift preflight. */
  preflight_id: z.string().min(1).max(128).optional(),
  preflight_token: z.string().optional(),
  quality_mode: z.enum(["fast", "balanced", "frontier"]).optional(),
  /**
   * 004 §11.3 — full CareerProfileV1 JSON. The web layer is the only
   * caller that should send this; we accept it as `unknown` so the cognitive
   * cycle (which has its own typed schema in `@retune/types`) can validate
   * it without duplicating the contract here.
   */
  career_profile: z.unknown().optional(),
  /** 004 §11.3 — derived CareerUnderstandingV1 JSON. Optional resume strategy fuel. */
  career_understanding: z.unknown().optional(),
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
        .where(isNull(generations.deleted_at))
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

    // 003 §10 — authenticated user resolution.
    const durability = await acquire_durability();
    const default_user_id = durability?.default_user_id ?? "00000000-0000-4000-8000-000000000000";
    const auth = resolveAuthenticatedIdentity(c.req.raw.headers, default_user_id);
    if ("error" in auth) {
      log("warn", "POST /generate", `auth rejected: ${auth.error}`);
      void recordSecurityEvent({
        event_type: "api.auth.rejected",
        actor_kind: "anonymous",
        request_id: c.var.requestId,
        ip: c.req.header("x-forwarded-for") ?? null,
        user_agent: c.req.header("user-agent") ?? null,
        outcome: "denied",
        metadata: { route: "POST /generate", error: auth.error },
      });
      return c.json({ error: auth.error }, auth.status as 401 | 400);
    }

    log("info", "POST /generate", "payload accepted", {
      has_jd_url: !!parsed.data.jd_url,
      has_jd_text: !!parsed.data.jd_text,
      has_profile_text: !!parsed.data.profile_text,
      market: parsed.data.market,
      has_idempotency_key: !!parsed.data.idempotency_key,
      authenticated: auth.identity.authenticated_via_internal_key,
    });

    try {
      const result = await createAndStartGeneration({
        payload: parsed.data,
        user_id: auth.identity.user_id,
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

  app.delete("/generate/:id", async (c) => {
    const id = c.req.param("id");

    // 003 §12: only the owning user (or the dev fallback user) may delete.
    const durability = await acquire_durability();
    const default_user_id = durability?.default_user_id ?? "00000000-0000-4000-8000-000000000000";
    const auth = resolveAuthenticatedIdentity(c.req.raw.headers, default_user_id);
    if ("error" in auth) {
      void recordSecurityEvent({
        event_type: "api.auth.rejected",
        actor_kind: "anonymous",
        request_id: c.var.requestId,
        ip: c.req.header("x-forwarded-for") ?? null,
        user_agent: c.req.header("user-agent") ?? null,
        outcome: "denied",
        metadata: { route: "DELETE /generate/:id", generation_id: id, error: auth.error },
      });
      return c.json({ error: auth.error }, auth.status as 401 | 400);
    }

    // Try aborting in-flight first
    const aborted = registry.abort(id);
    if (aborted) {
      return c.json({ cancelled: true, generation_id: id });
    }

    if (durability) {
      // Ownership check — only delete if the row belongs to the caller.
      const rows = await durability.db
        .select({ id: generations.id, user_id: generations.user_id })
        .from(generations)
        .where(eq(generations.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return c.json({ error: "not_found" }, 404);
      if (row.user_id !== auth.identity.user_id && auth.identity.authenticated_via_internal_key) {
        return c.json({ error: "forbidden" }, 403);
      }
      const updated = await durability.db
        .update(generations)
        .set({ deleted_at: new Date() })
        .where(and(eq(generations.id, id), isNull(generations.deleted_at)))
        .returning();
      if (updated.length) {
        return c.json({ deleted: true, generation_id: id });
      }
    }

    return c.json({ error: "not_found" }, 404);
  });

  app.get("/generate/:id/gdpr-pdf", async (c) => {
    const id = c.req.param("id");
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }

    // 003 §12 — ownership gate.
    const default_user_id = durability.default_user_id;
    const auth = resolveAuthenticatedIdentity(c.req.raw.headers, default_user_id);
    if ("error" in auth) {
      void recordSecurityEvent({
        event_type: "api.auth.rejected",
        actor_kind: "anonymous",
        request_id: c.var.requestId,
        ip: c.req.header("x-forwarded-for") ?? null,
        user_agent: c.req.header("user-agent") ?? null,
        outcome: "denied",
        metadata: { route: "GET /generate/:id/gdpr", error: auth.error },
      });
      return c.json({ error: auth.error }, auth.status as 401 | 400);
    }

    const { gdpr_packets } = await import("@retune/db/pg");
    const row = await durability.db
      .select()
      .from(gdpr_packets)
      .where(eq(gdpr_packets.generation_id, id))
      .limit(1)
      .then((rows) => rows[0]);
    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }
    // Ownership check — packet must belong to the caller's user or the dev fallback.
    if (auth.identity.authenticated_via_internal_key && row.user_id !== auth.identity.user_id) {
      return c.json({ error: "forbidden" }, 403);
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
