"use client";

interface CalibrationRow {
  claimType: string;
  trustFactor: number;
  sampleSize: number;
  trend?: "up" | "down" | "stable";
}

interface HonestyCalibrationTableProps {
  rows: CalibrationRow[];
  className?: string;
}

export function HonestyCalibrationTable({ rows, className }: HonestyCalibrationTableProps) {
  if (rows.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No calibration data available.
      </div>
    );
  }

  return (
    <div className={`border border-border text-sm ${className ?? ""}`}>
      <div className="grid grid-cols-[1fr_80px_60px_40px] gap-2 px-3 py-2 border-b border-border text-[10px] text-muted-foreground uppercase tracking-wider">
        <span>Claim Type</span>
        <span className="text-right">Trust</span>
        <span className="text-right">Samples</span>
        <span className="text-right">Trend</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.claimType}
          className="grid grid-cols-[1fr_80px_60px_40px] gap-2 px-3 py-2 border-b border-border last:border-b-0 items-center"
        >
          <span className="truncate capitalize text-xs">{row.claimType.replace(/_/g, " ")}</span>
          <div className="flex items-center gap-1.5 justify-end">
            <div className="w-10 h-1 bg-muted overflow-hidden">
              <div
                className={`h-full ${row.trustFactor >= 0.8 ? "bg-brand" : row.trustFactor >= 0.6 ? "bg-amber-500" : "bg-destructive"}`}
                style={{ width: `${row.trustFactor * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(row.trustFactor * 100)}
            </span>
          </div>
          <span className="text-right text-xs text-muted-foreground tabular-nums">
            {row.sampleSize}
          </span>
          <span className="text-right text-xs">
            {row.trend === "up" && <span className="text-brand">↑</span>}
            {row.trend === "down" && <span className="text-destructive">↓</span>}
            {row.trend === "stable" && <span className="text-muted-foreground">—</span>}
            {!row.trend && <span className="text-muted-foreground">—</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
