"use client";

interface VerdictCardProps {
  verdict: "ship" | "revise" | "refuse";
  interviewReadyScore: number;
  submissionConfidence: number;
  outcomePoint?: number | null;
  reasons?: string[];
  reviseSuggestions?: string[];
  applicationId: string;
  className?: string;
}

const VERDICT_CONFIG = {
  ship: {
    label: "READY TO APPLY",
    color: "text-[oklch(0.6_0.2_250)]",
    bg: "bg-[oklch(0.6_0.2_250)]/10",
    border: "border-[oklch(0.6_0.2_250)]/30",
    ring: "oklch(0.6_0.2_250)",
  },
  revise: {
    label: "NEEDS REVISION",
    color: "text-[oklch(0.72_0.17_65)]",
    bg: "bg-[oklch(0.72_0.17_65)]/10",
    border: "border-[oklch(0.72_0.17_65)]/30",
    ring: "oklch(0.72_0.17_65)",
  },
  refuse: {
    label: "NOT RECOMMENDED",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    ring: "oklch(0.6_0.22_25)",
  },
};

function ScoreRing({
  score,
  color,
  size = 88,
}: {
  score: number;
  color: string;
  size?: number;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox="0 0 88 88" aria-label={`Score: ${score}/100`}>
      <title>{`Interview ready score: ${score}/100`}</title>
      {/* Track */}
      <circle cx="44" cy="44" r={radius} fill="none" stroke="oklch(0.3 0 0)" strokeWidth="6" />
      {/* Progress */}
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="square"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      {/* Label */}
      <text
        x="44"
        y="40"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="18"
        fontWeight="600"
        fill="currentColor"
        className="text-foreground"
      >
        {score}
      </text>
      <text
        x="44"
        y="55"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="8"
        fill="oklch(0.6 0 0)"
      >
        /100
      </text>
    </svg>
  );
}

export function VerdictCard({
  verdict,
  interviewReadyScore,
  submissionConfidence,
  outcomePoint,
  reasons,
  reviseSuggestions,
  applicationId,
  className,
}: VerdictCardProps) {
  const config = VERDICT_CONFIG[verdict];

  return (
    <div className={`rt-card p-6 ${className ?? ""}`}>
      {/* Verdict badge */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Application Verdict
          </p>
          <span
            className={`inline-block px-3 py-1.5 text-sm font-semibold tracking-wide border ${config.color} ${config.bg} ${config.border}`}
          >
            {config.label}
          </span>
        </div>
        <ScoreRing score={interviewReadyScore} color={config.ring} />
      </div>

      {/* Metric rows */}
      <div className="border border-border divide-y divide-border mb-5">
        <div className="flex items-center justify-between px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">Interview Ready Score</span>
          <span className="tabular-nums font-medium text-foreground">
            {interviewReadyScore}/100
          </span>
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 text-xs">
          <span className="text-muted-foreground">Submission Confidence</span>
          <span className="tabular-nums font-medium text-foreground">
            {Math.round(submissionConfidence * 100)}%
          </span>
        </div>
        {outcomePoint != null && (
          <div className="flex items-center justify-between px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">Outcome Probability</span>
            <span className="tabular-nums font-medium text-foreground">
              {Math.round(outcomePoint * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Reasons (refuse/revise) */}
      {reasons && reasons.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {verdict === "refuse" ? "Blocking Issues" : "Issues Found"}
          </p>
          <ul className="space-y-1.5">
            {reasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs text-muted-foreground leading-snug">
                <span className={`shrink-0 mt-0.5 ${config.color}`}>—</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions (revise only) */}
      {reviseSuggestions && reviseSuggestions.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Suggested Improvements
          </p>
          <ul className="space-y-1.5">
            {reviseSuggestions.map((s) => (
              <li key={s} className="flex gap-2 text-xs text-muted-foreground leading-snug">
                <span className="shrink-0 mt-0.5 text-[oklch(0.72_0.17_65)]">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA buttons */}
      <div className="flex items-center gap-2 pt-1">
        <a href={`/applications/${applicationId}`} className="rt-btn text-xs px-4 min-h-9">
          View Application
        </a>
        {verdict === "refuse" && (
          <a
            href={`/generate/${applicationId}/contest`}
            className="rt-btn-ghost text-xs px-4 min-h-9"
          >
            Contest Decision
          </a>
        )}
      </div>
    </div>
  );
}
