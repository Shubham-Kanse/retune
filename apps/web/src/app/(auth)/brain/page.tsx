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
    <div className="flex flex-wrap gap-2 p-4 bg-[#f7f3ec] rounded-2xl">
      {regions.length === 0 ? (
        <span className="text-xs text-[#9a9a8a]">No trace data</span>
      ) : (
        regions.map((r) => (
          <span
            key={r}
            className="text-[10px] font-medium text-[#1B3028] bg-[#c8e6c9] px-2.5 py-1 rounded-full"
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
          className={`text-[10px] font-medium px-2 py-1 rounded-full ${g.status === "satisfied" ? "bg-[#c8e6c9] text-[#1B3028]" : "bg-[#f2ede3] text-[#9a9a8a]"}`}
        >
          {g.kind.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}
import { useEffect, useRef, useState } from "react";

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

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    startRef.current = null;
    function tick(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(eased * target));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
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
    <div className="mx-auto max-w-5xl px-6 py-6 animate-in fade-in duration-400">
      <div className="page-header">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-subtitle">How your applications are generated.</p>
        </div>
      </div>

      {/* Stat row — thin border table style */}
      <div className="flex border border-border mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <StatCell
          label="Total Generations"
          value={generations.length.toString()}
          countTarget={generations.length}
        />
        <StatCell
          label="Avg. Interview Score"
          value={generations.length > 0 ? `${avgScore}` : "—"}
          suffix="/100"
          countTarget={generations.length > 0 ? avgScore : undefined}
          bordered
        />
        <StatCell label="Total Cost" value={`$${totalCost.toFixed(3)}`} bordered />
      </div>

      {loading ? (
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="h-5 w-5 border-2 border-border border-t-brand rounded-full animate-spin" />
        </div>
      ) : generations.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No generations yet. Submit a job description from the dashboard to get started.
        </div>
      ) : (
        <>
          <div className="border border-border mb-6">
            <div
              className="grid grid-cols-[1fr_1fr_80px_80px_80px_24px] gap-4 px-4 py-2 border-b border-border text-xs text-muted-foreground uppercase tracking-wider animate-in fade-in slide-in-from-top-1 duration-300"
              style={{ animationDelay: "100ms", animationFillMode: "both" }}
            >
              <span>Company</span>
              <span>Role</span>
              <span className="text-right">Score</span>
              <span className="text-right">ATS</span>
              <span className="text-right">Verdict</span>
              <span />
            </div>
            {generations.map((gen, index) => (
              <div
                key={gen.id}
                className="animate-in fade-in slide-in-from-bottom-1 duration-250"
                style={{
                  animationDelay: `${index * 40}ms`,
                  animationFillMode: "both",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId((prev) => (prev === gen.id ? null : gen.id))}
                  className={`w-full grid grid-cols-[1fr_1fr_80px_80px_80px_24px] gap-4 px-4 py-3 border-b border-border last:border-b-0 transition-colors text-sm text-left ${
                    selectedId === gen.id ? "bg-muted/20" : "hover:bg-accent/30"
                  }`}
                >
                  <span className="truncate font-medium">{gen.company}</span>
                  <span className="truncate text-muted-foreground">{gen.role}</span>
                  <span className="text-right tabular-nums">{gen.interviewReadyScore ?? "—"}</span>
                  <span className="text-right tabular-nums">
                    {gen.atsScore ? `${Math.round(gen.atsScore)}%` : "—"}
                  </span>
                  <span className="text-right">
                    <VerdictBadge verdict={gen.verdict} />
                  </span>
                  <span className="flex items-center justify-end text-muted-foreground text-xs">
                    {selectedId === gen.id ? "▾" : "▸"}
                  </span>
                </button>
              </div>
            ))}
          </div>

          {selected && (
            <div
              key={selected.id}
              className="border border-border animate-in fade-in slide-in-from-bottom-3 duration-400 space-y-6"
            >
              {/* Detail panel header */}
              <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium truncate">
                    {selected.company} — {selected.role}
                  </span>
                  <VerdictBadge verdict={selected.verdict} />
                </div>
                <Link
                  href={`/applications/${selected.id}`}
                  className="rt-btn-ghost text-xs px-3 min-h-8 shrink-0"
                >
                  View Application →
                </Link>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-5 pb-5">
                <div className="animate-in fade-in zoom-in-95 duration-500">
                  <p className="rt-label mb-3">Brain Activity</p>
                  <BrainHeatmap traces={selected.traces} />
                  {selected.traces.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Detailed trace data requires the cognitive pipeline.
                    </p>
                  )}
                </div>
                <div
                  className="animate-in fade-in slide-in-from-right-2 duration-500"
                  style={{ animationDelay: "100ms", animationFillMode: "both" }}
                >
                  <p className="rt-label mb-3">Goal Chain</p>
                  <GoalDag goals={PIPELINE_GOALS} className="h-48" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  suffix,
  countTarget,
  bordered,
}: {
  label: string;
  value: string;
  suffix?: string;
  countTarget?: number;
  bordered?: boolean;
}) {
  const counted = useCountUp(countTarget ?? 0);
  const displayValue = countTarget != null ? counted.toString() : value;

  return (
    <div className={`flex-1 py-4 px-5 ${bordered ? "border-l border-border" : ""}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">
        {displayValue}
        {suffix && <span className="text-sm text-muted-foreground ml-0.5">{suffix}</span>}
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const styles =
    verdict === "ship"
      ? "text-brand bg-brand/10"
      : verdict === "refuse"
        ? "text-destructive bg-destructive/10"
        : "text-amber-600 bg-amber-500/10";
  return (
    <span className={`inline-block px-1.5 py-0.5 text-xs ${styles}`}>
      {verdict === "ship" ? "Ready" : verdict === "refuse" ? "Refused" : "Revise"}
    </span>
  );
}
