"use client";

import { ProfileSourceBadge } from "./profile-source-badge";

interface VoiceSectionProps {
  voice: {
    natural_voice_sample: string | null;
    tone_preferences: unknown;
    tone_aversions: string[];
    self_description_style: string | null;
    sentence_structure: string | null;
    vocabulary_register: string | null;
    leading_pattern: string | null;
    phrases_to_use: string[];
    phrases_to_avoid: string[];
    tone_calibration_summary: string | null;
    voice_profile_confidence: string | null;
    voice_profile_source: string | null;
  } | null;
}

const CONFIDENCE_DOTS: Record<string, { filled: number; label: string }> = {
  high: { filled: 5, label: "High" },
  medium: { filled: 3, label: "Medium" },
  low: { filled: 1, label: "Low" },
};

const FALLBACK_DOTS = CONFIDENCE_DOTS.low!;

/**
 * "Your Writing Voice" section. Shows the user how Retune will write for
 * them — the tone calibration summary (used verbatim in resume generation),
 * style descriptors, and confidence. Edit opens a modal that re-runs the
 * Stage 8 voice questions.
 */
export function VoiceSection({ voice }: VoiceSectionProps) {
  const tonePrefs = formatTonePreferences(voice?.tone_preferences);
  const aversions = (voice?.tone_aversions ?? []).map((a) => labelize(a)).join(", ");
  const confidence = (voice?.voice_profile_confidence as string) || "low";
  const dots = CONFIDENCE_DOTS[confidence] ?? FALLBACK_DOTS;
  const isCollected = voice?.voice_profile_source === "collected";

  return (
    <section
      aria-labelledby="voice-section-heading"
      className="rounded-xl border border-border bg-background"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border/50 px-5 py-3">
        <div>
          <h2
            id="voice-section-heading"
            className="flex items-center gap-1.5 text-base font-semibold text-foreground mt-0"
          >
            Your Writing Voice
          </h2>
          <p className="text-xs text-muted-foreground">
            How Retune writes resumes that sound like you.
          </p>
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        {voice?.tone_calibration_summary ? (
          <blockquote className="mt-0 border-l-2 border-indigo-500/40 pl-3 text-sm italic text-foreground/90">
            &ldquo;{voice.tone_calibration_summary}&rdquo;
          </blockquote>
        ) : (
          <p className="text-sm text-muted-foreground">
            Voice profile not yet collected. Click &ldquo;Tune with AI&rdquo; to add yours.
          </p>
        )}

        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Style</dt>
            <dd className="font-medium text-foreground">{voice?.self_description_style ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Leads with</dt>
            <dd className="font-medium text-foreground">
              {voice?.leading_pattern ? formatLeadingPattern(voice.leading_pattern) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Avoids</dt>
            <dd className="font-medium text-foreground">{aversions || "—"}</dd>
          </div>
        </dl>

        {tonePrefs && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Tone:</span>
            {tonePrefs.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">Confidence:</span>
          <div
            className="flex gap-0.5"
            role="img"
            aria-label={`Voice profile confidence: ${dots.label}`}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                aria-hidden
                className={`size-1.5 rounded-full ${i < dots.filled ? "bg-indigo-500" : "bg-muted"}`}
              />
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {dots.label}
            {!isCollected && " — complete your voice profile for better results"}
          </span>
        </div>
      </div>
    </section>
  );
}

function formatTonePreferences(prefs: unknown): string[] | null {
  if (!prefs) return null;
  if (typeof prefs === "string") return [labelize(prefs)];
  if (Array.isArray(prefs)) return prefs.map((p) => labelize(String(p)));
  return null;
}

function formatLeadingPattern(p: string): string {
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
