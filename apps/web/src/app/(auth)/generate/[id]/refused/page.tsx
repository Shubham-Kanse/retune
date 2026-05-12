"use client";

import { apiUrl } from "@/lib/api-config";
import { ArrowLeft, Mail, MessageSquare, RotateCcw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface RefusalPayload {
  generation_id: string;
  status: string;
  verdict: string | null;
  termination: string | null;
  conflicts: Array<{ id: string; monitor: string; severity: string; summary: string }>;
  pending_revisions: Array<{ target: string; reason: string }>;
}

const RECOMMENDED_NEXT: Record<string, string> = {
  hidden_disqualifier_blocker: "Resolve the disqualifier the JD requires before re-applying.",
  fabrication: "Add concrete evidence to your profile — real numbers, real project names, real tools.",
  voice_drift: "Refresh your voice fingerprint with 5–10 sentences of your most natural writing.",
  fairness_concern: "Edit the language flagged below — it would carry bias in the package as written.",
  ats_coverage_below_floor: "Strengthen your skills section with the JD's tier-1 keywords expressed in your own words.",
  cost_runaway: "The cost ceiling fired. Try a tighter JD or contact support to raise the per-run budget.",
  outcome_below_floor: "Predicted callback fell below 20%. Either pick a closer-fit role or add evidence the JD's filters require.",
};

const TITLE_OF: Record<string, string> = {
  hidden_disqualifier_blocker: "Hard requirement we can't credibly satisfy",
  fabrication: "We'd have to invent something that isn't in your profile",
  voice_drift: "Drafts drifted away from your natural voice",
  fairness_concern: "Language we won't ship",
  ats_coverage_below_floor: "ATS coverage fell below the safety floor",
  cost_runaway: "Cost ceiling reached before completion",
  outcome_below_floor: "Predicted outcome fell below the credibility floor",
};

export default function RefusedPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<RefusalPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(apiUrl(`/generate/${id}`));
        if (res.ok && !cancelled) setData(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-2xl">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        <div className="rounded-3xl border border-[#fde68a] bg-[#fef9c3]/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] mb-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 text-[#d97706] shrink-0" />
            <div>
              <p className="rt-label text-[#d97706]">Decision</p>
              <h1 className="font-serif text-3xl font-normal text-foreground mt-1 leading-tight">We can't ship this credibly.</h1>
              <p className="mt-3 text-sm text-muted-foreground max-w-prose">
                The decision gate refused to ship the package because at least one quality criterion failed. Each reason below comes with a recommended next step.
              </p>
            </div>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading verdict…</p>}

        {!loading && data && (
          <>
            <section className="space-y-3 mb-8">
              <h2 className="rt-label">Why</h2>
              {data.conflicts.length === 0 && (
                <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] text-sm text-muted-foreground">
                  Termination: <span className="font-mono">{data.termination ?? "unknown"}</span>
                </div>
              )}
              {data.conflicts.map((c) => (
                <article key={c.id} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-foreground">{TITLE_OF[c.monitor] ?? c.monitor.replace(/_/g, " ")}</h3>
                    <span className="rt-label shrink-0">{c.severity}</span>
                  </div>
                  <p className="mt-2 text-sm text-foreground leading-relaxed">{c.summary}</p>
                  <p className="mt-4 border-l-2 border-[#fde68a] pl-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">Next step.</strong>{" "}
                    {RECOMMENDED_NEXT[c.monitor] ?? "Review your profile and the JD; the system will try again with the changes."}
                  </p>
                </article>
              ))}
            </section>

            {data.pending_revisions.length > 0 && (
              <section className="mb-8">
                <h2 className="rt-label mb-3">Drafts staged for revision</h2>
                <ul className="space-y-2">
                  {data.pending_revisions.map((r) => (
                    <li key={r.target} className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-4 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{r.target}</span>
                      <p className="mt-1 text-foreground">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-6 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] mb-8">
          <h3 className="text-sm font-medium text-foreground mb-2">Contest this decision</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-prose">Every refusal is contestable. We commit to a 30-day human-review SLA.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/generate/${id}/contest`} className="rt-btn-ghost inline-flex items-center gap-2"><MessageSquare className="h-4 w-4" />Contest</Link>
            <a href="mailto:support@retuned.cv" className="rt-btn-ghost inline-flex items-center gap-2"><Mail className="h-4 w-4" />Email support</a>
            <Link href={`/generate/${id}/audit`} className="rt-btn-ghost inline-flex items-center gap-2"><RotateCcw className="h-4 w-4" />Replay cycle</Link>
          </div>
        </section>

        <div className="flex items-center justify-between border-t border-[#e0ddd9] pt-6">
          <Link href="/dashboard" className="rt-btn-ghost inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
          <Link href="/generate/new" className="rt-btn">Try a different role</Link>
        </div>
      </div>
    </div>
  );
}
