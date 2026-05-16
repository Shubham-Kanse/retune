"use client";

import type { UnderstandingIntentPreset } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";

export interface RetuneLensIntentChipsProps {
  intents: UnderstandingIntentPreset[];
  value: UnderstandingIntentPreset | null;
  onChange: (intent: UnderstandingIntentPreset | null) => void;
  className?: string;
}

const INTENT_LABELS: Record<UnderstandingIntentPreset, string> = {
  accurate: "Accurate as-is",
  different_angle: "Different angle",
  more_technical: "More technical",
  more_product_focused: "More product-focused",
  more_senior: "More senior",
  less_exaggerated: "Less exaggerated",
  re_read_profile: "Re-read profile",
};

export function RetuneLensIntentChips({
  intents,
  value,
  onChange,
  className,
}: RetuneLensIntentChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {intents.map((intent) => {
        const selected = intent === value;
        return (
          <button
            key={intent}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : intent)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-foreground bg-accent text-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {INTENT_LABELS[intent]}
          </button>
        );
      })}
    </div>
  );
}
