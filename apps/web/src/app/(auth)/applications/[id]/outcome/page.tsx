"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

const OUTCOMES = [
  { id: "callback", label: "Got a callback/interview", positive: true },
  { id: "offer", label: "Received an offer", positive: true },
  { id: "rejection", label: "Rejected", positive: false },
  { id: "ghosted", label: "No response (ghosted)", positive: false },
  { id: "withdrew", label: "I withdrew my application", positive: false },
] as const;

export default function OutcomeLoggingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit() {
    if (!selected || !id) return;
    setLoading(true);

    try {
      await fetch(`/api/applications/${id}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: selected, feedback: feedback.trim() || null }),
      });
      setSaved(true);
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch {
      setLoading(false);
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="rounded-full p-3 bg-brand/10">
          <Check className="h-6 w-6 text-brand" />
        </div>
        <p className="text-sm text-muted-foreground">Thanks! This helps improve future results.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <Link
        href={`/applications/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to application
      </Link>

      <h1 className="text-xl font-semibold">Log Outcome</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Tell us what happened — this improves predictions for future applications.
      </p>

      <div className="space-y-2 mb-6">
        {OUTCOMES.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setSelected(o.id)}
            className={`w-full text-left px-4 py-3 border text-sm transition-colors ${
              selected === o.id
                ? "border-brand bg-brand/5"
                : "border-border hover:border-foreground/30"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <label htmlFor="outcome-feedback" className="rt-label">
          Any additional context? (optional)
        </label>
        <textarea
          id="outcome-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="e.g., They said I was overqualified..."
          rows={3}
          className="rt-textarea w-full mt-1.5"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!selected || loading}
        className="rt-btn w-full justify-center"
      >
        {loading ? "Saving..." : "Submit Outcome"}
      </button>
    </div>
  );
}
