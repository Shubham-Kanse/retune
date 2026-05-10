"use client";

interface ActivityCell {
  specialist: string;
  intensity: number;
  tick: number;
}

interface PipelineActivityProps {
  cells: ActivityCell[];
  maxTicks?: number;
  className?: string;
}

export function PipelineActivity({ cells, maxTicks = 30, className }: PipelineActivityProps) {
  const specialists = [...new Set(cells.map((c) => c.specialist))];
  const ticks = [...new Set(cells.map((c) => c.tick))].sort((a, b) => a - b).slice(-maxTicks);

  if (specialists.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No activity recorded yet.
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <div
        className="inline-grid gap-px"
        style={{ gridTemplateColumns: `120px repeat(${ticks.length}, 16px)` }}
      >
        {/* Header row */}
        <div className="text-[10px] text-muted-foreground" />
        {ticks.map((t) => (
          <div key={t} className="text-[9px] text-muted-foreground text-center tabular-nums">
            {t}
          </div>
        ))}

        {/* Specialist rows */}
        {specialists.map((sp) => (
          <>
            <div
              key={`label-${sp}`}
              className="text-[10px] text-muted-foreground truncate pr-2 leading-4"
            >
              {sp}
            </div>
            {ticks.map((t) => {
              const cell = cells.find((c) => c.specialist === sp && c.tick === t);
              const opacity = cell ? Math.max(0.1, cell.intensity) : 0;
              return (
                <div
                  key={`${sp}-${t}`}
                  className="w-4 h-4"
                  style={{
                    backgroundColor:
                      opacity > 0 ? `oklch(0.72 0.15 200 / ${opacity})` : "transparent",
                  }}
                  title={
                    cell ? `${sp} tick ${t}: ${(cell.intensity * 100).toFixed(0)}%` : undefined
                  }
                />
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}
