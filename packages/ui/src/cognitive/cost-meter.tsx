"use client";

interface CostMeterProps {
  spent: number;
  ceiling: number;
  hardKill: number;
  className?: string;
}

export function CostMeter({ spent, ceiling, hardKill, className }: CostMeterProps) {
  const softPct = Math.min(100, (spent / ceiling) * 100);
  const hardPct = Math.min(100, (ceiling / hardKill) * 100);

  const color =
    spent >= ceiling ? "bg-destructive" : spent >= ceiling * 0.8 ? "bg-amber-500" : "bg-brand";

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>${spent.toFixed(4)}</span>
        <span>/ ${ceiling.toFixed(4)}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-sm bg-muted">
        <div
          className={`absolute inset-y-0 left-0 transition-all duration-300 ${color}`}
          style={{ width: `${softPct}%` }}
        />
        <div
          className="absolute inset-y-0 border-r border-dashed border-muted-foreground/50"
          style={{ left: `${hardPct}%` }}
          title={`Hard limit: $${hardKill.toFixed(4)}`}
        />
      </div>
    </div>
  );
}
