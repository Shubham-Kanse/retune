import { db } from "@retune/db";
import { sql } from "drizzle-orm";

export interface GeneratedResultShape {
  verdict?: string;
  company?: string | null;
  role?: string | null;
  resume?: string | null;
  cover_letter?: string | null;
  strategy?: string | null;
  ats_score?: number | null;
  interview_ready_score?: number | null;
  submission_confidence?: number | null;
}

function mapShipDecision(verdict?: string): "ship" | "revise" | "refuse" {
  if (verdict === "refuse" || verdict === "refused") return "refuse";
  if (verdict === "revise") return "revise";
  return "ship";
}

export async function dualWriteOptimizedResult(generationId: string, data: GeneratedResultShape) {
  const shipDecision = mapShipDecision(data.verdict);
  await db.execute(sql`
    insert into public.generation_results
      (generation_id, ship_decision, ats_score, company, role, resume_content, cover_letter_content, application_strategy, critic_scores)
    values
      (${generationId}, ${shipDecision}, ${data.ats_score ?? null}, ${data.company ?? null}, ${data.role ?? null}, ${data.resume ?? null}, ${data.cover_letter ?? null}, ${data.strategy ?? null}, ${JSON.stringify({
        interview_ready_score: data.interview_ready_score ?? null,
        submission_confidence: data.submission_confidence ?? null,
      })}::jsonb)
    on conflict (generation_id) do update set
      ship_decision = excluded.ship_decision,
      ats_score = excluded.ats_score,
      company = excluded.company,
      role = excluded.role,
      resume_content = excluded.resume_content,
      cover_letter_content = excluded.cover_letter_content,
      application_strategy = excluded.application_strategy,
      critic_scores = excluded.critic_scores
  `);

  if (data.strategy && data.strategy.trim().length > 0) {
    await db.execute(sql`
      insert into public.generation_artifacts
        (generation_id, kind, version, is_current, storage_key, size_bytes)
      values
        (${generationId}, 'strategy_md', 1, true, ${`inline://applications/${generationId}/application_strategy`}, ${data.strategy.length})
      on conflict (generation_id, kind) where is_current = true do update set
        storage_key = excluded.storage_key,
        size_bytes = excluded.size_bytes
    `);
  }

  if (data.ats_score != null) {
    await db.execute(sql`
      insert into public.generation_artifacts
        (generation_id, kind, version, is_current, storage_key)
      values
        (${generationId}, 'ats_report_json', 1, true, ${`inline://generation_results/${generationId}/critic_scores`})
      on conflict (generation_id, kind) where is_current = true do update set
        storage_key = excluded.storage_key
    `);
  }
}

export async function parityCheckResult(generationId: string, data: GeneratedResultShape) {
  const raw = await db.execute(sql`
    select ship_decision, ats_score
    from public.generation_results
    where generation_id = ${generationId}
    limit 1
  `);
  const rows = (Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []) as Array<{
    ship_decision: string;
    ats_score: number | null;
  }>;
  const row = rows[0];
  if (!row) return;

  const expectedShip = mapShipDecision(data.verdict);
  const expectedAts = data.ats_score ?? null;
  const atsDelta =
    expectedAts == null || row.ats_score == null ? 0 : Math.abs(Number(row.ats_score) - Number(expectedAts));

  if (row.ship_decision !== expectedShip || atsDelta > 0.01) {
    console.error("[optimized-parity] generation_results mismatch", {
      generationId,
      expected: { ship_decision: expectedShip, ats_score: expectedAts },
      actual: row,
    });
  }
}

export async function readOptimizedResult(generationId: string): Promise<GeneratedResultShape | null> {
  const raw = await db.execute(sql`
    select
      gr.ship_decision,
      gr.ats_score,
      gr.company,
      gr.role,
      gr.resume_content,
      gr.cover_letter_content,
      gr.application_strategy
    from public.generation_results gr
    where gr.generation_id = ${generationId}
    limit 1
  `);
  const rows = (Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []) as Array<{
    ship_decision: string;
    ats_score: number | null;
    company: string | null;
    role: string | null;
    resume_content: string | null;
    cover_letter_content: string | null;
    application_strategy: string | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  return {
    verdict: row.ship_decision,
    ats_score: row.ats_score,
    company: row.company,
    role: row.role,
    resume: row.resume_content,
    cover_letter: row.cover_letter_content,
    strategy: row.application_strategy,
  };
}
