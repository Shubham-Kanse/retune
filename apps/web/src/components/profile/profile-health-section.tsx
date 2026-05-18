"use client";

interface ProfileHealthSectionProps {
  qualityScore: number | null;
  completenessScore: number | null;
  completenessPath: string | null;
  needsReviewFields?: string[];
  correctionUnresolved?: boolean;
  voiceProfileSource?: string | null;
}

const TOTAL_DOTS = 20; // 5 points per dot — granular but readable

/**
 * Profile Health indicator. A 20-dot fuel-gauge meter that gives a precise
 * read on profile quality without a heavy card wrapper. Sits inline above
 * the rest of the page.
 */
export function ProfileHealthSection({
  qualityScore,
  completenessScore,
  completenessPath,
  needsReviewFields = [],
  correctionUnresolved = false,
  voiceProfileSource,
}: ProfileHealthSectionProps) {
  const score = qualityScore ?? completenessScore ?? null;
  if (score == null) return null;

  const filled = Math.min(TOTAL_DOTS, Math.round((score / 100) * TOTAL_DOTS));
  const tier = scoreToTier(score);

  const warnings: string[] = [];
  if (correctionUnresolved) warnings.push("Some profile details may need review");
  if (voiceProfileSource === "default")
    warnings.push("Voice profile is using defaults — complete it for stronger resumes");
  if (needsReviewFields.length > 0)
    warnings.push(
      `${needsReviewFields.length} field${needsReviewFields.length > 1 ? "s" : ""} flagged for review`,
    );

  return (
    <section aria-labelledby="profile-health-heading" className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="profile-health-heading"
          className="text-sm font-medium text-muted-foreground"
        >
          Profile Health
        </h2>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{tier.label}</span>
          <span className="text-xs text-muted-foreground/70">{score}/100</span>
        </div>
      </div>

      <div
        className="flex gap-[3px]"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Profile health: ${tier.label}, ${score} out of 100`}
      >
        {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < filled ? tier.color : "bg-muted"
            }`}
          />
        ))}
      </div>

      {(completenessPath || warnings.length > 0) && (
        <div className="space-y-0.5">
          {completenessPath && (
            <p className="text-xs text-muted-foreground/70">
              Tailored for the {humanPath(completenessPath)} path
            </p>
          )}
          {warnings.map((w) => (
            <p
              key={w}
              className="flex items-start gap-1.5 text-xs text-violet-400/70 dark:text-violet-400/60"
            >
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-violet-400/60 animate-pulse self-center" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function scoreToTier(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excellent", color: "bg-violet-500" };
  if (score >= 75) return { label: "Good", color: "bg-violet-500" };
  if (score >= 55) return { label: "Adequate", color: "bg-violet-400" };
  if (score >= 30) return { label: "Thin", color: "bg-violet-300" };
  return { label: "Needs work", color: "bg-violet-200" };
}

function humanPath(p: string): string {
  switch (p) {
    case "standard":
      return "standard";
    case "new_grad":
      return "new grad";
    case "career_changer":
      return "career changer";
    case "contractor":
      return "contractor";
    case "returning":
      return "returning to work";
    default:
      return p;
  }
}
