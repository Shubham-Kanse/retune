"use client";

import Link from "next/link";

// Lightweight stubs — @retune/ui/cognitive not yet built as a package
function BrainHeatmap({
  traces,
}: {
  traces: { specialist: string; brain_region: string; cost_usd: number; latency_ms: number }[];
}) {
  const regions = [...new Set(traces.map((t) => t.brain_region))];
  return (
    <div className="flex flex-wrap gap-2 p-4 bg-[#f7f3ec] rounded-3xl">
      {regions.length === 0 ? (
        <span className="text-xs text-[#9a9a8a]">No trace data</span>
      ) : (
        regions.map((r) => (
          <span
            key={r}
            className="text-[10px] font-medium text-[#7e22ce] bg-[#f3e8ff] px-2.5 py-1 rounded-full"
          >
            {r.replace(/_/g, " ")}
          </span>
        ))
      )}
    </div>
  );
}
function GoalDag({
  goals,
  className,
}: {
  goals: { id: string; kind: string; status: string; parentId: string | null }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {goals.map((g) => (
        <span
          key={g.id}
          className={`text-[10px] font-medium px-2 py-1 rounded-full ${g.status === "satisfied" ? "bg-[#f3e8ff] text-[#7e22ce]" : "bg-[#f2ede3] text-[#9a9a8a]"}`}
        >
          {g.kind.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}
import { useEffect, useState } from "react";

const PIPELINE_GOALS = [
  { id: "g1", kind: "extract_spans", status: "satisfied" as const, parentId: null },
  { id: "g2", kind: "classify_discourse", status: "satisfied" as const, parentId: "g1" },
  { id: "g3", kind: "map_gaps", status: "satisfied" as const, parentId: "g1" },
  { id: "g4", kind: "extract_voice_fingerprint", status: "satisfied" as const, parentId: null },
  { id: "g5", kind: "solve_evidence", status: "satisfied" as const, parentId: "g3" },
  { id: "g6", kind: "propose_arcs", status: "satisfied" as const, parentId: "g5" },
  { id: "g7", kind: "model_recruiter_beliefs", status: "satisfied" as const, parentId: "g6" },
  { id: "g8", kind: "compose_resume", status: "satisfied" as const, parentId: "g7" },
  { id: "g9", kind: "estimate_outcome", status: "satisfied" as const, parentId: "g8" },
  { id: "g10", kind: "decide_refuse_or_ship", status: "satisfied" as const, parentId: "g9" },
  { id: "g11", kind: "render_documents", status: "satisfied" as const, parentId: "g10" },
];

interface TraceEvent {
  specialist: string;
  brain_region: string;
  micro_stage: string;
  cost_usd: number;
  latency_ms: number;
}

interface GenerationSummary {
  id: string;
  company: string;
  role: string;
  verdict: string;
  interviewReadyScore: number | null;
  atsScore: number | null;
  totalCostUsd: number;
  ticksExecuted: number;
  createdAt: string;
  traces: TraceEvent[];
}

export default function BrainDashboard() {
  const [generations, setGenerations] = useState<GenerationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/brain/generations")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setGenerations(data as GenerationSummary[]))
      .catch(() => [])
      .finally(() => setLoading(false));
  }, []);

  const selected = generations.find((g) => g.id === selectedId) ?? null;

  const avgScore =
    generations.length > 0
      ? Math.round(
          generations.reduce((s, g) => s + (g.interviewReadyScore ?? 0), 0) / generations.length,
        )
      : 0;
  const totalCost = generations.reduce((s, g) => s + g.totalCostUsd, 0);

  return (
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="rt-label mb-3">Cognitive</p>
            <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
              Insights
            </h1>
          </div>
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors mb-2">
            <span className="text-sm">✕</span>
          </Link>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <p className="text-xs text-muted-foreground mb-1">Generations</p>
            <p className="font-serif text-2xl text-foreground">{generations.length}</p>
          </div>
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <p className="text-xs text-muted-foreground mb-1">Avg. Score</p>
            <p className="font-serif text-2xl text-foreground">
              {generations.length > 0 ? avgScore : "—"}
              {generations.length > 0 && <span className="text-sm text-muted-foreground">/100</span>}
            </p>
          </div>
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <p className="text-xs text-muted-foreground mb-1">Total Cost</p>
            <p className="font-serif text-2xl text-foreground">${totalCost.toFixed(3)}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 border-2 border-[#e5e2dd] border-t-[#b84ed1] rounded-full animate-spin" />
          </div>
        ) : generations.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-serif text-xl text-foreground mb-2">No generations yet</p>
            <p className="text-sm text-muted-foreground">
              Submit a job description to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {generations.map((gen) => (
              <div key={gen.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId((prev) => (prev === gen.id ? null : gen.id))}
                  className="w-full rounded-3xl border border-[#e0ddd9] bg-white/90 p-5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] text-left hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground truncate">{gen.company}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{gen.role}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {gen.interviewReadyScore != null && (
                        <span className="text-xs font-mono text-foreground">{gen.interviewReadyScore}/100</span>
                      )}
                      <VerdictBadge verdict={gen.verdict} />
                    </div>
                  </div>
                </button>

                {selectedId === gen.id && (
                  <div className="mt-2 rounded-3xl border border-[#e0ddd9] bg-white/90 p-5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Brain Activity</p>
                      <BrainHeatmap traces={gen.traces} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Goal Chain</p>
                      <GoalDag goals={PIPELINE_GOALS} />
                    </div>
                    <Link
                      href={`/applications/${gen.id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-[#b84ed1] hover:opacity-75 transition-opacity"
                    >
                      View application →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles =
    verdict === "ship"
      ? "text-[#7e22ce] bg-[#f3e8ff]"
      : verdict === "refuse"
        ? "text-[#dc2626] bg-[#fef2f2]"
        : "text-[#d97706] bg-[#fef9c3]";
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-medium rounded-full ${styles}`}>
      {verdict === "ship" ? "Ready" : verdict === "refuse" ? "Refused" : "Revise"}
    </span>
  );
}
