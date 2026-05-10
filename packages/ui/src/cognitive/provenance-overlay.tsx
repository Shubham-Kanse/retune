"use client";

import { useState } from "react";

export interface ProvenanceClaim {
  id: string;
  text: string;
  specialist: string;
  evidence: string[];
  confidence: "strong" | "moderate" | "weak";
}

interface ProvenanceOverlayProps {
  markdown: string;
  claims: ProvenanceClaim[];
  className?: string;
}

const CONFIDENCE_STYLES: Record<ProvenanceClaim["confidence"], string> = {
  strong:
    "border-b-2 border-b-[oklch(0.6_0.18_145)] cursor-pointer hover:bg-[oklch(0.6_0.18_145)]/10",
  moderate:
    "border-b-2 border-b-[oklch(0.75_0.15_65)] cursor-pointer hover:bg-[oklch(0.75_0.15_65)]/10",
  weak: "border-b-2 border-b-[oklch(0.5_0.04_0)] cursor-pointer hover:bg-[oklch(0.5_0.04_0)]/10",
};

const CONFIDENCE_BADGE: Record<ProvenanceClaim["confidence"], string> = {
  strong: "bg-[oklch(0.6_0.18_145)]/20 text-[oklch(0.6_0.18_145)]",
  moderate: "bg-[oklch(0.75_0.15_65)]/20 text-[oklch(0.75_0.15_65)]",
  weak: "bg-muted text-muted-foreground",
};

interface ActivePopover {
  claim: ProvenanceClaim;
  x: number;
  y: number;
}

/**
 * Splits a line of text into segments, wrapping any substring that matches
 * a claim's text in a highlight span.
 */
function renderLine(
  line: string,
  claims: ProvenanceClaim[],
  onActivate: (claim: ProvenanceClaim, x: number, y: number) => void,
  activeId: string | null,
): React.ReactNode {
  // Build a sorted list of [startIndex, endIndex, claim] matches
  const matches: Array<{ start: number; end: number; claim: ProvenanceClaim }> = [];

  for (const claim of claims) {
    if (!claim.text) continue;
    let searchFrom = 0;
    while (searchFrom < line.length) {
      const idx = line.indexOf(claim.text, searchFrom);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + claim.text.length, claim });
      searchFrom = idx + 1;
    }
  }

  if (matches.length === 0) return line;

  // Sort by start position, pick non-overlapping matches greedily
  matches.sort((a, b) => a.start - b.start);
  const selected: typeof matches = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start >= cursor) {
      selected.push(m);
      cursor = m.end;
    }
  }

  const parts: React.ReactNode[] = [];
  let pos = 0;
  for (const m of selected) {
    if (m.start > pos) parts.push(line.slice(pos, m.start));
    const isActive = activeId === m.claim.id;
    parts.push(
      <button
        type="button"
        key={`${m.claim.id}-${m.start}`}
        className={`bg-transparent border-0 p-0 m-0 inline font-[inherit] text-[inherit] ${CONFIDENCE_STYLES[m.claim.confidence]} ${isActive ? "ring-1 ring-offset-1 ring-border" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const parent = (e.target as HTMLElement).closest("[data-provenance-root]");
          const parentRect = parent?.getBoundingClientRect();
          onActivate(
            m.claim,
            rect.left - (parentRect?.left ?? 0) + rect.width / 2,
            rect.top - (parentRect?.top ?? 0),
          );
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            const parent = (e.target as HTMLElement).closest("[data-provenance-root]");
            const parentRect = parent?.getBoundingClientRect();
            onActivate(
              m.claim,
              rect.left - (parentRect?.left ?? 0) + rect.width / 2,
              rect.top - (parentRect?.top ?? 0),
            );
          }
        }}
      >
        {line.slice(m.start, m.end)}
      </button>,
    );
    pos = m.end;
  }
  if (pos < line.length) parts.push(line.slice(pos));
  return parts;
}

export function ProvenanceOverlay({ markdown, claims, className }: ProvenanceOverlayProps) {
  const [popover, setPopover] = useState<ActivePopover | null>(null);

  const lines = markdown.split("\n");

  return (
    <div
      className={`relative ${className ?? ""}`}
      data-provenance-root
      onClick={() => setPopover(null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setPopover(null);
      }}
    >
      <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-foreground">
        {lines.map((line, lineIdx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: line index is stable
          <p key={lineIdx} className="min-h-[1.5em]">
            {renderLine(
              line,
              claims,
              (claim, x, y) =>
                setPopover((prev) => (prev?.claim.id === claim.id ? null : { claim, x, y })),
              popover?.claim.id ?? null,
            )}
          </p>
        ))}
      </div>

      {/* Popover */}
      {popover && (
        <div
          className="absolute z-20 border border-border bg-background shadow-md p-3 text-xs"
          style={{
            left: popover.x,
            top: popover.y,
            transform: "translate(-50%, calc(-100% - 8px))",
            minWidth: 200,
            maxWidth: 280,
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="font-medium text-foreground truncate">{popover.claim.specialist}</span>
            <span
              className={`shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${CONFIDENCE_BADGE[popover.claim.confidence]}`}
            >
              {popover.claim.confidence}
            </span>
          </div>
          {popover.claim.evidence.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Evidence
              </p>
              <ul className="space-y-1">
                {popover.claim.evidence.map((ev) => (
                  <li key={ev} className="text-[11px] text-muted-foreground leading-snug">
                    <span className="text-muted-foreground/50 mr-1">–</span>
                    {ev}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
