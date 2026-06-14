/**
 * Evidence-ledger write helpers (career_facts, migration 0018).
 *
 * Mirrors the `ensureGenerationPreflightsTable` guardrail pattern so the
 * write path works before the migration has been applied to a given
 * environment. All writes are best-effort: a ledger failure must never
 * block the user's generation.
 */

import type { DriftAnswer, DriftLevel } from "@/lib/drift-preflight";
import { db } from "@retune/db";
import { sql } from "drizzle-orm";

let ensured: Promise<void> | null = null;

export function ensureCareerFactsTable(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await db.execute(
        sql.raw(`
        CREATE TABLE IF NOT EXISTS career_facts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind varchar(32) NOT NULL,
          claim text NOT NULL,
          evidence text,
          source varchar(48) NOT NULL,
          confidence double precision NOT NULL DEFAULT 0.5,
          verified_by_user boolean NOT NULL DEFAULT false,
          created_from_generation_id uuid REFERENCES generations(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz,
          CONSTRAINT career_facts_user_kind_claim_uniq UNIQUE (user_id, kind, claim)
        );
      `),
      );
      await db.execute(
        sql.raw("CREATE INDEX IF NOT EXISTS career_facts_user_ix ON career_facts (user_id);"),
      );
    } catch {
      // Best-effort guardrail; reads/writes fail typed if this didn't run.
    }
  })();
  return ensured;
}

/** Self-reported drift levels mapped to ledger confidence. */
const LEVEL_CONFIDENCE: Record<DriftLevel, number> = {
  no: 0,
  theory: 0.3,
  basic: 0.45,
  hands_on: 0.65,
  strong: 0.85,
  similar_stack: 0.5,
};

const LEVEL_EVIDENCE: Record<DriftLevel, string> = {
  no: "No experience",
  theory: "Theory only",
  basic: "Basic knowledge",
  hands_on: "Hands-on experience",
  strong: "Strong experience",
  similar_stack: "Experience with a similar stack",
};

/**
 * Record drift-check answers as career facts. "no" answers are skipped —
 * the ledger holds what the user CAN claim, with calibrated confidence.
 */
export async function recordDriftFacts(userId: string, answers: DriftAnswer[]): Promise<void> {
  const claimable = answers.filter((a) => a.level !== "no");
  if (claimable.length === 0) return;

  try {
    await ensureCareerFactsTable();
    for (const a of claimable) {
      const confidence = LEVEL_CONFIDENCE[a.level] ?? 0.5;
      const evidence = `Self-reported via drift check: ${LEVEL_EVIDENCE[a.level] ?? a.level}`;
      await db.execute(sql`
        INSERT INTO career_facts (user_id, kind, claim, evidence, source, confidence, verified_by_user)
        VALUES (${userId}, 'skill', ${a.skill}, ${evidence}, 'drift_check', ${confidence}, true)
        ON CONFLICT (user_id, kind, claim) DO UPDATE SET
          evidence = EXCLUDED.evidence,
          source = EXCLUDED.source,
          confidence = GREATEST(career_facts.confidence, EXCLUDED.confidence),
          verified_by_user = true,
          deleted_at = NULL,
          updated_at = now()
      `);
    }
  } catch (err) {
    // Ledger writes are additive observability — never block generation.
    console.warn(
      "[career-facts] drift fact write failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
