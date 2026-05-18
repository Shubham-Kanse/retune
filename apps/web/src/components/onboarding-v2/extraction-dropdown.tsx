"use client";

import { useState } from "react";

export interface ExtractionCardData {
  section: string;
  title: string;
  items: Array<{ label: string; value: string; confidence?: "high" | "medium" | "low" }>;
}

export function ExtractionDropdown({ cards, defaultOpen = false }: { cards: ExtractionCardData[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (cards.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{open ? "Hide details" : "See what I extracted from your resume"}</span>
        <svg className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {cards.map((card) => (
            <div key={card.section} className="rounded-xl border border-border bg-card/60 p-3">
              <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {card.title}
              </p>
              <div className="space-y-1.5">
                {card.items.map((item, i) => (
                  <div key={`${item.label}-${i}`} className={item.label === "•" ? "flex gap-2 pl-2" : "space-y-0.5"}>
                    {item.label === "•" ? (
                      <>
                        <span className="text-xs text-muted-foreground/50 shrink-0 mt-0.5">•</span>
                        <span className="text-xs text-muted-foreground leading-relaxed">{item.value}</span>
                      </>
                    ) : item.label === "" ? (
                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{item.value}</p>
                    ) : (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        <span className="text-xs font-medium text-foreground/80 shrink-0">{item.label}</span>
                        {item.value && <span className="text-xs text-muted-foreground whitespace-pre-line">{item.value}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
