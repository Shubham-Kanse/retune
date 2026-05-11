import { apiUrl } from "@/lib/api-config";
import { safeFetch, safeQuery } from "@/lib/errors";
import { getSession } from "@/lib/session";
import { applications, db } from "@retune/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  // 1. Fetch legacy generations from SQLite
  const rows = await safeQuery(
    () =>
      db
      .select()
      .from(applications)
      .where(eq(applications.userId, session.userId))
      .orderBy(desc(applications.createdAt))
      .limit(50),
    [] as any[],
  );

  // 2. Fetch new generations from Hono API (Cognitive Architecture)
  const cognitiveGenerations = await safeFetch<any[]>(
    apiUrl("/generations"),
    undefined,
    [],
    {
      parse: (res) => res.json(),
      onNonOk: () => [],
    },
  );

  const summaries = rows.map((row) => {
    // ... (existing mapping logic)
    const pipelineLog = row.pipelineLog ? JSON.parse(row.pipelineLog) : null;
    const cognitive =
      typeof pipelineLog === "object" && pipelineLog?.cognitive ? pipelineLog.cognitive : null;

    // ... (SPECIALIST_BRAIN_REGION and traces logic)
    const SPECIALIST_BRAIN_REGION: Record<string, string> = {
      jd_analyzer: "prefrontal_cortex",
      jd_span_extractor: "prefrontal_cortex",
      company_researcher: "hippocampus",
      company_schema_retriever: "hippocampus",
      profile_mapper: "anterior_cingulate",
      gap_mapper: "anterior_cingulate",
      evidence_solver: "parietal_lobe",
      summary_writer: "dlpfc",
      skills_writer: "parietal_lobe",
      experience_writer: "temporal_lobe",
      sequential_bullet_composer: "temporal_lobe",
      narrative_arc_proposer: "default_mode_network",
      ats_patcher: "basal_ganglia",
      quality_gate: "dorsal_acc",
      critic_ensemble: "dorsal_acc",
      cover_letter_writer: "vlpfc",
      strategy_planner: "default_mode_network",
      validator: "thalamus",
      theory_of_mind: "vmPFC",
      outcome_predictor: "orbitofrontal",
      refuse_or_ship_gate: "amygdala",
      voice_fingerprint_extractor: "insula",
      emotional_state_modeler: "insula",
      honesty_calibrator: "anterior_cingulate",
      orchestrator: "salience_network",
    };
    const traces: Array<{
      specialist: string;
      brain_region: string;
      micro_stage: string;
      cost_usd: number;
      latency_ms: number;
    }> = Array.isArray(pipelineLog?.events)
      ? pipelineLog.events
          .filter((e: { type?: string }) => e.type === "trace" || e.type === "specialist_picked")
          .map(
            (e: {
              specialist?: string;
              step?: string;
              brain_region?: string;
              micro_stage?: string;
              cost_usd?: number;
              latency_ms?: number;
            }) => {
              const specialist = e.specialist ?? e.step ?? "orchestrator";
              return {
                specialist,
                brain_region:
                  e.brain_region ?? SPECIALIST_BRAIN_REGION[specialist] ?? "prefrontal_cortex",
                micro_stage: e.micro_stage ?? specialist,
                cost_usd: e.cost_usd ?? 0,
                latency_ms: e.latency_ms ?? 0,
              };
            },
          )
      : [];

    return {
      id: row.id,
      company: row.companyName,
      role: row.roleTitle,
      verdict: cognitive?.shipVerdict ?? (row.status === "completed" ? "ship" : row.status),
      interviewReadyScore: cognitive?.interviewReadyScore ?? null,
      atsScore: row.atsScore ?? null,
      totalCostUsd: row.tokenUsage ? (JSON.parse(row.tokenUsage).cost_usd ?? 0) : 0,
      ticksExecuted: cognitive?.ticksExecuted ?? 0,
      createdAt: row.createdAt?.toISOString() ?? null,
      traces,
    };
  });

  // 3. Merge and deduplicate (by ID)
  const legacyIds = new Set(summaries.map((s) => s.id));
  const merged = [
    ...summaries,
    ...cognitiveGenerations
      .filter((g: any) => !legacyIds.has(g.id))
      .map((g: any) => ({
        id: g.id,
        company: g.company || "Retuned",
        role: g.role || "Cognitive Cycle",
        verdict: g.status === "complete" ? "ship" : g.status || "running",
        interviewReadyScore: null,
        atsScore: null,
        totalCostUsd: g.total_cost_usd ?? 0,
        ticksExecuted: g.ticks_executed ?? 0,
        createdAt: g.createdAt ?? new Date().toISOString(),
        traces: [],
      })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(merged);
}
