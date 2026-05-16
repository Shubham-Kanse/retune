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
        <div className="w-12 h-12 rounded-full bg-[#f3e8ff] flex items-center justify-center">
          <Check className="h-6 w-6 text-[#7e22ce]" />
        </div>
        <p className="text-sm text-[#6b6b6b]">Thanks! This helps improve future results.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center pt-16 px-6">
      <div className="w-full max-w-lg">
        <Link href={`/applications/${id}`} className="inline-flex items-center gap-1.5 text-sm text-[#6b6b6b] hover:text-[#1a1a1a] mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to application
        </Link>

        <h1 className="font-serif text-2xl font-normal text-[#1a1a1a] mb-1">Log Outcome</h1>
        <p className="text-sm text-[#6b6b6b] mb-6">Tell us what happened - this improves predictions for future applications.</p>

        <div className="space-y-2 mb-6">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelected(o.id)}
              className={`w-full text-left px-4 py-3 rounded-3xl border text-sm transition-colors ${selected === o.id ? "border-[#b84ed1] bg-[#f3e8ff]" : "border-[#e5e2dd] bg-white hover:border-[#b84ed1]"}`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <label htmlFor="outcome-feedback" className="rt-label block mb-1.5">Any additional context? (optional)</label>
          <textarea
            id="outcome-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g., They said I was overqualified..."
            rows={3}
            className="rt-textarea w-full"
          />
        </div>

        <button type="button" onClick={handleSubmit} disabled={!selected || loading} className="rt-btn w-full justify-center">
          {loading ? "Saving..." : "Submit Outcome"}
        </button>
      </div>
    </div>
  );
}
