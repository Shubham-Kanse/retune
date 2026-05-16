"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
import Link from "next/link";

// Inlined from @retune/ui/cognitive (package not yet built)
function HonestyCalibrationTable({
  rows,
  className,
}: {
  rows: {
    claimType: string;
    trustFactor: number;
    sampleSize: number;
    trend?: "up" | "down" | "stable";
  }[];
  className?: string;
}) {
  if (rows.length === 0)
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>
        No calibration data yet.
      </div>
    );
  return (
    <div
      className={`text-sm ${className ?? ""}`}
    >
      <div className="grid grid-cols-[1fr_80px_60px_40px] gap-2 border-b border-border/50 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>Claim type</span>
        <span className="text-right">Trust</span>
        <span className="text-right">Samples</span>
        <span className="text-right">Trend</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.claimType}
          className="grid grid-cols-[1fr_80px_60px_40px] items-center gap-2 border-b border-border/30 py-3 last:border-b-0"
        >
          <span className="truncate text-xs capitalize text-foreground">
            {row.claimType.replace(/_/g, " ")}
          </span>
          <div className="flex items-center justify-end gap-1.5">
            <div className="h-1 w-10 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${row.trustFactor >= 0.8 ? "bg-foreground" : row.trustFactor >= 0.6 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${row.trustFactor * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(row.trustFactor * 100)}
            </span>
          </div>
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {row.sampleSize}
          </span>
          <span className="text-right text-xs">
            {row.trend === "up" && <span className="text-foreground">↑</span>}
            {row.trend === "down" && <span className="text-red-500">↓</span>}
            {(!row.trend || row.trend === "stable") && (
              <span className="text-muted-foreground">-</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
import { useEffect, useState } from "react";

interface CalibrationEntry {
  claimType: string;
  trustFactor: number;
  sampleSize: number;
}

export default function HonestyCalibrationPage() {
  const [calibrations, setCalibrations] = useState<CalibrationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile/honesty-calibrations")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setCalibrations(d as CalibrationEntry[]))
      .catch(() => [])
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Honesty"
        title="Claim calibration"
        subtitle="Tracks how your claims perform over time. The system adjusts confidence in different claim types based on outcome feedback."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/settings">Back to settings</Link>
          </Button>
        }
      />

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      ) : (
        <div>
          <HonestyCalibrationTable rows={calibrations} />
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Trust levels are updated when you log outcomes. A trust level below 70% means the system
        will ask for stronger evidence before using that claim type prominently.
      </p>
    </PageShell>
  );
}
