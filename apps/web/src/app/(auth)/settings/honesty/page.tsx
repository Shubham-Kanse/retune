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
      className={`border border-[rgba(26,26,26,0.12)] rounded-3xl overflow-hidden text-sm ${className ?? ""}`}
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
          <span className="truncate capitalize text-xs text-foreground">
            {row.claimType.replace(/_/g, " ")}
          </span>
          <div className="flex items-center gap-1.5 justify-end">
            <div className="w-10 h-1 bg-[#f2ede3] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${row.trustFactor >= 0.8 ? "bg-brand" : row.trustFactor >= 0.6 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${row.trustFactor * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-[#6b6b5b]">
              {Math.round(row.trustFactor * 100)}
            </span>
          </div>
          <span className="text-right text-xs text-[#9a9a8a] tabular-nums">{row.sampleSize}</span>
          <span className="text-right text-xs">
            {row.trend === "up" && <span className="text-brand">↑</span>}
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
    <div className="w-full max-w-4xl px-10 md:px-16 py-12 pb-16">
      {/* Header */}
      <div className="flex items-end justify-between mb-12">
        <div>
          <p className="rt-label mb-3">Honesty</p>
          <h1 className="font-serif text-5xl md:text-6xl font-normal text-foreground leading-[1] tracking-tight">
            Claim Calibration
          </h1>
        </div>
        <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors mb-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
      </div>

        <p className="text-sm text-muted-foreground mb-6">
          Tracks how your claims perform over time. The system adjusts confidence in different
          claim types based on outcome feedback.
        </p>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-5 w-5 border-2 border-[#e0ddd9] border-t-[#2d8a5e] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="rounded-3xl border border-[#e0ddd9] bg-white/90 p-8 backdrop-blur-sm shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <HonestyCalibrationTable rows={calibrations} />
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          Trust levels are updated when you log outcomes. A trust level below 70% means the system
          will ask for stronger evidence before using that claim type prominently.
        </p>
    </div>
  );
}
