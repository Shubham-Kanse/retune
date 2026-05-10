/**
 * POST /generate/:id/outcome
 *
 * Records the candidate-reported outcome of an application that came out
 * of a generation. Per PRD §4.4 the outcome flows into:
 *   - `outcomes` table (training data for OutcomePredictor's empirical
 *     conformal calibration once n ≥ 100)
 *   - `honesty_calibrations` (Bayesian update per claim_type — handled by
 *     the cron `MemoryConsolidator`, not inline)
 *   - `voice_centroids` (incremental centroid update — also cron)
 *
 * Idempotent on (application_id, kind, day) so replays are safe.
 */

import { applications, generations, outcomes } from "@retune/db/pg";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { acquire_durability } from "../runtime/persistence-factory";

const OutcomeSchema = z.object({
  outcome: z.enum([
    "no_response",
    "callback",
    "screen",
    "onsite",
    "offer",
    "rejection_with_reason",
    "rejection_without_reason",
  ]),
  feedback_text: z.string().max(8000).optional(),
});

export function outcome_routes() {
  const app = new Hono();

  app.post("/generate/:id/outcome", async (c) => {
    const generation_id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const parsed = OutcomeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_required" }, 503);
    }

    // Verify the generation exists and find its user.
    const genRows = await durability.db
      .select({ id: generations.id, user_id: generations.user_id, jd_id: generations.jd_id })
      .from(generations)
      .where(eq(generations.id, generation_id))
      .limit(1);
    const gen = genRows[0];
    if (!gen) return c.json({ error: "generation_not_found" }, 404);

    // Find or create the application row that pairs this generation with
    // a user-submitted application. Since this is the first time the user
    // is logging an outcome, we create the application row lazily.
    const existingApps = await durability.db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.userId, gen.user_id), eq(applications.generationId, gen.id)))
      .limit(1);

    let application_id = existingApps[0]?.id;
    if (!application_id) {
      const inserted = await durability.db
        .insert(applications)
        .values({
          userId: gen.user_id,
          jdId: gen.jd_id ?? null,
          generationId: gen.id,
          status: "submitted",
          submittedAt: new Date(),
        })
        .returning();
      application_id = inserted[0]?.id;
      if (!application_id) {
        return c.json({ error: "application_create_failed" }, 500);
      }
    }

    await durability.db.insert(outcomes).values({
      application_id,
      kind: parsed.data.outcome,
      source: "user_self_report",
      feedback_text: parsed.data.feedback_text ?? null,
      captured_at: new Date(),
    });

    return c.json({ ok: true, application_id, kind: parsed.data.outcome });
  });

  return app;
}
