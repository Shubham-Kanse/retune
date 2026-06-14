/**
 * Evidence ledger endpoints.
 *
 *   GET  /facts — list the caller's career facts (the compounding profile
 *                 asset built from drift answers, extraction, and
 *                 generation-time evidence solving).
 *   POST /facts — upsert a fact. Re-asserting an existing (kind, claim)
 *                 updates evidence/confidence instead of duplicating.
 *
 * Both require an authenticated identity (requireIdentity middleware) and
 * are scoped strictly to the caller.
 */

import { career_facts } from "@retune/db/pg";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getIdentity, requireIdentity } from "../lib/auth-middleware";
import { acquire_durability } from "../runtime/persistence-factory";

const FACT_KINDS = ["skill", "achievement", "scope", "credential"] as const;
const FACT_SOURCES = ["drift_check", "resume_extraction", "generation", "user_edit"] as const;

const UpsertFactSchema = z.object({
  kind: z.enum(FACT_KINDS),
  claim: z.string().min(1).max(500),
  evidence: z.string().max(4000).optional(),
  source: z.enum(FACT_SOURCES).default("user_edit"),
  confidence: z.number().min(0).max(1).default(0.5),
  verified_by_user: z.boolean().default(true),
});

export function facts_routes() {
  const app = new Hono();

  app.get("/facts", requireIdentity(), async (c) => {
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }
    const identity = getIdentity(c);

    const kind = c.req.query("kind");
    const scope = and(
      eq(career_facts.user_id, identity.user_id),
      isNull(career_facts.deleted_at),
      ...(kind ? [eq(career_facts.kind, kind)] : []),
    );

    const rows = await durability.db
      .select()
      .from(career_facts)
      .where(scope)
      .orderBy(desc(career_facts.updated_at))
      .limit(500);

    return c.json({
      facts: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        claim: r.claim,
        evidence: r.evidence,
        source: r.source,
        confidence: r.confidence,
        verified_by_user: r.verified_by_user,
        created_from_generation_id: r.created_from_generation_id,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  });

  app.post("/facts", requireIdentity(), async (c) => {
    const durability = await acquire_durability();
    if (!durability) {
      return c.json({ error: "persistence_not_configured" }, 503);
    }
    const identity = getIdentity(c);

    const body = await c.req.json().catch(() => ({}));
    const parsed = UpsertFactSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400);
    }

    const [row] = await durability.db
      .insert(career_facts)
      .values({
        user_id: identity.user_id,
        kind: parsed.data.kind,
        claim: parsed.data.claim,
        evidence: parsed.data.evidence ?? null,
        source: parsed.data.source,
        confidence: parsed.data.confidence,
        verified_by_user: parsed.data.verified_by_user,
      })
      .onConflictDoUpdate({
        target: [career_facts.user_id, career_facts.kind, career_facts.claim],
        set: {
          evidence: parsed.data.evidence ?? null,
          source: parsed.data.source,
          confidence: parsed.data.confidence,
          verified_by_user: parsed.data.verified_by_user,
          deleted_at: null,
          updated_at: sql`now()`,
        },
      })
      .returning();

    if (!row) return c.json({ error: "fact_upsert_failed" }, 500);
    return c.json({ ok: true, fact_id: row.id }, 201);
  });

  return app;
}
