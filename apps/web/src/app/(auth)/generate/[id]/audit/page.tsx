"use client";

import { apiUrl } from "@/lib/api-config";
import { ArrowLeft, ScrollText } from "lucide-react";
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
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-5 w-5 border-2 border-[#e0ddd9] border-t-[#2d8a5e] rounded-full animate-spin" />
      </div>
    );
  }

  const events = audit?.events ?? [];
  const totalCost = audit?.done?.total_cost_usd ?? result?.total_cost_usd ?? 0;
  const ticks = audit?.done?.ticks_executed ?? result?.ticks_executed ?? 0;

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-2xl">
        <Link href={`/generate/${id}/result`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to result
        </Link>

        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="rt-label">Audit trail</p>
            <h1 className="font-serif text-3xl font-normal text-foreground mt-1 leading-tight">How I thought about this.</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-prose">Every specialist that ran, every conflict raised, every token spent.</p>
          </div>
          {result?.verdict && (
            <span className={`px-3 py-1.5 text-xs font-medium rounded-full shrink-0 ${result.verdict === "ship" ? "bg-brand-light text-brand" : result.verdict === "refuse" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#fef9c3] text-[#d97706]"}`}>
              {result.verdict}
            </span>
          )}
        </div>

        {error && <div className="mb-6 p-4 text-sm rounded-3xl border border-[#fecaca] bg-[#fef2f2] text-[#dc2626]">{error}</div>}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[["Specialists fired", `${events.length}`], ["Ticks executed", `${ticks}`], ["Total cost", `$${totalCost.toFixed(5)}`]].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="font-serif text-xl text-foreground tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        {/* Trace */}
        <section className="mb-8">
          <h2 className="rt-label inline-flex items-center gap-2 mb-3"><ScrollText className="h-3.5 w-3.5" /> Trace</h2>
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] overflow-hidden max-h-[640px] overflow-y-auto">
            {events.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted-foreground">No trace events available.</p>
            ) : (
              <ol className="divide-y divide-[#f0ede8]">
                {events.map((e) => (
                  <li key={`${e.seq}-${e.specialist}`} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground w-10">{e.seq}</span>
                      <span className="text-sm font-medium flex-1 truncate text-foreground">{e.specialist}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{e.latency_ms}ms · ${e.cost_usd.toFixed(5)}</span>
                    </div>
                    <div className="mt-1 ml-[3.25rem] flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span>{e.micro_stage.replace(/_/g, " ")}</span>
                      {e.writes_count > 0 && <span>· {e.writes_count} writes</span>}
                      {e.conflicts_count > 0 && <span className="text-[#d97706]">· {e.conflicts_count} conflict</span>}
                    </div>
                    {e.justification && <p className="mt-1 ml-[3.25rem] text-xs text-muted-foreground">{e.justification}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        {/* Conflicts */}
        {result?.conflicts && result.conflicts.length > 0 && (
          <section className="mb-8">
            <h2 className="rt-label mb-3">Conflicts raised</h2>
            <ul className="space-y-2">
              {result.conflicts.map((c) => (
                <li key={c.id} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.monitor.replace(/_/g, " ")} · {c.severity}</div>
                  <p className="mt-1 text-sm text-foreground">{c.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Contest */}
        <section className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-6 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
          <div className="flex items-start gap-3">
            <ScrollText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-foreground">Contest this decision</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-prose">You have the right to contest this automated decision and request human review.</p>
              <Link href={`/generate/${id}/contest`} className="rt-btn-ghost mt-4 inline-flex">Contest this decision</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
