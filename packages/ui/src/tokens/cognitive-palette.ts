/**
 * Cognitive-state color palette for pipeline visualization.
 *
 * These tokens map pipeline states to colors. They're designed to
 * work alongside the existing oklch-based design system in globals.css.
 * All colors defined in oklch for perceptual uniformity.
 */

export const cognitiveColors = {
  /** Step/goal is waiting to execute */
  pending: "oklch(0.65 0.02 250)",
  /** Currently executing */
  active: "oklch(0.75 0.15 200)",
  /** Successfully completed */
  satisfied: "oklch(0.72 0.15 155)",
  /** Abandoned or skipped */
  abandoned: "oklch(0.55 0.03 30)",
  /** Error or blocked */
  blocked: "oklch(0.65 0.2 25)",
  /** Conflict detected */
  conflict: "oklch(0.7 0.18 50)",
  /** High confidence */
  confidence_high: "oklch(0.72 0.15 155)",
  /** Medium confidence */
  confidence_mid: "oklch(0.75 0.12 80)",
  /** Low confidence */
  confidence_low: "oklch(0.65 0.18 25)",
  /** Cost indicator */
  cost: "oklch(0.7 0.1 280)",
  /** Narrative/explanation text */
  narrative: "oklch(0.6 0.02 260)",
} as const;

export const emotionColors: Record<string, string> = {
  neutral: "oklch(0.6 0.02 250)",
  confident: "oklch(0.72 0.12 155)",
  excited: "oklch(0.75 0.15 90)",
  hopeful: "oklch(0.7 0.1 140)",
  determined: "oklch(0.68 0.12 200)",
  anxious: "oklch(0.65 0.15 50)",
  frustrated: "oklch(0.6 0.18 25)",
  overwhelmed: "oklch(0.55 0.12 300)",
};

/**
 * Tailwind-compatible theme extension for the cognitive palette.
 * Import and spread into your tailwind config's `extend.colors`.
 */
export const tailwindCognitiveColors = {
  cognitive: {
    pending: cognitiveColors.pending,
    active: cognitiveColors.active,
    satisfied: cognitiveColors.satisfied,
    abandoned: cognitiveColors.abandoned,
    blocked: cognitiveColors.blocked,
    conflict: cognitiveColors.conflict,
  },
  confidence: {
    high: cognitiveColors.confidence_high,
    mid: cognitiveColors.confidence_mid,
    low: cognitiveColors.confidence_low,
  },
};
