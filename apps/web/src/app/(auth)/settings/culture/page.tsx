"use client";

import { PageHeader, PageShell } from "@/components/app/page-shell";
import { Button } from "@/components/ui/button";
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
        eyebrow="Settings"
        title="Cultural preferences"
        subtitle="Set your work style preferences so applications are calibrated to roles that suit you."
        action={
          <div className="flex items-center gap-3">
            {saved ? (
              <span className="text-xs text-muted-foreground">Saved</span>
            ) : null}
            <Button asChild variant="ghost" size="sm">
              <Link href="/settings">Back to settings</Link>
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-foreground" />
        </div>
      ) : (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6 md:p-8">
          {AXES.map(({ key, left, right }) => {
            const value = axes[key];
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
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
                  className="w-full accent-foreground"
                />
                <div className="flex justify-center">
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {value > 0 ? `+${value}` : value === 0 ? "Balanced" : value}
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
