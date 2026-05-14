import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import type { ProfileReadiness } from "@/lib/onboarding/types";

export function ProfilePreviewPanel({ readiness }: { readiness: ProfileReadiness | null }) {
  const score = readiness?.score ?? 0;

  return (
    <aside className="w-full space-y-5 text-muted-foreground">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Profile
        </p>
        <p className="text-xs tabular-nums text-foreground">
          {readiness ? `${score}%` : "Waiting"}
        </p>
      </div>

      <div className="flex justify-center">
        <AnimatedCircularProgressBar
          value={score}
          gaugePrimaryColor="var(--foreground)"
          gaugeSecondaryColor="var(--border)"
          className="size-32 text-xl"
        />
      </div>

      {readiness?.blockers.length ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
            Next
          </p>
          <ul className="space-y-1.5">
            {readiness.blockers.slice(0, 2).map((blocker) => (
              <li key={blocker} className="text-[0.7rem] leading-snug text-muted-foreground">
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
