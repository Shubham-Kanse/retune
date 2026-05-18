"use client";

interface ProfileSourceBadgeProps {
  source?: string | null;
  className?: string;
}

const SOURCE_MAP: Record<string, { dot: string; label: string; bg: string; text: string }> = {
  extracted: {
    dot: "✓",
    label: "From your resume",
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  user_confirmed: {
    dot: "✓",
    label: "Confirmed by you",
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  user_supplied: {
    dot: "➕",
    label: "Added by you",
    bg: "bg-violet-500/15",
    text: "text-violet-600 dark:text-violet-400",
  },
  inferred: {
    dot: "⚡",
    label: "Inferred by Retune",
    bg: "bg-amber-500/15",
    text: "text-amber-600 dark:text-amber-400",
  },
  default: { dot: "·", label: "Default value", bg: "bg-muted", text: "text-muted-foreground" },
  deferred: {
    dot: "·",
    label: "Skipped — finish later",
    bg: "bg-muted",
    text: "text-muted-foreground",
  },
  chip: {
    dot: "✓",
    label: "Selected by you",
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  free_text: {
    dot: "✓",
    label: "Typed by you",
    bg: "bg-emerald-500/15",
    text: "text-emerald-600 dark:text-emerald-400",
  },
};

const FALLBACK_SOURCE = SOURCE_MAP.default!;

export function ProfileSourceBadge({ source, className = "" }: ProfileSourceBadgeProps) {
  if (!source) return null;
  const meta = SOURCE_MAP[source] ?? FALLBACK_SOURCE;
  return (
    <span
      title={meta.label}
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${meta.bg} ${meta.text} ${className}`}
    >
      <span aria-hidden>{meta.dot}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}
