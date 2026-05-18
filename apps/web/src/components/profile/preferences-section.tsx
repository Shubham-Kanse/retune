"use client";

import { ProfileSourceBadge } from "./profile-source-badge";

interface PreferencesSectionProps {
  preferences: {
    target_role: string | null;
    target_role_specificity: string | null;
    resume_frame: string | null;
    underrepresented_skills: unknown;
    deemphasis_preferences: unknown;
    career_transition_framing: string | null;
    gap_handling: string | null;
    achievement_depth: unknown;
  };
  /** Per-field source map from user_onboarding_metadata_v2.field_sources. */
  fieldSources?: Record<string, string>;
}

/**
 * "Resume Generation Preferences" section. Shows the user the answers they
 * gave during Stage 7, presented as a transparent settings panel.
 */
export function PreferencesSection({
  preferences,
  fieldSources = {},
}: PreferencesSectionProps) {
  const target = [preferences.target_role, preferences.target_role_specificity]
    .filter(Boolean)
    .join(" — ");
  const highlight = formatList(preferences.underrepresented_skills);
  const deemphasise = formatList(preferences.deemphasis_preferences);
  const achievements = formatAchievementDepth(preferences.achievement_depth);

  const rows: Array<{ label: string; value: string; source?: string }> = [
    { label: "Target", value: target || "Not set", source: fieldSources.target_role },
    {
      label: "Frame",
      value: preferences.resume_frame ? labelize(preferences.resume_frame) : "Not set",
      source: fieldSources.resume_frame,
    },
    {
      label: "Highlight",
      value: highlight || "—",
      source: fieldSources.underrepresented_skills,
    },
    {
      label: "De-emphasise",
      value: deemphasise || "—",
      source: fieldSources.deemphasis_preferences,
    },
    {
      label: "Gaps",
      value: preferences.gap_handling ? labelize(preferences.gap_handling) : "—",
      source: fieldSources.gap_handling,
    },
    {
      label: "Transition",
      value: preferences.career_transition_framing
        ? labelize(preferences.career_transition_framing)
        : "N/A",
      source: fieldSources.career_transition_framing,
    },
    { label: "Achievements", value: achievements, source: fieldSources.achievement_depth },
  ];

  return (
    <section
      aria-labelledby="preferences-section-heading"
      className="rounded-xl border border-border bg-background"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/50 px-5 py-3">
        <div>
          <h2 id="preferences-section-heading" className="text-base font-semibold text-foreground mt-0">
            Resume Generation Preferences
          </h2>
          <p className="text-xs text-muted-foreground">
            How Retune will tailor every resume it generates for you.
          </p>
        </div>
      </div>

      <dl className="divide-y divide-border/40 px-5 py-2">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[110px_1fr_auto] items-baseline gap-2 py-2">
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="text-sm text-foreground">{r.value}</dd>
            <dd>{r.source && <ProfileSourceBadge source={r.source} />}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function formatList(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return labelize(value);
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((v) => labelize(String(v)))
      .join(", ");
  }
  return "";
}

function formatAchievementDepth(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "string") {
    if (value === "not_applicable") return "Not easily measured";
    if (value === "prefer_not") return "Prefer not to include metrics";
    if (value === "will_share") return "Metrics provided";
    if (value === "help_me") return "Working through metrics";
    if (value === "deferred") return "Deferred";
    return labelize(value);
  }
  if (Array.isArray(value)) return `${value.length} quantified metrics on file`;
  return "—";
}

function labelize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
