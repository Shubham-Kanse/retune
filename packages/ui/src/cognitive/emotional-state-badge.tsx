"use client";

interface EmotionalStateBadgeProps {
  emotion: string;
  confidence: number;
  className?: string;
}

const EMOTION_LABELS: Record<string, string> = {
  neutral: "Steady",
  confident: "Confident",
  excited: "Energized",
  hopeful: "Optimistic",
  determined: "Focused",
  anxious: "Tense",
  frustrated: "Challenged",
  overwhelmed: "Stretched",
};

export function EmotionalStateBadge({ emotion, confidence, className }: EmotionalStateBadgeProps) {
  if (confidence < 0.3) return null;

  const label = EMOTION_LABELS[emotion] ?? emotion;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground border border-border ${className ?? ""}`}
      title={`Detected tone: ${label} (${Math.round(confidence * 100)}% confidence)`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
      {label}
    </span>
  );
}
