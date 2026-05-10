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
  hidden_disqualifier_blocker:
    "Resolve the disqualifier the JD requires (e.g. clearance, certification, work authorisation) before re-applying.",
  fabrication:
    "Add concrete evidence to your profile so we don't have to invent it. Real numbers, real project names, real tools.",
  voice_drift: "Refresh your voice fingerprint with 5–10 sentences of your most natural writing.",
  fairness_concern:
    "Edit the language flagged below — it would carry bias in the package as written.",
  ats_coverage_below_floor:
    "Strengthen your skills section with the JD's tier-1 keywords expressed in your own words.",
  cost_runaway:
    "The cost ceiling fired. Try a tighter JD or contact support to raise the per-run budget.",
  outcome_below_floor:
    "Predicted callback fell below 20%. Either pick a closer-fit role or add evidence the JD's filters require.",
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
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="relative bg-grain min-h-[calc(100vh-56px)]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>

        <div className="mt-6 border border-amber-500/30 bg-amber-500/5 p-8">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-6 w-6 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="rt-label text-amber-700 dark:text-amber-400">Decision</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                We can't ship this credibly.
              </h1>
              <p className="mt-3 max-w-prose text-sm text-muted-foreground">
                The decision gate refused to ship the package because at least one quality criterion
                failed. Below are the reasons. None of these are dead-ends — each comes with a
                recommended next step.
              </p>
            </div>
          </div>
        </div>

        {loading && <p className="mt-8 text-sm text-muted-foreground">Loading verdict…</p>}

        {!loading && data && (
          <>
            {/* Reasons */}
            <section className="mt-10 space-y-4">
              <h2 className="rt-label">Why</h2>
              {data.conflicts.length === 0 && (
                <div className="rt-card p-4 text-sm text-muted-foreground">
                  Termination: <span className="font-mono">{data.termination ?? "unknown"}</span>
                </div>
              )}
              {data.conflicts.map((c) => (
                <article key={c.id} className="rt-card p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-medium">
                      {TITLE_OF[c.monitor] ?? c.monitor.replace(/_/g, " ")}
                    </h3>
                    <span className="rt-label">{c.severity}</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed">{c.summary}</p>
                  <p className="mt-4 border-l-2 border-amber-500/60 pl-3 text-sm text-muted-foreground">
                    <strong className="text-foreground">Next step.</strong>{" "}
                    {RECOMMENDED_NEXT[c.monitor] ??
                      "Review your profile and the JD; the system will try again with the changes."}
                  </p>
                </article>
              ))}
            </section>

            {/* Pending revisions */}
            {data.pending_revisions.length > 0 && (
              <section className="mt-10">
                <h2 className="rt-label">Drafts staged for revision</h2>
                <ul className="mt-3 space-y-2">
                  {data.pending_revisions.map((r) => (
                    <li key={r.target} className="rt-card p-4 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{r.target}</span>
                      <p className="mt-1">{r.reason}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Right to contest */}
        <section className="mt-12 rt-card p-6">
          <h3 className="mt-2 text-base font-medium">Contest this decision</h3>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Every refusal is contestable. We commit to a 30-day human-review SLA for any decision
            you ask us to revisit.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/generate/${id}/contest`} className="rt-btn-ghost">
              <MessageSquare className="h-4 w-4" />
              Contest this decision
            </Link>
            <a href="mailto:support@retuned.cv" className="rt-btn-ghost">
              <Mail className="h-4 w-4" />
              Email support@retuned.cv
            </a>
            <Link href={`/generate/${id}/audit`} className="rt-btn-ghost">
              <RotateCcw className="h-4 w-4" />
              Replay the cycle
            </Link>
          </div>
        </section>

        <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
          <Link href="/dashboard" className="rt-btn-ghost">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <Link href="/generate/new" className="rt-btn">
            Try a different role
          </Link>
        </div>
      </div>
    </div>
  );
}
