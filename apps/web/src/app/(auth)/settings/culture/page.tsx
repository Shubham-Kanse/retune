"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const AXIS_KEYS = [
  "individualVsCollective",
  "directVsDiplomatic",
  "fastVsDeliberate",
  "hierarchyVsFlat",
  "remoteVsOnsite",
  "explicitVsImplicit",
  "riskVsSafe",
  "missionVsCompensation",
] as const;

type AxisKey = (typeof AXIS_KEYS)[number];
type Axes = Record<AxisKey, number>;

const DEFAULT_AXES: Axes = {
  individualVsCollective: 0,
  directVsDiplomatic: 0,
  fastVsDeliberate: 0,
  hierarchyVsFlat: 0,
  remoteVsOnsite: 0,
  explicitVsImplicit: 0,
  riskVsSafe: 0,
  missionVsCompensation: 0,
};

export default function CultureSettingsPage() {
  const t = useTranslations("settings_culture");
  const [axes, setAxes] = useState<Axes>(DEFAULT_AXES);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        try {
          const notes = JSON.parse(data.voiceNotes ?? "{}") as Record<string, unknown>;
          if (notes.culturalAxes && typeof notes.culturalAxes === "object") {
            setAxes({ ...DEFAULT_AXES, ...(notes.culturalAxes as Partial<Axes>) });
          }
        } catch {
          /* ignore */
        }
      })
      .catch(() => null)
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const save = useCallback((next: Axes) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const profileRes = await fetch("/api/profile");
        if (!profileRes.ok) return;
        const profile = (await profileRes.json()) as { voiceNotes?: string };
        let notes: Record<string, unknown> = {};
        try {
          notes = JSON.parse(profile.voiceNotes ?? "{}") as Record<string, unknown>;
        } catch {
          /* ignore */
        }
        notes.culturalAxes = next;
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voiceNotes: JSON.stringify(notes) }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch {
        /* ignore */
      }
    }, 500);
  }, []);

  function handleChange(key: AxisKey, raw: string) {
    const next = { ...axes, [key]: Number(raw) };
    setAxes(next);
    save(next);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <div className="flex items-center gap-3">
            {saved ? (
              <span className="text-xs text-muted-foreground">{t("saved")}</span>
            ) : null}
            <Link href="/settings" className="inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {t("back")}
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {AXIS_KEYS.map((key) => {
            const value = axes[key];
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t(`axes.${key}_left` as Parameters<typeof t>[0])}</span>
                  <span className="text-xs text-muted-foreground">{t(`axes.${key}_right` as Parameters<typeof t>[0])}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="10"
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full accent-foreground"
                  aria-label={`${t(`axes.${key}_left` as Parameters<typeof t>[0])} to ${t(`axes.${key}_right` as Parameters<typeof t>[0])}`}
                />
                <div className="flex justify-center">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {value > 0 ? `+${value}` : value === 0 ? t("balanced") : value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
