"use client";

import { cn } from "@/lib/utils";

interface ShineBorderProps {
  borderWidth?: number;
  duration?: number;
  color?: string[];
  className?: string;
  children: React.ReactNode;
}

export function ShineBorder({
  borderWidth = 3,
  duration = 3,
  color = ["#2d8a5e", "#00d4d4", "#2d8a5e"],
  className,
  children,
}: ShineBorderProps) {
  return (
    <div className={cn("relative rounded-3xl", className)}>
      <div
        aria-hidden
        className="shine-border-glow absolute inset-0 rounded-3xl"
        style={{
          padding: `${borderWidth}px`,
          background: `conic-gradient(from var(--shine-angle, 0deg), ${color.join(", ")}, ${color[0]})`,
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          animationDuration: `${duration}s`,
        }}
      />
      {children}
    </div>
  );
}
