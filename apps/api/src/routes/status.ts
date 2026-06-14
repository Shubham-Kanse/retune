/**
 * GET /generate/:id/status
 *
 * Returns the current state of a generation. Two information sources:
 *
 *   1. Temporal — when `RETUNE_TEMPORAL=1`, queries `getStatusQuery`
 *      against the workflow handle. This is the live source.
 *   2. Postgres — when persistence is wired but no Temporal, returns the
 *      most recently persisted snapshot of the generation row.
 *
 * Falls back to 404 when neither knows about the generation.
 */

import { getStatusQuery } from "@retune/agent";
import { generations } from "@retune/db/pg";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getIdentity, ownsRow, requireIdentity } from "../lib/auth-middleware";
import { statusFromPersistenceRow } from "../lib/generation-status";
import { acquire_durability } from "../runtime/persistence-factory";
import { acquire_temporal } from "../runtime/temporal-factory";
import { workflow_id_for } from "../runtime/workflow-ids";

export interface StatusResponse {
  generation_id: string;
  /** "running" | "awaiting_user_answer" | "completed" | "failed" | "starting" */
  status: string;
  ticks_executed: number;
  total_cost_usd: number;
  termination: string | null;
  source: "temporal" | "postgres" | "memory";
}

export function status_routes() {
  const app = new Hono();

  app.get("/generate/:id/status", requireIdentity(), async (c) => {
    const generation_id = c.req.param("id");

    // Ownership gate: when the generation is persisted, it must belong
    // to the caller. (When persistence is off — pure in-memory dev — the
    // row can't be looked up and the dev-fallback identity applies.)
    const identity = getIdentity(c);
    const durabilityForAuth = await acquire_durability();
    if (durabilityForAuth && identity.enforced) {
      const owned = await durabilityForAuth.db
        .select({ user_id: generations.user_id })
        .from(generations)
        .where(eq(generations.id, generation_id))
        .limit(1);
      if (owned[0] && !ownsRow(identity, owned[0].user_id)) {
        return c.json({ error: "not_found", generation_id }, 404);
      }
    }

    // Try Temporal first — most accurate when in temporal mode.
    const temporal = await acquire_temporal();
    if (temporal) {
      try {
        const handle = temporal.client.workflow.getHandle(workflow_id_for(generation_id));
        const snap = await handle.query(getStatusQuery);
        const body: StatusResponse = {
          generation_id,
          status: snap.status,
          ticks_executed: snap.ticks_executed,
          total_cost_usd: snap.total_cost_usd,
          termination: snap.last_termination,
          source: "temporal",
        };
        return c.json(body);
      } catch (err) {
        // Workflow doesn't exist (yet) — fall through to DB lookup.
        // Real "internal error" is rare from query so we don't surface it.
        if (process.env.NODE_ENV !== "production") {
          console.warn("temporal_status_query_failed", String(err));
        }
      }
    }

    // Postgres fallback — show whatever we last persisted.
    const durability = await acquire_durability();
    if (durability) {
      const rows = await durability.db
        .select({
          id: generations.id,
          ticks_executed: generations.ticks_executed,
          total_cost_usd: generations.total_cost_usd,
          termination: generations.termination,
          completed_at: generations.completed_at,
        })
        .from(generations)
        .where(eq(generations.id, generation_id))
        .limit(1);
      const row = rows[0];
      if (row) {
        const body: StatusResponse = {
          generation_id,
          status: statusFromPersistenceRow({
            completed_at: row.completed_at,
            termination: row.termination,
          }),
          ticks_executed: row.ticks_executed,
          total_cost_usd: row.total_cost_usd,
          termination: row.termination,
          source: "postgres",
        };
        return c.json(body);
      }
    }

    return c.json({ error: "not_found", generation_id }, 404);
  });

  return app;
}
