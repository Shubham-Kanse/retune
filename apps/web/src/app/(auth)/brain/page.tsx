"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Loader } from "@/components/prompt-kit/loader";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";

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

function verdictColor(v: string) {
  if (v === "ship") return "text-emerald-600 dark:text-emerald-400";
  if (v === "refuse") return "text-red-500";
  return "text-amber-600 dark:text-amber-400";
}

function verdictLabel(v: string) {
  if (v === "ship") return "Ready";
  if (v === "refuse") return "Refused";
  return "Revise";
}

export default function BrainPage() {
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

  const avg =
    generations.length > 0
      ? Math.round(
          generations.reduce((s, g) => s + (g.interviewReadyScore ?? 0), 0) /
            generations.length,
        )
      : 0;
  const totalCost = generations.reduce((s, g) => s + g.totalCostUsd, 0);

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Cognitive"
        title="Brain"
        subtitle="What Retuned learned across your tunings — regions exercised, signals captured, costs."
      />

      {/* Stats — flat, no card wrappers */}
      <div className="mb-10 grid grid-cols-3 gap-6">
        {[
          { label: "Tunings", value: String(generations.length) },
          { label: "Avg readiness", value: generations.length > 0 ? `${avg}/100` : "—" },
          { label: "Total spend", value: `$${totalCost.toFixed(3)}` },
        ].map((s) => (
          <div key={s.label}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader variant="circular" />
        </div>
      ) : generations.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">No tunings yet</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Run a tuning to populate the brain.</p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/generate/new">Run a tuning</Link>
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {generations.map((g) => {
            const open = selectedId === g.id;
            const regions = [...new Set(g.traces.map((t) => t.brain_region))];
            return (
              <div key={g.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(open ? null : g.id)}
                  className="flex w-full items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-md text-left transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.role}</p>
                    <p className="truncate text-xs text-muted-foreground">{g.company}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    {g.interviewReadyScore != null && (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {g.interviewReadyScore}
                      </span>
                    )}
                    <span className={`text-xs font-medium ${verdictColor(g.verdict)}`}>
                      {verdictLabel(g.verdict)}
                    </span>
                  </div>
                </button>
                {open && (
                  <div className="pb-4 pl-2 space-y-3">
                    {regions.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Regions activated
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {regions.map((r) => r.replace(/_/g, " ")).join(" · ")}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{g.ticksExecuted} ticks · ${g.totalCostUsd.toFixed(4)}</span>
                      <Link
                        href={`/generate/${g.id}/result`}
                        className="text-foreground hover:underline underline-offset-4"
                      >
                        View →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
