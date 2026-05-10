"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const AXES = [
  { key: "individualVsCollective", left: "Individual contributor", right: "Team-first" },
  { key: "directVsDiplomatic", left: "Direct communicator", right: "Diplomatic" },
  { key: "fastVsDeliberate", left: "Move fast", right: "Deliberate" },
  { key: "hierarchyVsFlat", left: "Clear hierarchy", right: "Flat org" },
  { key: "remoteVsOnsite", left: "Remote-first", right: "Onsite-first" },
  { key: "explicitVsImplicit", left: "Explicit norms", right: "Implicit culture" },
  { key: "riskVsSafe", left: "Risk-taking", right: "Risk-averse" },
  { key: "missionVsCompensation", left: "Mission-driven", right: "Compensation-driven" },
] as const;

type AxisKey = (typeof AXES)[number]["key"];
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
  const [axes, setAxes] = useState<Axes>(DEFAULT_AXES);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
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
        // small delay so labels stagger after content appears
        setTimeout(() => setMounted(true), 50);
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
    <div className="mx-auto max-w-2xl px-6 py-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <Link
        href="/settings"
        className="text-xs text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← Settings
      </Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Cultural Preferences</h1>
          <p className="page-subtitle">
            Set your work style preferences so applications are calibrated to roles that suit you.
          </p>
        </div>
        {saved && (
          <span className="text-xs text-brand animate-in fade-in shrink-0 mt-1">Saved</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-4 w-4 border-2 border-border border-t-brand rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {AXES.map(({ key, left, right }, index) => {
            const value = axes[key];
            return (
              <div
                key={key}
                className="animate-in fade-in duration-300"
                style={{
                  animationDelay: mounted ? `${index * 60}ms` : "0ms",
                  animationFillMode: "both",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{left}</span>
                  <span className="text-xs text-muted-foreground">{right}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  step="10"
                  value={value}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="w-full accent-brand"
                />
                <div className="flex justify-center mt-1">
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {value > 0 ? `+${value}` : value === 0 ? "Balanced" : value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
