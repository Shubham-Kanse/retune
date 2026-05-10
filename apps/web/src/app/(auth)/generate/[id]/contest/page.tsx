"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

export default function ContestPage() {
  const params = useParams();
  const id = (params?.id ?? "") as string;

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!reason.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/generate/${id}/contest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Failed to submit contest. Please try again.",
        );
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Contest Automated Decision</h1>
        </div>
        <Link href={`/applications/${id}`} className="rt-btn-ghost text-sm px-3 py-1.5">
          Back to Results
        </Link>
      </div>

      {success ? (
        <div className="rt-card p-6 space-y-4">
          <p className="text-sm font-medium">Your contest has been logged and will be reviewed.</p>
          <p className="text-sm text-muted-foreground">
            A member of our team will review your contest and respond within 30 days.
          </p>
          <div className="pt-2 flex gap-3">
            <Link href={`/applications/${id}`} className="rt-btn text-sm px-4 py-2 inline-block">
              Back to Results
            </Link>
            <Link href="/dashboard" className="rt-btn-ghost text-sm px-4 py-2 inline-block">
              Dashboard
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rt-card p-4 space-y-2">
            <span className="rt-label block">Your Rights</span>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you believe the automated decision about your application was incorrect or unfair,
              you can contest it here. Explain why you think the decision should be reconsidered and
              what additional context we should take into account.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="reason" className="rt-label block">
              Contest Reason
            </label>
            <textarea
              id="reason"
              className="rt-textarea w-full min-h-[160px] resize-y"
              placeholder="Explain why you believe this decision should be reconsidered. Include any relevant context about your experience, skills, or qualifications that may not have been captured in your profile."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
            />
            <p className="text-xs text-muted-foreground">{reason.length} characters</p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rt-btn text-sm px-4 py-2"
              disabled={submitting || !reason.trim()}
            >
              {submitting ? "Submitting…" : "Submit Contest"}
            </button>
            <Link href={`/applications/${id}`} className="rt-btn-ghost text-sm px-4 py-2">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
