"use client";

import { RetuneLensPanel } from "@/components/retune-lens";
import { ColorOrb } from "@/components/retune-lens/color-orb";
import { Button } from "@/components/ui/button";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import type { CareerUnderstandingV1 } from "@/lib/career-understanding";
import { Check, Eye } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

export interface RetuneUnderstandingSectionProps {
  understanding: CareerUnderstandingV1 | null;
  understandingPersisted: boolean;
  stale: boolean;
  canGenerate: boolean;
  onMarkAccurate: () => void;
  onPreview: (
    req: RetuneLensPreviewRequest,
    opts: { initial?: boolean },
  ) => Promise<RetuneLensPreviewResponse>;
  onApply: (previewId: string, previewToken: string) => Promise<void>;
}

export function RetuneUnderstandingSection({
  understanding,
  understandingPersisted,
  stale,
  canGenerate,
  onMarkAccurate,
  onPreview,
  onApply,
}: RetuneUnderstandingSectionProps) {
  const [showWhy, setShowWhy] = React.useState(false);

  const [regenerating, setRegenerating] = React.useState(false);

  async function handleRegenerate() {
    if (!canGenerate) {
      toast.warning("Please complete your profile first.");
      return;
    }
    setRegenerating(true);
    try {
      const preview = await onPreview(
        { section: "summary", scope: "everything_affected", instruction: "Re-read my profile and regenerate understanding." },
        { initial: !understandingPersisted },
      );
      await onApply(preview.previewId, preview.previewToken);
    } catch {
      toast.error("Could not regenerate understanding.");
    } finally {
      setRegenerating(false);
    }
  }

  const regenerateButton = (
    <button
      type="button"
      onClick={handleRegenerate}
      disabled={regenerating}
      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-normal text-foreground hover:bg-accent transition-colors disabled:opacity-50 overflow-hidden"
    >
      <ColorOrb size={14} />
      {regenerating ? "Regenerating…" : "Regenerate"}
    </button>
  );

  // ── Empty state: no persisted understanding yet ──────────────────────────
  if (!understandingPersisted) {
    return (
      <section aria-labelledby="retune-understanding-heading" className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2
            id="retune-understanding-heading"
            className="text-base font-semibold tracking-tight text-foreground"
          >
            Retune's Understanding
          </h2>
          {regenerateButton}
        </div>
      </section>
    );
  }

  // ── Populated state ───────────────────────────────────────────────────────
  if (!understanding) return null;

  return (
    <section aria-labelledby="retune-understanding-heading" className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2
          id="retune-understanding-heading"
          className="text-base font-semibold tracking-tight text-foreground"
        >
          Retune's Understanding
        </h2>
        {regenerateButton}
      </div>

      <div className="rounded-xl border border-border bg-background p-5 space-y-4">
        {/* Orb + summary */}
        <div className="flex items-start gap-3">
          <ColorOrb size={28} className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-foreground">
              {understanding.summary.headline}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {understanding.summary.narrative}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onMarkAccurate}
            aria-pressed={understanding.userFeedback.summary === "accurate"}
            className={understanding.userFeedback.summary === "accurate" ? "border-foreground bg-accent" : ""}
          >
            <Check className="mr-1.5 size-3.5" />
            {understanding.userFeedback.summary === "accurate" ? "Marked accurate" : "Accurate"}
          </Button>

          <RetuneLensPanel
            label="Tune with AI"
            section="summary"
            defaultScope="summary"
            availableScopes={["summary", "all_positioning", "everything_affected"]}
            intents={["different_angle", "more_technical", "more_product_focused", "more_senior", "less_exaggerated"]}
            stale={stale}
            onPreview={(req) => onPreview(req, {})}
            onApply={onApply}
          />

          <Button variant="ghost" size="sm" onClick={() => setShowWhy((s) => !s)}>
            <Eye className="mr-1.5 size-3.5" />
            {showWhy ? "Hide why" : "Show why"}
          </Button>
        </div>

        {/* Show why panel */}
        {showWhy && (
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70">
              Why Retune thinks this
            </p>
            {understanding.summary.sourceRefs.length === 0 ? (
              <p className="mt-2 text-muted-foreground italic">No evidence attached to this read.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {understanding.summary.sourceRefs.map((ref) => (
                  <li key={ref.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground/60">{ref.source}</span>
                    <span className="text-foreground">{ref.label}</span>
                    {ref.quote && <span className="text-muted-foreground italic">"{ref.quote}"</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
