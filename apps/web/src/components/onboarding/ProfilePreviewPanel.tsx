import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import type { ProfileReadiness, UserCareerProfile } from "@/lib/onboarding/types";

interface ProfilePreviewPanelProps {
  readiness: ProfileReadiness | null;
  profile?: UserCareerProfile | null;
}

export function ProfilePreviewPanel({ readiness, profile }: ProfilePreviewPanelProps) {
  const score = readiness?.score ?? 0;
  const name = profile?.identity?.fullName?.value;
  const title = profile?.professionalProfile?.currentTitles?.value?.[0] ?? profile?.experience?.value?.[0]?.title;
  const location = profile?.identity?.location?.value;
  const initial = name ? name.charAt(0).toUpperCase() : "?";

  const topExperiences = (profile?.experience?.value ?? []).slice(0, 3);
  const topSkills = [
    ...(profile?.skills?.technical?.value ?? []),
    ...(profile?.skills?.tools?.value ?? []),
    ...(profile?.skills?.business?.value ?? []),
  ].slice(0, 8);

  return (
    <aside className="w-full space-y-4 text-muted-foreground">
      {/* Header with avatar + name */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-sm font-semibold text-foreground">
          {initial}
        </div>
        <div className="min-w-0">
          {name && <p className="truncate text-sm font-medium text-foreground">{name}</p>}
          {title && <p className="truncate text-xs text-muted-foreground">{title}</p>}
          {location && <p className="truncate text-[0.68rem] text-muted-foreground">{location}</p>}
        </div>
      </div>

      {/* Score */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Readiness
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
          className="size-20 text-base"
        />
      </div>

      {/* Top experiences */}
      {topExperiences.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">Experience</p>
          <ul className="space-y-1">
            {topExperiences.map((exp, i) => (
              <li key={exp.id ?? i} className="text-[0.7rem] leading-snug text-muted-foreground">
                <span className="font-medium text-foreground">{exp.title}</span>
                {exp.company && <span> · {exp.company}</span>}
                {exp.startDate && <span> · {exp.startDate}{exp.endDate ? `–${exp.endDate}` : ""}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Top skills */}
      {topSkills.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">Skills</p>
          <div className="flex flex-wrap gap-1">
            {topSkills.map((skill) => (
              <span key={skill} className="rounded-full bg-foreground/5 px-2 py-0.5 text-[0.65rem] text-foreground">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Blockers */}
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
