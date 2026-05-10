"use client";

import { X } from "lucide-react";
import { useState } from "react";

interface RefineModalProps {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  currentContent: string;
  contentType: "resume" | "cover_letter";
}

const REFINE_OPTIONS = [
  { id: "tone", label: "Adjust tone", description: "Make it more formal or conversational" },
  { id: "keywords", label: "Add keywords", description: "Insert missing ATS keywords naturally" },
  { id: "shorten", label: "Shorten", description: "Reduce length while keeping impact" },
  { id: "strengthen", label: "Strengthen bullets", description: "Add more metrics and specifics" },
  {
    id: "rewrite_section",
    label: "Rewrite a section",
    description: "Completely rewrite one section",
  },
] as const;

export function RefineModal({ open, onClose, applicationId, contentType }: RefineModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleRefine() {
    if (!selected) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/refine/${applicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: contentType,
          action: selected,
          instructions: instructions.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Refinement failed");
      }

      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md border border-border bg-background p-6 shadow-lg animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="text-lg font-semibold mb-1">
          Refine {contentType === "resume" ? "Resume" : "Cover Letter"}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          Choose a refinement type and optionally add instructions.
        </p>

        <div className="space-y-2 mb-5">
          {REFINE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setSelected(opt.id)}
              className={`w-full text-left px-3 py-2.5 border transition-colors ${
                selected === opt.id
                  ? "border-brand bg-brand/5"
                  : "border-border hover:border-foreground/30"
              }`}
            >
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
            </button>
          ))}
        </div>

        <div className="mb-5">
          <label htmlFor="refine-instructions" className="rt-label">
            Additional instructions (optional)
          </label>
          <textarea
            id="refine-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g., Focus on the leadership experience section..."
            rows={3}
            className="rt-textarea w-full mt-1.5"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive mb-3">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="rt-btn-ghost px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRefine}
            disabled={!selected || loading}
            className="rt-btn px-4 py-2 text-sm"
          >
            {loading ? "Refining..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
