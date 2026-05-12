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
        setError((data as { error?: string }).error ?? "Failed to submit. Please try again.");
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
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="rt-label">Rights</p>
            <h1 className="font-serif text-2xl font-normal text-foreground leading-tight">Contest Decision</h1>
          </div>
          <Link href={`/applications/${id}`} className="text-muted-foreground hover:text-foreground transition-colors text-sm">✕</Link>
        </div>

        {success ? (
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-6 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)] space-y-3">
            <p className="text-sm font-medium text-foreground">Your contest has been logged and will be reviewed.</p>
            <p className="text-sm text-muted-foreground">A member of our team will respond within 30 days.</p>
            <div className="flex gap-3 pt-2">
              <Link href={`/applications/${id}`} className="rt-btn text-sm px-4 py-2 inline-block">Back to Results</Link>
              <Link href="/dashboard" className="rt-btn-ghost text-sm px-4 py-2 inline-block">Dashboard</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-5 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
              <p className="rt-label mb-2">Your Rights</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If you believe the automated decision was incorrect or unfair, you can contest it here. Explain why and include any relevant context.
              </p>
            </div>

            <div>
              <label htmlFor="reason" className="rt-label block mb-2">Contest Reason</label>
              <textarea
                id="reason"
                className="rt-textarea w-full min-h-[160px] resize-y"
                placeholder="Explain why you believe this decision should be reconsidered…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">{reason.length} characters</p>
            </div>

            {error && <p className="text-sm text-[#dc2626]">{error}</p>}

            <div className="flex items-center gap-3">
              <button type="submit" className="rt-btn text-sm px-4 py-2" disabled={submitting || !reason.trim()}>
                {submitting ? "Submitting…" : "Submit Contest"}
              </button>
              <Link href={`/applications/${id}`} className="rt-btn-ghost text-sm px-4 py-2">Cancel</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
