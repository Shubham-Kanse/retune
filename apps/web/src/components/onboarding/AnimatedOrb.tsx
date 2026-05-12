"use client";

import type React from "react";

export function AnimatedOrb({
  className,
  variant = "default",
  size = 32,
}: { className?: string; variant?: "default" | "red"; size?: number }) {
  const colors =
    variant === "red"
      ? { bg: "#fef2f2", circle1: "#ef4444", circle2: "#f87171", circle3: "#dc2626", circle4: "#fca5a5", circle5: "#fb7185" }
      : { bg: "#dbeafe", circle1: "#2563eb", circle2: "#1d4ed8", circle3: "#0ea5e9", circle4: "#3b82f6", circle5: "#06b6d4" };

  const blurAmount = Math.max(6, size * 0.15);
  const c1 = size * 0.45, c2 = size * 0.35, c3 = size * 0.5, c4 = size * 0.25, c5 = size * 0.3;

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className ?? ""}`}
      style={{ width: size, height: size, backgroundColor: colors.bg, animation: "orb-hue-rotate 8s linear infinite", boxShadow: "rgba(17,12,46,0.15) 0px 48px 100px 0px" }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 flex items-center justify-center" style={{ "--orb-blur": `${blurAmount}px`, animation: "orb-hue-rotate-blur 6s linear infinite reverse" } as React.CSSProperties}>
        <div className="orb-circle-1 absolute rounded-full" style={{ width: c1, height: c1, opacity: 0.9, backgroundColor: colors.circle1 }} />
        <div className="orb-circle-2 absolute rounded-full" style={{ width: c2, height: c2, opacity: 0.85, backgroundColor: colors.circle2 }} />
        <div className="orb-circle-3 absolute rounded-full" style={{ width: c3, height: c3, opacity: 0.9, backgroundColor: colors.circle3 }} />
        <div className="orb-circle-4 absolute rounded-full" style={{ width: c4, height: c4, opacity: 0.8, backgroundColor: colors.circle4 }} />
        <div className="orb-circle-5 absolute rounded-full" style={{ width: c5, height: c5, opacity: 0.85, backgroundColor: colors.circle5 }} />
      </div>
      <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, transparent 100%)" }} />
    </div>
  );
}
