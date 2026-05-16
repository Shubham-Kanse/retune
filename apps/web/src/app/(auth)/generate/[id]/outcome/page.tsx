"use client";

import { apiUrl } from "@/lib/api-config";
import { ArrowLeft, CheckCircle2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

const OUTCOMES: Array<{ value: OutcomeKind; label: string; hint: string }> = [
  { value: "no_response", label: "No response", hint: "Submitted, never heard back" },
  { value: "callback", label: "Callback", hint: "Recruiter or HM reached out" },
  { value: "screen", label: "Screen", hint: "First-stage interview scheduled" },
  { value: "onsite", label: "Onsite", hint: "Final-round invitation" },
  { value: "offer", label: "Offer", hint: "Written offer received" },
  { value: "rejection_with_reason", label: "Rejection with reason", hint: "Rejected - feedback provided" },
  { value: "rejection_without_reason", label: "Rejection without reason", hint: "Rejected - no feedback" },
];

type OutcomeKind = "no_response" | "callback" | "screen" | "onsite" | "offer" | "rejection_with_reason" | "rejection_without_reason";

export default function OutcomePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [picked, setPicked] = useState<OutcomeKind | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!picked) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/generate/${id}/outcome`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: picked, feedback_text: feedback.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `status_${res.status}`);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "submission_failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-brand-light flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-brand" />
          </div>
          <h1 className="font-serif text-2xl text-foreground mb-2">Outcome logged.</h1>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">Your feedback updates how we'll think about your next application.</p>
          <div className="flex justify-center gap-3">
            <Link href="/dashboard" className="rt-btn-ghost inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
            <Link href="/generate/new" className="rt-btn">New application</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        <Link href={`/generate/${id}/result`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to result
        </Link>

        <p className="rt-label mb-1">Log outcome</p>
        <h1 className="font-serif text-3xl font-normal text-foreground mb-2 leading-tight">What happened?</h1>
        <p className="text-sm text-muted-foreground mb-8 max-w-prose">Your feedback trains the outcome predictor against your real results.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset>
            <legend className="rt-label mb-3">Outcome</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {OUTCOMES.map((o) => {
                const active = picked === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPicked(o.value)}
                    className={`text-left p-4 rounded-3xl border backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] transition-colors ${active ? "border-brand bg-brand-light" : "border-[#e0ddd9] bg-white/90 hover:border-brand"}`}
                  >
                    <div className="text-sm font-medium text-foreground">{o.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{o.hint}</div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="feedback" className="rt-label inline-flex items-center gap-2 mb-2">
              <MessageSquare className="h-3.5 w-3.5" /> Recruiter feedback (optional)
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={5}
              className="rt-textarea w-full"
              placeholder="Paste any feedback the recruiter shared…"
            />
          </div>

          {error && <p role="alert" className="text-sm text-[#dc2626]">{error}</p>}

          <button type="submit" disabled={!picked || submitting} className="rt-btn w-full">
            {submitting ? "Logging…" : "Log outcome"}
          </button>
        </form>
      </div>
    </div>
  );
}
