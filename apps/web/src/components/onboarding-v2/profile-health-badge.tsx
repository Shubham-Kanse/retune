"use client";

interface ProfileHealthBadgeProps {
  score: number;
  note?: string;
  size?: "sm" | "md";
}

/**
 * Quality score visualisation: a colored bar with a numeric score and an
 * optional one-sentence note. Used in the Stage 9 audit summary and on the
 * profile page header.
 */
export function ProfileHealthBadge({ score, note, size = "md" }: ProfileHealthBadgeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier =
    clamped >= 90
      ? { label: "Excellent", color: "bg-emerald-500" }
      : clamped >= 70
        ? { label: "Good", color: "bg-emerald-600/80" }
        : clamped >= 50
          ? { label: "Adequate", color: "bg-amber-500" }
          : { label: "Thin", color: "bg-red-500" };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className={`${size === "sm" ? "text-sm" : "text-base"} font-semibold text-foreground`}>
          {clamped}/100
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {tier.label}
        </span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile quality score"
        tabIndex={0}
      >
        <div className={`h-full transition-all ${tier.color}`} style={{ width: `${clamped}%` }} />
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
