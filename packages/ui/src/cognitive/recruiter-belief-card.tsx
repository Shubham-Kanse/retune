"use client";

interface RecruiterBeliefState {
  hiringIntentPrediction: string;
  projectedFirstQuestion: string;
  perceivedGaps: Array<{ topic: string; severity: string }>;
  inferredLevel: string;
}

interface RecruiterBeliefCardProps {
  belief: RecruiterBeliefState;
  className?: string;
}

export function RecruiterBeliefCard({ belief, className }: RecruiterBeliefCardProps) {
  return (
    <div className={`border border-border p-4 space-y-4 ${className ?? ""}`}>
      <div>
        <span className="rt-label">Recruiter&apos;s likely first impression</span>
        <p className="text-sm mt-1">{belief.hiringIntentPrediction}</p>
      </div>

      <div>
        <span className="rt-label">Likely first question</span>
        <p className="text-sm text-muted-foreground mt-1 italic">
          &ldquo;{belief.projectedFirstQuestion}&rdquo;
        </p>
      </div>

      {belief.perceivedGaps.length > 0 && (
        <div>
          <span className="rt-label">Perceived gaps</span>
          <ul className="mt-1 space-y-1">
            {belief.perceivedGaps.map((gap) => (
              <li key={gap.topic} className="flex items-center gap-2 text-xs">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    gap.severity === "high"
                      ? "bg-destructive"
                      : gap.severity === "medium"
                        ? "bg-amber-500"
                        : "bg-muted-foreground"
                  }`}
                />
                <span className="text-muted-foreground">{gap.topic}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
        <span>Inferred level</span>
        <span className="font-medium text-foreground">{belief.inferredLevel}</span>
      </div>
    </div>
  );
}
