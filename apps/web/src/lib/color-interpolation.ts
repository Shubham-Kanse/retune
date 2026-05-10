/**
 * E4: RGB color interpolation — used to bleed the progress bar from neutral
 * to amber as a step stalls, matching Claude Code's SpinnerGlyph pattern.
 */

export type RGB = [number, number, number];

export const NEUTRAL_RGB: RGB = [156, 163, 175]; // gray-400
export const STALLED_RGB: RGB = [245, 158, 11]; // amber-500

export function interpolateColor(from: RGB, to: RGB, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const r = Math.round(from[0] + (to[0] - from[0]) * c);
  const g = Math.round(from[1] + (to[1] - from[1]) * c);
  const b = Math.round(from[2] + (to[2] - from[2]) * c);
  return `rgb(${r},${g},${b})`;
}

/**
 * Given milliseconds since last SSE event, return a 0→1 stall intensity.
 * Bleed starts at 10s, reaches full amber at 30s.
 */
export function stallIntensity(msSinceLastEvent: number): number {
  return Math.max(0, Math.min(1, (msSinceLastEvent - 10_000) / 20_000));
}
