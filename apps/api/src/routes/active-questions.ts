/**
 * POST /active-questions/:id/answer
 *
 * Accepts a user's answer, validates it, signals the Temporal workflow
 * that owns the generation, and returns 202 Accepted. The workflow
 * processes the answer asynchronously; callers either poll
 * `/generate/:id/status` (commit #5) or re-subscribe to the SSE trace.
 */

import { userAnsweredSignal } from "@retune/agent";
import { active_questions, generations } from "@retune/db/pg";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getIdentity, ownsRow, requireIdentity } from "../lib/auth-middleware";
import { acquire_durability } from "../runtime/persistence-factory";
import { acquire_temporal } from "../runtime/temporal-factory";
import { workflow_id_for } from "../runtime/workflow-ids";

const AnswerSchema = z.object({
  answer_text: z.string().min(1).max(2000),
});

export function active_questions_routes() {
  const app = new Hono();

  app.post("/active-questions/:id/answer", requireIdentity(), async (c) => {
    const question_id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const parsed = AnswerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    const durability = await acquire_durability();
    if (!durability) {
      return c.json(
        { error: "persistence_required", message: "set RETUNE_PERSIST=pglite|postgres" },
        503,
      );
    }

    // Look up the question → generation_id for workflow routing.
    const aq_rows = await durability.db
      .select({
        id: active_questions.id,
        generation_id: active_questions.generation_id,
        answered_at: active_questions.answered_at,
      })
      .from(active_questions)
      .where(eq(active_questions.id, question_id))
      .limit(1);
    const aq = aq_rows[0];
    if (!aq) {
      return c.json({ error: "not_found", question_id }, 404);
    }
    if (aq.answered_at !== null) {
      return c.json({ error: "already_answered", question_id }, 409);
    }

    // Confirm the generation exists and belongs to the caller.
    const gen_rows = await durability.db
      .select({ id: generations.id, user_id: generations.user_id })
      .from(generations)
      .where(eq(generations.id, aq.generation_id))
      .limit(1);
    if (!gen_rows[0] || !ownsRow(getIdentity(c), gen_rows[0].user_id)) {
      return c.json({ error: "generation_not_found", generation_id: aq.generation_id }, 404);
    }

    const temporal = await acquire_temporal();
    if (!temporal) {
      return c.json(
        {
          error: "temporal_required",
          message: "answer loop requires RETUNE_TEMPORAL=1 and a running worker",
        },
        503,
      );
    }

    // Signal the workflow. Temporal guarantees at-most-once signal
    // delivery per call; the workflow handler buffers if multiple
    // signals land before the condition resolves.
    const handle = temporal.client.workflow.getHandle(workflow_id_for(aq.generation_id));
    await handle.signal(userAnsweredSignal, {
      question_id: aq.id,
      answer_text: parsed.data.answer_text,
    });

    return c.json(
      {
        question_id,
        generation_id: aq.generation_id,
        status: "signaled",
      },
      202,
    );
  });

  return app;
}
