"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("settings_honesty");
  if (rows.length === 0)
    return (
      <div className={`text-sm text-muted-foreground ${className ?? ""}`}>
        {t("no_data")}
      </div>
    );
  return (
    <div className={`text-sm ${className ?? ""}`}>
      <div className="grid grid-cols-[1fr_80px_60px_40px] gap-2 border-b border-border/50 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>{t("col_claim_type")}</span>
        <span className="text-right">{t("col_trust")}</span>
        <span className="text-right">{t("col_samples")}</span>
        <span className="text-right">{t("col_trend")}</span>
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
  const t = useTranslations("settings_honesty");
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
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Link href="/settings" className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            {t("back")}
          </Link>
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

      <p className="mt-6 text-xs text-muted-foreground">{t("trust_note")}</p>
    </PageShell>
  );
}
