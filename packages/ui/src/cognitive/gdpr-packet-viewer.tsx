"use client";

import { useState } from "react";

interface GdprPacketViewerProps {
  packet: Record<string, unknown>;
  verdict: string;
  className?: string;
}

export function GdprPacketViewer({ packet, verdict, className }: GdprPacketViewerProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border border-border ${className ?? ""}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-accent/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-medium">Transparency Report</span>
        <span className="flex items-center gap-2">
          <span
            className={`text-xs px-1.5 py-0.5 ${
              verdict === "ship"
                ? "text-brand bg-brand/10"
                : verdict === "refuse"
                  ? "text-destructive bg-destructive/10"
                  : "text-amber-600 bg-amber-500/10"
            }`}
          >
            {verdict.toUpperCase()}
          </span>
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <title>Toggle</title>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-80 overflow-y-auto">
            {JSON.stringify(packet, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
