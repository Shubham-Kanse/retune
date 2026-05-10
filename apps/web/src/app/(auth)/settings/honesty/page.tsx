"use client";

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
      <div className={`text-sm text-[#6b6b5b] ${className ?? ""}`}>No calibration data yet.</div>
    );
  return (
    <div
      className={`border border-[rgba(26,26,26,0.12)] rounded-2xl overflow-hidden text-sm ${className ?? ""}`}
    >
      <div className="grid grid-cols-[1fr_80px_60px_40px] gap-2 px-4 py-3 border-b border-[rgba(26,26,26,0.08)] bg-[#f7f3ec] text-[10px] font-bold uppercase tracking-wider text-[#9a9a8a]">
        <span>Claim Type</span>
        <span className="text-right">Trust</span>
        <span className="text-right">Samples</span>
        <span className="text-right">Trend</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.claimType}
          className="grid grid-cols-[1fr_80px_60px_40px] gap-2 px-4 py-3 border-b border-[rgba(26,26,26,0.06)] last:border-b-0 items-center bg-white"
        >
          <span className="truncate capitalize text-xs text-[#1a1a1a]">
            {row.claimType.replace(/_/g, " ")}
          </span>
          <div className="flex items-center gap-1.5 justify-end">
            <div className="w-10 h-1 bg-[#f2ede3] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${row.trustFactor >= 0.8 ? "bg-[#1B3028]" : row.trustFactor >= 0.6 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${row.trustFactor * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-[#6b6b5b]">
              {Math.round(row.trustFactor * 100)}
            </span>
          </div>
          <span className="text-right text-xs text-[#9a9a8a] tabular-nums">{row.sampleSize}</span>
          <span className="text-right text-xs">
            {row.trend === "up" && <span className="text-[#1B3028]">↑</span>}
            {row.trend === "down" && <span className="text-red-500">↓</span>}
            {(!row.trend || row.trend === "stable") && <span className="text-[#9a9a8a]">—</span>}
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
    <div className="mx-auto max-w-2xl px-6 py-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <Link
        href="/settings"
        className="text-xs text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← Settings
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Claim Calibration</h1>
          <p className="page-subtitle">
            Tracks how your claims perform over time. The system adjusts confidence in different
            claim types based on outcome feedback.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-5 w-5 border-2 border-border border-t-brand rounded-full animate-spin" />
        </div>
      ) : (
        <HonestyCalibrationTable rows={calibrations} />
      )}

      <p className="text-xs text-muted-foreground mt-6">
        Trust levels are updated when you log outcomes. A trust level below 70% means the system
        will ask for stronger evidence before using that claim type prominently.
      </p>
    </div>
  );
}
