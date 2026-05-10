/**
 * Applications CRUD endpoints.
 *
 * Replaces the legacy Next.js API routes that directly accessed SQLite.
 * All application data now flows through the cognitive system's PostgreSQL store.
 */

import { generations, jds } from "@retune/db/pg";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { acquire_durability } from "../runtime/persistence-factory";

const log = (level: "info" | "warn" | "error", tag: string, msg: string, meta?: unknown) => {
  const prefix = `[applications:${tag}]`;
  const line = meta !== undefined ? `${prefix} ${msg} ${JSON.stringify(meta)}` : `${prefix} ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
};

const CreateApplicationSchema = z.object({
  jd_text: z.string().min(50).max(50_000),
  jd_url: z.string().url().optional(),
  company: z.string().min(1).optional(),
  role_title: z.string().min(1).optional(),
  market: z.enum(["US", "UK"]).default("US"),
});

export function applications_routes() {
  const app = new Hono();

  // GET /applications - List all generations for the user
  app.get("/applications", async (c) => {
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }

    // TODO: Add user authentication and filter by user_id
    const user_id = durability.default_user_id;

    const rows = await durability.db
      .select({
        id: generations.id,
        user_id: generations.user_id,
        jd_id: generations.jd_id,
        ticks_executed: generations.ticks_executed,
        total_cost_usd: generations.total_cost_usd,
        total_latency_ms: generations.total_latency_ms,
        created_at: generations.created_at,
        completed_at: generations.completed_at,
        termination: generations.termination,
      })
      .from(generations)
      .where(eq(generations.user_id, user_id))
      .orderBy(desc(generations.created_at))
      .limit(50);

    return c.json({
      applications: rows.map((row) => ({
        id: row.id,
        status: row.completed_at ? "completed" : "generating",
        ticks_executed: row.ticks_executed,
        total_cost_usd: row.total_cost_usd,
        created_at: row.created_at,
        completed_at: row.completed_at,
        termination: row.termination,
      })),
    });
  });

  // GET /applications/:id - Get single application with blackboard
  app.get("/applications/:id", async (c) => {
    const id = c.req.param("id");
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }

    const row = await durability.db
      .select()
      .from(generations)
      .where(eq(generations.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json({
      id: row.id,
      user_id: row.user_id,
      jd_id: row.jd_id,
      status: row.completed_at ? "completed" : "generating",
      blackboard: row.current_blackboard,
      ticks_executed: row.ticks_executed,
      total_cost_usd: row.total_cost_usd,
      created_at: row.created_at,
      completed_at: row.completed_at,
      termination: row.termination,
    });
  });

  // GET /applications/:id/blackboard - Get just the blackboard data
  app.get("/applications/:id/blackboard", async (c) => {
    const id = c.req.param("id");
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }

    const row = await durability.db
      .select({ blackboard: generations.current_blackboard })
      .from(generations)
      .where(eq(generations.id, id))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) {
      return c.json({ error: "not_found" }, 404);
    }

    return c.json(row.blackboard);
  });

  // POST /applications - Create new application (triggers generation)
  app.post("/applications", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = CreateApplicationSchema.safeParse(body);

    if (!parsed.success) {
      log("warn", "POST", "validation failed", parsed.error.issues);
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    // Forward to the existing /generate endpoint
    const generateResponse = await fetch(`http://localhost:${process.env.PORT ?? 8787}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jd_text: parsed.data.jd_text,
        jd_url: parsed.data.jd_url,
        company: parsed.data.company,
        jd_title: parsed.data.role_title,
        market: parsed.data.market,
      }),
    });

    if (!generateResponse.ok) {
      const error = await generateResponse.json().catch(() => ({ error: "generation_failed" }));
      return c.json(error, generateResponse.status as 400 | 401 | 403 | 404 | 500);
    }

    const result = await generateResponse.json();
    return c.json(result, 202);
  });

  return app;
}
