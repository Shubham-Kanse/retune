"use client";

import type { PreflightDetectResponse } from "@/lib/drift-preflight";
import { cn } from "@/lib/utils";

/**
 * Verdict-first panel — the honest read on the role BEFORE any credits
 * are spent. Computed entirely from the preflight drift summary; no
 * extra API calls. The user always sees this before generation starts.
 */

export interface MatchVerdictModel {
  tone: "strong" | "fair" | "weak";
  headline: string;
  matchPercent: number;
  detail: string;
}

export function computeVerdict(preflight: PreflightDetectResponse): MatchVerdictModel {
  const { matched_skills, missing_must_have, missing_good_to_have } = preflight.drift_summary;
  const mustTotal = matched_skills.length + missing_must_have.length;

  // Must-have coverage dominates (70%); good-to-have gaps erode the rest.
  const mustCoverage = mustTotal > 0 ? matched_skills.length / mustTotal : 1;
  const goodPenalty = Math.min(missing_good_to_have.length * 0.05, 0.3);
  const matchPercent = Math.round(Math.max(0, mustCoverage * 0.7 + (0.3 - goodPenalty)) * 100);

  if (missing_must_have.length === 0 && missing_good_to_have.length === 0) {
    return {
      tone: "strong",
      headline: "Strong match",
      matchPercent,
      detail: "Your profile covers every skill this role asks for. This is worth applying to.",
    };
  }
  if (missing_must_have.length >= 3) {
    return {
      tone: "weak",
      headline: "Weak match — consider carefully",
      matchPercent,
      detail: `${missing_must_have.length} required skills have no evidence in your profile. Answer the questions below honestly — if the gaps are real, your time may be better spent on a closer role.`,
    };
  }
  return {
    tone: "fair",
    headline: "Decent match with gaps",
    matchPercent,
    detail:
      missing_must_have.length > 0
        ? "Most requirements are covered, but a few need clarifying before we can write honestly about them."
        : "All required skills are covered; a few nice-to-haves are missing and that's usually fine.",
  };
}

const TONE_STYLES: Record<MatchVerdictModel["tone"], string> = {
  strong: "border-emerald-500/30 bg-emerald-500/5",
  fair: "border-amber-500/30 bg-amber-500/5",
  weak: "border-destructive/30 bg-destructive/5",
};

const TONE_TEXT: Record<MatchVerdictModel["tone"], string> = {
  strong: "text-emerald-600 dark:text-emerald-400",
  fair: "text-amber-600 dark:text-amber-400",
  weak: "text-destructive",
};

export function MatchVerdict({
  preflight,
  onGenerate,
  onCancel,
  busy,
  showGenerateCta,
}: {
  preflight: PreflightDetectResponse;
  onGenerate: () => void;
  onCancel: () => void;
  busy: boolean;
  /** Hidden while drift questions are pending — answering them is the CTA. */
  showGenerateCta: boolean;
}) {
  const verdict = computeVerdict(preflight);
  const { matched_skills, missing_must_have, missing_good_to_have } = preflight.drift_summary;
  const roleTitle = preflight.structured_jd.role_title;

  return (
    <section
      aria-label="Match verdict"
      className={cn("rounded-lg border p-5 space-y-4", TONE_STYLES[verdict.tone])}
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60">
            Before you spend a credit · {roleTitle}
          </p>
          <h2 className={cn("mt-1 text-lg font-medium", TONE_TEXT[verdict.tone])}>
            {verdict.headline}
          </h2>
        </div>
        <p className={cn("text-2xl font-semibold tabular-nums", TONE_TEXT[verdict.tone])}>
          {verdict.matchPercent}%
        </p>
      </div>

      <p className="text-sm text-foreground/80">{verdict.detail}</p>

      <div className="grid gap-3 sm:grid-cols-3 text-xs">
        <SkillColumn label="Covered" skills={matched_skills} muted={false} />
        <SkillColumn label="Required — no evidence yet" skills={missing_must_have} muted={false} />
        <SkillColumn label="Nice-to-have — missing" skills={missing_good_to_have} muted />
      </div>

      <div className="flex items-center gap-3 pt-1">
        {showGenerateCta ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={busy}
            className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Starting…" : "Generate the package"}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground/70">
            Answer the quick questions below so we only claim what you can back up.
          </p>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground"
        >
          Try a different role
        </button>
      </div>
    </section>
  );
}

function SkillColumn({
  label,
  skills,
  muted,
}: {
  label: string;
  skills: string[];
  muted: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-widest text-muted-foreground/50">
        {label}
      </p>
      {skills.length === 0 ? (
        <p className="text-muted-foreground/40">None</p>
      ) : (
        <ul className="space-y-1">
          {skills.slice(0, 8).map((s) => (
            <li
              key={s}
              className={cn("truncate", muted ? "text-muted-foreground/60" : "text-foreground/80")}
            >
              {s}
            </li>
          ))}
          {skills.length > 8 ? (
            <li className="text-muted-foreground/40">+{skills.length - 8} more</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
