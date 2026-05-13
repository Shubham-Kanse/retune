"use client";

import { cn } from "@/lib/utils";

interface ColorOrbProps {
  dimension?: string;
  className?: string;
  tones?: { base?: string; accent1?: string; accent2?: string; accent3?: string };
  spinDuration?: number;
}

export function ColorOrb({ dimension = "32px", className, tones, spinDuration = 20 }: ColorOrbProps) {
  const palette = {
    base: "oklch(95% 0.02 264.695)",
    accent1: "oklch(75% 0.15 350)",
    accent2: "oklch(80% 0.12 200)",
    accent3: "oklch(78% 0.14 280)",
    ...tones,
  };

  const dim = parseInt(dimension.replace("px", ""), 10);
  const blur = dim < 50 ? Math.max(dim * 0.008, 1) : Math.max(dim * 0.015, 4);
  const contrast = dim < 50 ? Math.max(dim * 0.004, 1.2) : Math.max(dim * 0.008, 1.5);
  const dot = dim < 50 ? Math.max(dim * 0.004, 0.05) : Math.max(dim * 0.008, 0.1);
  const shadow = dim < 50 ? Math.max(dim * 0.004, 0.5) : Math.max(dim * 0.008, 2);
  const mask = dim < 30 ? "0%" : dim < 50 ? "5%" : dim < 100 ? "15%" : "25%";
  const adjustedContrast = dim < 30 ? 1.1 : dim < 50 ? Math.max(contrast * 1.2, 1.3) : contrast;

  return (
    <div
      className={cn("color-orb shrink-0", className)}
      style={{
        width: dimension,
        height: dimension,
        "--base": palette.base,
        "--accent1": palette.accent1,
        "--accent2": palette.accent2,
        "--accent3": palette.accent3,
        "--spin-duration": `${spinDuration}s`,
        "--blur": `${blur}px`,
        "--contrast": adjustedContrast,
        "--dot": `${dot}px`,
        "--shadow": `${shadow}px`,
        "--mask": mask,
      } as React.CSSProperties}
    >
      <style jsx>{`
        @property --angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        .color-orb {
          display: grid;
          grid-template-areas: "stack";
          overflow: hidden;
          border-radius: 50%;
          position: relative;
        }
        .color-orb::before,
        .color-orb::after {
          content: "";
          display: block;
          grid-area: stack;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          transform: translateZ(0);
        }
        .color-orb::before {
          background:
            conic-gradient(from calc(var(--angle) * 2) at 25% 70%, var(--accent3), transparent 20% 80%, var(--accent3)),
            conic-gradient(from calc(var(--angle) * 2) at 45% 75%, var(--accent2), transparent 30% 60%, var(--accent2)),
            conic-gradient(from calc(var(--angle) * -3) at 80% 20%, var(--accent1), transparent 40% 60%, var(--accent1)),
            conic-gradient(from calc(var(--angle) * 2) at 15% 5%, var(--accent2), transparent 10% 90%, var(--accent2)),
            conic-gradient(from calc(var(--angle) * 1) at 20% 80%, var(--accent1), transparent 10% 90%, var(--accent1)),
            conic-gradient(from calc(var(--angle) * -2) at 85% 10%, var(--accent3), transparent 20% 80%, var(--accent3));
          box-shadow: inset var(--base) 0 0 var(--shadow) calc(var(--shadow) * 0.2);
          filter: blur(var(--blur)) contrast(var(--contrast));
          animation: color-orb-spin var(--spin-duration) linear infinite;
        }
        .color-orb::after {
          background-image: radial-gradient(circle at center, var(--base) var(--dot), transparent var(--dot));
          background-size: calc(var(--dot) * 2) calc(var(--dot) * 2);
          backdrop-filter: blur(calc(var(--blur) * 2)) contrast(calc(var(--contrast) * 2));
          mix-blend-mode: overlay;
        }
        .color-orb[style*="--mask: 0%"]::after { mask-image: none; }
        .color-orb:not([style*="--mask: 0%"])::after { mask-image: radial-gradient(black var(--mask), transparent 75%); }
        @keyframes color-orb-spin { to { --angle: 360deg; } }
        @media (prefers-reduced-motion: reduce) { .color-orb::before { animation: none; } }
      `}</style>
    </div>
  );
}
