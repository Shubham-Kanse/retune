"use client";

import { cn } from "@/lib/utils";

export interface ColorOrbProps {
  /** Pixel diameter. Defaults to 20. */
  size?: number;
  className?: string;
  tones?: {
    base?: string;
    accent1?: string;
    accent2?: string;
    accent3?: string;
  };
  /** Spin duration in seconds. Defaults to 20. */
  spinDuration?: number;
}

export function ColorOrb({ size = 20, className, tones, spinDuration = 20 }: ColorOrbProps) {
  const dim = size;
  const blur = dim < 50 ? Math.max(dim * 0.008, 1) : Math.max(dim * 0.015, 4);
  const contrast = dim < 30 ? 1.1 : dim < 50 ? Math.max(dim * 0.004 * 1.2, 1.3) : Math.max(dim * 0.008, 1.5);
  const dot = dim < 50 ? Math.max(dim * 0.004, 0.05) : Math.max(dim * 0.008, 0.1);
  const mask = dim < 30 ? "0%" : dim < 50 ? "5%" : dim < 100 ? "15%" : "25%";

  return (
    <span
      role="presentation"
      aria-hidden
      className={cn("color-orb", className)}
      style={
        {
          width: dim,
          height: dim,
          "--orb-base": tones?.base ?? "oklch(95% 0.02 264.695)",
          "--orb-accent1": tones?.accent1 ?? "oklch(75% 0.15 350)",
          "--orb-accent2": tones?.accent2 ?? "oklch(80% 0.12 200)",
          "--orb-accent3": tones?.accent3 ?? "oklch(78% 0.14 280)",
          "--orb-spin-duration": `${spinDuration}s`,
          "--orb-blur": `${blur}px`,
          "--orb-contrast": contrast,
          "--orb-dot": `${dot}px`,
          "--orb-mask": mask,
        } as React.CSSProperties
      }
    />
  );
}
