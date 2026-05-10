"use client";

interface SpecialistChipProps {
  name: string;
  status: "idle" | "running" | "done";
  latencyMs?: number;
  className?: string;
}

export function SpecialistChip({ name, status, latencyMs, className }: SpecialistChipProps) {
  const statusColor =
    status === "running"
      ? "border-brand bg-brand/5"
      : status === "done"
        ? "border-border bg-muted"
        : "border-border";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs border ${statusColor} ${className ?? ""}`}
    >
      {status === "running" && <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />}
      <span className="truncate max-w-[120px]">{name}</span>
      {latencyMs != null && status === "done" && (
        <span className="text-muted-foreground tabular-nums">{latencyMs}ms</span>
      )}
    </span>
  );
}
