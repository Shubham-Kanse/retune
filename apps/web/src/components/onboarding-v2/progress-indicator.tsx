"use client";

interface ProgressIndicatorProps {
  currentStage: number; // 1..9
  totalStages?: number;
}

const STAGE_LABELS: Record<number, string> = {
  1: "Upload",
  2: "Read",
  3: "Understand",
  4: "Confirm",
  5: "Correct",
  6: "Plan",
  7: "Tailor",
  8: "Voice",
  9: "Finish",
};

/**
 * Subtle stage progress indicator. Renders 9 dots; the active dot is filled
 * and labeled. Earlier dots are dimmed; later dots are outlined.
 *
 * Per the spec this is intentionally non-percentage and non-intrusive — it
 * should feel like progress, not a form to fill out.
 */
export function ProgressIndicator({ currentStage, totalStages = 9 }: ProgressIndicatorProps) {
  const stages = Array.from({ length: totalStages }, (_, i) => i + 1);
  const label = STAGE_LABELS[currentStage] ?? "";

  return (
    <div
      role="progressbar"
      aria-valuenow={currentStage}
      aria-valuemin={1}
      aria-valuemax={totalStages}
      aria-label={`Onboarding stage ${currentStage} of ${totalStages}: ${label}`}
      className="flex items-center gap-2"
      tabIndex={0}
    >
      <div className="flex items-center gap-1.5">
        {stages.map((s) => (
          <span
            key={s}
            aria-hidden
            className={`h-1.5 rounded-full transition-all ${
              s < currentStage
                ? "w-1.5 bg-stone-600"
                : s === currentStage
                  ? "w-6 bg-indigo-500"
                  : "w-1.5 bg-stone-800 ring-1 ring-stone-700"
            }`}
          />
        ))}
      </div>
      {label && <span className="text-xs uppercase tracking-widest text-stone-500">{label}</span>}
    </div>
  );
}
