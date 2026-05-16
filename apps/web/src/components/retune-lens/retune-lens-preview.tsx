"use client";

import { Button } from "@/components/ui/button";
import type { CareerUnderstandingSlice, EvidenceRef } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";

export interface RetuneLensPreviewProps {
  before: CareerUnderstandingSlice;
  after: CareerUnderstandingSlice;
  changeSummary: string[];
  evidenceRefs?: EvidenceRef[];
  applying?: boolean;
  onApply: () => void;
  onTryAgain: () => void;
  onDiscard: () => void;
  className?: string;
}

/**
 * Preview state — shows before/after slices and apply/discard controls.
 *
 * Apply only fires the parent callback. The parent owns the
 * apply call so the panel stays generic and reusable.
 */
export function RetuneLensPreview({
  before,
  after,
  changeSummary,
  evidenceRefs,
  applying,
  onApply,
  onTryAgain,
  onDiscard,
  className,
}: RetuneLensPreviewProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <p className="text-xs uppercase tracking-widest text-muted-foreground/70">
        Retune suggests this update
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <SliceColumn label="Before" slice={before} muted />
        <SliceColumn label="After" slice={after} />
      </div>
      {changeSummary.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
            Changed
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {changeSummary.map((c, i) => (
              <li key={`${i}-${c.slice(0, 16)}`}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {evidenceRefs && evidenceRefs.length > 0 ? (
        <details className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Evidence Retune used ({evidenceRefs.length})
          </summary>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            {evidenceRefs.slice(0, 12).map((ref) => (
              <li key={ref.id} className="flex items-start gap-2">
                <span className="font-mono text-[10px] uppercase text-muted-foreground/60">
                  {ref.source}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground/80">
                  {ref.profilePath}
                </span>
                <span className="text-foreground">{ref.label}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onApply} disabled={applying} size="sm">
          {applying ? "Applying…" : "Apply"}
        </Button>
        <Button variant="outline" size="sm" onClick={onTryAgain} disabled={applying}>
          Try again
        </Button>
        <Button variant="ghost" size="sm" onClick={onDiscard} disabled={applying}>
          Discard
        </Button>
      </div>
    </div>
  );
}

function SliceColumn({
  label,
  slice,
  muted,
}: {
  label: string;
  slice: CareerUnderstandingSlice;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-xs",
        muted ? "border-border/60 bg-muted/30" : "border-border bg-background",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
      <div className="mt-2 space-y-2">
        {slice.summary ? (
          <div>
            <p className="text-sm font-medium text-foreground">{slice.summary.headline}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {slice.summary.narrative}
            </p>
          </div>
        ) : null}
        {slice.positioning ? (
          <div className="space-y-1.5">
            {slice.positioning.options.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No positioning options.</p>
            ) : null}
            {slice.positioning.options.map((opt) => (
              <div key={opt.id} className="rounded-md border border-border/60 p-2">
                <p className="text-xs font-medium text-foreground">{opt.title}</p>
                <p className="text-[11px] text-muted-foreground">{opt.description}</p>
              </div>
            ))}
          </div>
        ) : null}
        {slice.evidenceMap ? (
          <p className="text-[11px] text-muted-foreground">
            Strongest signals: {slice.evidenceMap.strongestSignals.length}, Supporting:{" "}
            {slice.evidenceMap.supportingSignals.length}, Weak:{" "}
            {slice.evidenceMap.weakSignals.length}
          </p>
        ) : null}
        {slice.resumeFuel ? (
          <p className="text-[11px] text-muted-foreground">
            Ready: {slice.resumeFuel.ready.length}, Sharpen:{" "}
            {slice.resumeFuel.needsSharpening.length}, Risks: {slice.resumeFuel.risks.length}
          </p>
        ) : null}
      </div>
    </div>
  );
}
