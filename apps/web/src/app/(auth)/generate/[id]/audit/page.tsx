"use client";

import { apiUrl } from "@/lib/api-config";
import { ArrowLeft, Brain, ScrollText } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface AuditEvent {
  seq: number;
  timestamp: string;
  specialist: string;
  brain_region: string;
  micro_stage: string;
  justification?: string;
  cost_usd: number;
  latency_ms: number;
  writes_count: number;
  conflicts_count: number;
}

interface AuditResponse {
  generation_id: string;
  events: AuditEvent[];
  done: { termination: string; ticks_executed: number; total_cost_usd: number } | null;
  source: string;
}

interface ResultPayload {
  verdict: string | null;
  narrative_arc: { thesis: string; voice: string } | null;
  total_cost_usd: number;
  ticks_executed: number;
  conflicts: Array<{ id: string; monitor: string; severity: string; summary: string }>;
}

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const [audit, setAudit] = useState<AuditResponse | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const [auditRes, resultRes] = await Promise.all([
          fetch(apiUrl(`/generate/${id}/audit`)),
          fetch(apiUrl(`/generate/${id}`)),
        ]);
        const auditData = auditRes.ok ? ((await auditRes.json()) as AuditResponse) : null;
        const resultData = resultRes.ok ? ((await resultRes.json()) as ResultPayload) : null;
        if (!cancelled) {
          setAudit(auditData);
          setResult(resultData);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "load_failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  const events = audit?.events ?? [];
  const totalCost = audit?.done?.total_cost_usd ?? result?.total_cost_usd ?? 0;
  const ticks = audit?.done?.ticks_executed ?? result?.ticks_executed ?? 0;

  return (
    <div className="relative bg-grain min-h-[calc(100vh-56px)]">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link
          href={`/generate/${id}/result`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to result
        </Link>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="rt-label">GDPR Article 22 audit</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              How I thought about this.
            </h1>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              Every specialist that ran, every conflict raised, every token spent. Replayable for
              transparency and contestable per Article 22.
            </p>
          </div>
          {result?.verdict && (
            <span
              className={`px-3 py-1.5 text-xs uppercase tracking-widest border ${
                result.verdict === "ship"
                  ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                  : result.verdict === "refuse"
                    ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                    : "border-border"
              }`}
            >
              {result.verdict}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-6 rt-card p-4 text-sm text-destructive">
            Couldn't load audit: {error}
          </div>
        )}

        {/* Stat strip */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Specialists fired" value={`${events.length}`} />
          <Stat label="Ticks executed" value={`${ticks}`} />
          <Stat label="Total cost" value={`$${totalCost.toFixed(5)}`} />
        </div>

        {/* Trace */}
        <section className="mt-10">
          <h2 className="rt-label inline-flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5" /> Trace
          </h2>
          <ol className="mt-3 rt-card divide-y divide-border max-h-[640px] overflow-auto">
            {events.length === 0 && (
              <li className="px-5 py-12 text-center text-sm text-muted-foreground">
                No trace events available. The generation may have been GC'd from the in-memory
                store; persistent audit replay is the v2.0 Postgres-backed path.
              </li>
            )}
            {events.map((e) => (
              <li key={`${e.seq}-${e.specialist}`} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground w-10">{e.seq}</span>
                  <span className="text-sm font-medium flex-1 truncate">{e.specialist}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {e.latency_ms}ms · ${e.cost_usd.toFixed(5)}
                  </span>
                </div>
                <div className="mt-1 ml-[3.25rem] flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{e.brain_region.replace(/_/g, " ")}</span>
                  <span>·</span>
                  <span>{e.micro_stage.replace(/_/g, " ")}</span>
                  {e.writes_count > 0 && <span>· {e.writes_count} writes</span>}
                  {e.conflicts_count > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      · {e.conflicts_count} conflict
                    </span>
                  )}
                </div>
                {e.justification && (
                  <p className="mt-1 ml-[3.25rem] text-xs text-muted-foreground">
                    {e.justification}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Conflicts */}
        {result?.conflicts && result.conflicts.length > 0 && (
          <section className="mt-10">
            <h2 className="rt-label">Conflicts raised</h2>
            <ul className="mt-3 space-y-2">
              {result.conflicts.map((c) => (
                <li key={c.id} className="rt-card p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {c.monitor.replace(/_/g, " ")} · {c.severity}
                  </div>
                  <p className="mt-1 text-sm">{c.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Rights footer */}
        <section className="mt-12 rt-card p-6">
          <div className="flex items-start gap-3">
            <Brain className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium">Your rights under GDPR Article 22</h3>
              <p className="mt-2 max-w-prose text-sm text-muted-foreground">
                You have the right to contest this automated decision, request human review, and
                receive a plain-language explanation of every factor that influenced the outcome.
              </p>
              <div className="mt-4 flex gap-2">
                <Link href={`/generate/${id}/contest`} className="rt-btn-ghost">
                  Contest this decision
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rt-card p-5">
      <div className="rt-label">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
