"use client";

import type { ReactNode } from "react";

interface GlowingShadowProps {
  children: ReactNode;
  className?: string;
}

/**
 * Animated rainbow border. Active in dark mode only; in light mode falls back
 * to a standard theme border.
 */
export function GlowingShadow({ children, className = "" }: GlowingShadowProps) {
  return (
    <>
      <style jsx>{`
        @property --hue {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --bg-x {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --bg-y {
          syntax: "<number>";
          inherits: true;
          initial-value: 0;
        }
        @property --bg-size {
          syntax: "<number>";
          inherits: true;
          initial-value: 1;
        }

        .glow-container {
          --card-radius: 1.5rem;
          --border-width: 2px;
          --bg-size: 1;
          --hue: 0;
          --animation-speed: 10s;
          --interaction-speed: 0.55s;

          position: relative;
          width: 100%;
          border-radius: var(--card-radius);
        }

        .glow-content {
          position: relative;
          width: 100%;
          border-radius: calc(var(--card-radius) - var(--border-width));
          z-index: 1;
        }

        /* ===== LIGHT MODE: plain border ===== */
        .glow-content {
          border: 1px solid var(--border, hsl(240 5.9% 90%));
          background: transparent;
        }
        .glow-content:before {
          display: none;
        }

        /* ===== DARK MODE: animated gradient ring ===== */
        :global(.dark) .glow-content {
          border: none;
          background: var(--card, hsl(50 2% 9%));
        }

        :global(.dark) .glow-content:before {
          content: "";
          display: block;
          position: absolute;
          inset: calc(var(--border-width) * -1);
          border-radius: var(--card-radius);
          padding: var(--border-width);
          z-index: -1;
          background: radial-gradient(
            30% 30% at calc(var(--bg-x) * 1%) calc(var(--bg-y) * 1%),
            hsl(calc(var(--hue) * 1deg) 90% 75%) calc(0% * var(--bg-size)),
            hsl(calc(var(--hue) * 1deg) 80% 60%) calc(20% * var(--bg-size)),
            hsl(calc(var(--hue) * 1deg) 70% 45%) calc(40% * var(--bg-size)),
            hsl(240 3.7% 15.9%) 100%
          );
          mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          animation:
            hue-animation var(--animation-speed) linear infinite,
            rotate-bg var(--animation-speed) linear infinite;
          transition: --bg-size var(--interaction-speed) ease;
        }

        /* Hover: fill the ring uniformly */
        :global(.dark) .glow-container:hover .glow-content:before {
          --bg-size: 15;
          animation-play-state: paused;
        }

        @keyframes rotate-bg {
          0% { --bg-x: 0; --bg-y: 0; }
          25% { --bg-x: 100; --bg-y: 0; }
          50% { --bg-x: 100; --bg-y: 100; }
          75% { --bg-x: 0; --bg-y: 100; }
          100% { --bg-x: 0; --bg-y: 0; }
        }

        @keyframes hue-animation {
          0% { --hue: 0; }
          100% { --hue: 360; }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.dark) .glow-content:before {
            animation: none;
          }
        }
      `}</style>

      <div className={`glow-container ${className}`}>
        <div className="glow-content">{children}</div>
      </div>
    </>
  );
}
