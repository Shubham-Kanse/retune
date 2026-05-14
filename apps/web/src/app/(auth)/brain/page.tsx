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

function verdictTone(v: string) {
  if (v === "ship") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400";
  if (v === "refuse") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400";
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

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { label: "Tunings", value: String(generations.length) },
          { label: "Avg readiness", value: generations.length > 0 ? `${avg}/100` : "—" },
          { label: "Total spend", value: `$${totalCost.toFixed(3)}` },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader variant="circular" />
        </div>
      ) : generations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-sm font-medium">No tunings yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Run a tuning to populate the brain.</p>
          <Button asChild size="sm" className="mt-4">
            <Link href="/generate/new">Run a tuning</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {generations.map((g) => {
            const open = selectedId === g.id;
            const regions = [...new Set(g.traces.map((t) => t.brain_region))];
            return (
              <li key={g.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setSelectedId(open ? null : g.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{g.role}</p>
                    <p className="truncate text-xs text-muted-foreground">{g.company}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {g.interviewReadyScore != null ? (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {g.interviewReadyScore}/100
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${verdictTone(g.verdict)}`}
                    >
                      {g.verdict === "ship" ? "Ready" : g.verdict === "refuse" ? "Refused" : "Revise"}
                    </span>
                  </div>
                </button>
                {open ? (
                  <div className="space-y-4 border-t border-border bg-background/50 px-4 py-4">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Brain activity
                      </p>
                      {regions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No trace data</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {regions.map((r) => (
                            <span
                              key={r}
                              className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                            >
                              {r.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{g.ticksExecuted} ticks · ${g.totalCostUsd.toFixed(4)}</span>
                      <Link
                        href={`/generate/${g.id}/result`}
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        View application →
                      </Link>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
