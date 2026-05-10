"use client";

interface Conflict {
  id: string;
  monitor: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
}

interface ConflictBannerProps {
  conflicts: Conflict[];
  className?: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-destructive/50 bg-destructive/5 text-destructive",
  high: "border-destructive/30 bg-destructive/5 text-destructive",
  medium: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  low: "border-border bg-muted text-muted-foreground",
};

export function ConflictBanner({ conflicts, className }: ConflictBannerProps) {
  if (conflicts.length === 0) return null;

  const sorted = [...conflicts].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {sorted.map((c) => (
        <div
          key={c.id}
          className={`border px-3 py-2 text-xs ${SEVERITY_STYLES[c.severity] ?? SEVERITY_STYLES.low}`}
        >
          <span className="font-medium uppercase tracking-wide">{c.severity}</span>
          <span className="mx-2 opacity-40">|</span>
          <span>{c.message}</span>
        </div>
      ))}
    </div>
  );
}
