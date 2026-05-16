"use client";

import { RetuneLensPanel } from "@/components/retune-lens";
import type { RetuneLensPreviewRequest, RetuneLensPreviewResponse } from "@/components/retune-lens";
import { Button } from "@/components/ui/button";
import type { CareerUnderstandingV1, PositioningOption } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";
import { Check, X } from "lucide-react";

export interface PositioningCardsSectionProps {
  understanding: CareerUnderstandingV1 | null;
  understandingPersisted: boolean;
  canGenerate: boolean;
  stale: boolean;
  onSelectDefault: (positioningId: string) => void;
  onReject: (positioningId: string) => void;
  onPreview: (req: RetuneLensPreviewRequest) => Promise<RetuneLensPreviewResponse>;
  onApply: (previewId: string, previewToken: string) => Promise<void>;
}

const PLACEHOLDER_CARDS = [
  { kind: "Primary",     title: "Your primary angle",     bestFor: "Your strongest positioning for most roles" },
  { kind: "Alternative", title: "An alternative angle",   bestFor: "A different positioning for specific roles" },
  { kind: "Stretch",     title: "A stretch angle",        bestFor: "Aspirational roles you could grow into" },
];

export function PositioningCardsSection({
  understanding,
  understandingPersisted,
  canGenerate,
  stale,
  onSelectDefault,
  onReject,
  onPreview,
  onApply,
}: PositioningCardsSectionProps) {
  const hasData = understandingPersisted && understanding && understanding.positioning.options.length > 0;

  return (
    <section aria-labelledby="best-angles-heading" className="space-y-3">
      <h2 id="best-angles-heading" className="text-base font-semibold tracking-tight text-foreground">
        Your Best Angles
      </h2>

      {/* Cards — no Tune button inside */}
      <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
        {hasData
          ? understanding!.positioning.options.map((option) => (
              <PopulatedCard
                key={option.id}
                option={option}
                isSelected={understanding!.positioning.selectedId === option.id}
                onSelectDefault={onSelectDefault}
                onReject={onReject}
              />
            ))
          : PLACEHOLDER_CARDS.map((card) => (
              <PlaceholderCard key={card.kind} kind={card.kind} title={card.title} bestFor={card.bestFor} />
            ))}
      </div>

      {/* Tune with AI — standalone below all cards */}
      <div className="pt-1">
        <RetuneLensPanel
          label="Tune with AI"
          section="positioning"
          defaultScope="all_positioning"
          availableScopes={["all_positioning", "selected_positioning", "everything_affected"]}
          intents={["different_angle", "more_technical", "more_product_focused", "more_senior"]}
          stale={stale}
          onPreview={onPreview}
          onApply={onApply}
        />
      </div>
    </section>
  );
}

function PlaceholderCard({ kind, title, bestFor }: { kind: string; title: string; bestFor: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-background">
      <div className="flex items-center gap-4 min-w-0">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 w-20">
          {kind}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground/50">{title}</p>
          <p className="text-xs text-muted-foreground/40">Best for: {bestFor}</p>
        </div>
      </div>
    </div>
  );
}

function PopulatedCard({
  option,
  isSelected,
  onSelectDefault,
  onReject,
}: {
  option: PositioningOption;
  isSelected: boolean;
  onSelectDefault: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const rejected = option.userDecision === "rejected";
  return (
    <div className={cn("flex items-center justify-between px-4 py-3 bg-background", rejected && "opacity-50")}>
      <div className="flex items-center gap-4 min-w-0">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 w-20">
          {option.kind}
          {isSelected && <span className="block text-emerald-600 normal-case tracking-normal font-normal">default</span>}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{option.title}</p>
          {option.bestFor.length > 0 && (
            <p className="text-xs text-muted-foreground">Best for: {option.bestFor.join(", ")}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-4">
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-emerald-600" onClick={() => onSelectDefault(option.id)} aria-label="Use as default" disabled={rejected}>
          <Check className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className={cn("h-7 w-7", rejected ? "text-destructive" : "text-muted-foreground hover:text-destructive")} onClick={() => onReject(option.id)} aria-label="Not me">
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
