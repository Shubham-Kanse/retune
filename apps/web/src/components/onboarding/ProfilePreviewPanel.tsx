import type { ProfileReadiness } from "@/lib/onboarding/types";

const LABELS: Record<string, string> = {
  identity: "Identity",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
  professionalProfile: "Professional profile",
  careerIntent: "Career intent",
  resumeWritingSignals: "Resume signals",
};

export function ProfilePreviewPanel({ readiness }: { readiness: ProfileReadiness | null }) {
  const categories = readiness?.completedCategories;
  const score = readiness?.score ?? 0;

  return (
    <aside className="w-full text-muted-foreground">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">Profile</p>
        <p className="text-xs tabular-nums text-foreground">{readiness ? `${score}%` : "Waiting"}</p>
      </div>

      <div className="mt-2 h-px w-full bg-border">
        <div className="h-px bg-foreground" style={{ width: `${score}%` }} />
      </div>

      <div className="mt-4 space-y-2.5">
        {categories &&
          Object.entries(categories).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 text-[0.7rem] leading-none">
              <span className="truncate">{LABELS[key] ?? key}</span>
              <span className="tabular-nums text-muted-foreground">{value}%</span>
            </div>
          ))}
      </div>

      {readiness?.blockers.length ? (
        <div className="mt-5 space-y-1.5 border-t border-border pt-3">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">Next</p>
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
