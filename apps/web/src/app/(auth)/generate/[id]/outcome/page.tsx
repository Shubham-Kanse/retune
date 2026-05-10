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
  {
    value: "rejection_with_reason",
    label: "Rejection with reason",
    hint: "Rejected — feedback provided",
  },
  {
    value: "rejection_without_reason",
    label: "Rejection without reason",
    hint: "Rejected — no feedback",
  },
];

type OutcomeKind =
  | "no_response"
  | "callback"
  | "screen"
  | "onsite"
  | "offer"
  | "rejection_with_reason"
  | "rejection_without_reason";

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
        body: JSON.stringify({
          outcome: picked,
          feedback_text: feedback.trim() || undefined,
        }),
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
      <div className="relative bg-grain min-h-[calc(100vh-56px)]">
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600 dark:text-emerald-400" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Outcome logged.</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Your feedback updates how we'll think about your next application — honesty
            calibrations, voice centroid, and the OutcomePredictor's empirical conformal residuals.
          </p>
          <div className="mt-8 flex justify-center gap-2">
            <Link href="/dashboard" className="rt-btn-ghost">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <Link href="/generate/new" className="rt-btn">
              New application
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-grain min-h-[calc(100vh-56px)]">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href={`/generate/${id}/result`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to result
        </Link>

        <p className="mt-6 rt-label">Log outcome</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          What happened with this application?
        </h1>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">
          Your feedback trains the OutcomePredictor against your real outcomes. Once you've logged ≥
          100 outcomes the cold-start Wilson interval gives way to empirical conformal residuals.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <fieldset>
            <legend className="rt-label">Outcome</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {OUTCOMES.map((o) => {
                const active = picked === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setPicked(o.value)}
                    className={
                      "text-left p-4 border transition-colors " +
                      (active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:border-foreground/50 bg-card")
                    }
                  >
                    <div className="text-sm font-medium">{o.label}</div>
                    <div
                      className={
                        "mt-1 text-xs " + (active ? "text-background/80" : "text-muted-foreground")
                      }
                    >
                      {o.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label htmlFor="feedback" className="rt-label inline-flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5" />
              Recruiter feedback / notes (optional)
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={6}
              className="rt-textarea mt-2"
              placeholder="Paste any feedback the recruiter shared, or note what you'd do differently next time."
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <button type="submit" disabled={!picked || submitting} className="rt-btn w-full">
            {submitting ? "Logging…" : "Log outcome"}
          </button>
        </form>
      </div>
    </div>
  );
}
