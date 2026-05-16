"use client";

import type { UnderstandingScope } from "@/lib/career-understanding";
import { cn } from "@/lib/utils";

export interface RetuneLensScopePickerProps {
  scopes: UnderstandingScope[];
  value: UnderstandingScope;
  onChange: (scope: UnderstandingScope) => void;
  className?: string;
}

const SCOPE_LABELS: Record<UnderstandingScope, string> = {
  summary: "Only summary",
  selected_positioning: "This angle",
  all_positioning: "All angles",
  evidence_map: "Evidence",
  resume_fuel: "Resume fuel",
  skills_interpretation: "Skills",
  resume_strategy: "Strategy",
  everything_affected: "Everything affected",
};

export function RetuneLensScopePicker({
  scopes,
  value,
  onChange,
  className,
}: RetuneLensScopePickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Tuning scope"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {scopes.map((scope) => {
        const selected = scope === value;
        return (
          <button
            key={scope}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: custom chip-styled radio group; native <input type="radio"> would not match the design.
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(scope)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {SCOPE_LABELS[scope]}
          </button>
        );
      })}
    </div>
  );
}
