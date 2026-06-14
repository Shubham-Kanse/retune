"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { useTranslations } from "next-intl";
import Link from "next/link";

// Inlined from @retune/ui/cognitive (package not yet built)
function VoiceFingerprintRadar({
  dimensions,
  className,
}: { dimensions: Record<string, number>; className?: string }) {
  const entries = Object.entries(dimensions).slice(0, 12);
  if (entries.length === 0) return null;
  const size = 200,
    cx = 100,
    cy = 100,
    radius = 76,
    n = entries.length;
  const points = entries.map(([, v], i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + radius * v * Math.cos(a), y: cy + radius * v * Math.sin(a) };
  });
  return (
    <div className={className}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <title>Voice fingerprint</title>
        {[0.25, 0.5, 0.75, 1].map((l) => (
          <circle
            key={l}
            cx={cx}
            cy={cy}
            r={radius * l}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
          />
        ))}
        {entries.map(([k], i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          return (
            <line
              key={k}
              x1={cx}
              y1={cy}
              x2={cx + radius * Math.cos(a)}
              y2={cy + radius * Math.sin(a)}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
            />
          );
        })}
        <polygon
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="currentColor"
          fillOpacity={0.12}
          stroke="currentColor"
          strokeWidth={1.5}
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="currentColor" />
        ))}
        {entries.map(([k], i) => {
          const a = (Math.PI * 2 * i) / n - Math.PI / 2;
          return (
            <text
              key={k}
              x={cx + (radius + 16) * Math.cos(a)}
              y={cy + (radius + 16) * Math.sin(a)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              {k.replace(/_/g, " ").slice(0, 10)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
import { useEffect, useState } from "react";

interface VoiceFingerprint {
  sampleSize: number;
  updatedAt: string;
  dimensions: Record<string, number>;
}

export default function VoiceFingerprintSettingsPage() {
  const t = useTranslations("settings_voice");
  const [fingerprint, setFingerprint] = useState<VoiceFingerprint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile/voice-fingerprint")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFingerprint(d as VoiceFingerprint | null))
      .catch(() => null)
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
      ) : fingerprint ? (
        <div className="space-y-8">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t("status_label")}</span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{t("status_active")}</span>
            </div>
            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t("docs_analyzed")}</p>
                <p className="mt-0.5 text-lg font-semibold">{fingerprint.sampleSize}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("last_updated")}</p>
                <p className="mt-0.5 text-lg font-semibold">
                  {new Date(fingerprint.updatedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {fingerprint.dimensions && Object.keys(fingerprint.dimensions).length > 0 && (
            <div className="border-t border-border/50 pt-8">
              <h3 className="mb-4 text-xs text-muted-foreground">
                {t("style_characteristics")}
              </h3>
              <VoiceFingerprintRadar
                dimensions={fingerprint.dimensions}
                className="flex justify-center text-foreground"
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">{t("auto_update_note")}</p>
        </div>
      ) : (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">{t("empty_title")}</p>
          <Link href="/generate/new" className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90">
            {t("empty_cta")}
          </Link>
        </div>
      )}
    </PageShell>
  );
}
