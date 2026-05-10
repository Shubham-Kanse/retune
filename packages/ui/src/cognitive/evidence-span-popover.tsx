"use client";

import { useState } from "react";

interface EvidenceSpan {
  text: string;
  kind: string;
  confidence: number;
  source: string;
}

interface EvidenceSpanPopoverProps {
  spans: EvidenceSpan[];
  trigger: React.ReactNode;
  className?: string;
}

export function EvidenceSpanPopover({ spans, trigger, className }: EvidenceSpanPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative inline-block ${className ?? ""}`}>
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center">
        {trigger}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
            role="presentation"
          />
          <div className="absolute z-50 top-full left-0 mt-1 w-72 border border-border bg-background shadow-lg p-3 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Evidence Sources</span>
              <span className="text-[10px] text-muted-foreground">{spans.length} span(s)</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {spans.map((span) => (
                <div key={span.text.slice(0, 30)} className="border-l-2 border-brand/30 pl-2">
                  <p className="text-xs leading-relaxed">{span.text}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span className="capitalize">{span.kind.replace(/_/g, " ")}</span>
                    <span>•</span>
                    <span>{Math.round(span.confidence * 100)}% conf.</span>
                    <span>•</span>
                    <span>{span.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
