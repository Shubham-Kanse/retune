"use client";

interface TraceEntry {
  seq: number;
  specialist: string;
  displayName: string;
  latencyMs: number;
  costUsd: number;
  writesCount: number;
  timestamp: number;
}

interface TraceTimelineProps {
  entries: TraceEntry[];
  className?: string;
}

export function TraceTimeline({ entries, className }: TraceTimelineProps) {
  if (entries.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>
        Waiting for pipeline activity...
      </div>
    );
  }

  const maxLatency = Math.max(...entries.map((e) => e.latencyMs), 1);

  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      {entries.map((entry) => {
        const widthPct = Math.max(4, (entry.latencyMs / maxLatency) * 100);
        return (
          <div key={entry.seq} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-muted-foreground font-mono">
              {entry.displayName}
            </span>
            <div className="flex-1 h-4 relative">
              <div
                className="absolute inset-y-0 left-0 bg-brand/20 border-l-2 border-brand"
                style={{ width: `${widthPct}%`, transition: "width 0.3s ease" }}
              />
            </div>
            <span className="w-14 text-right tabular-nums text-muted-foreground">
              {entry.latencyMs}ms
            </span>
          </div>
        );
      })}
    </div>
  );
}
