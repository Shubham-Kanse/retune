"use client";

import { type CSSProperties, useMemo } from "react";

interface ConfidenceDialProps {
  value: number;
  lower?: number;
  upper?: number;
  size?: number;
  label?: string;
  className?: string;
}

export function ConfidenceDial({
  value,
  lower,
  upper,
  size = 80,
  label,
  className,
}: ConfidenceDialProps) {
  const pct = Math.round(value * 100);
  const strokeWidth = size * 0.1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const color = useMemo(() => {
    if (value >= 0.7) return "var(--color-brand, oklch(0.72 0.15 155))";
    if (value >= 0.4) return "oklch(0.75 0.12 80)";
    return "oklch(0.65 0.18 25)";
  }, [value]);

  const dashOffset = circumference * (1 - value);

  const intervalArc = useMemo(() => {
    if (lower == null || upper == null) return null;
    const startAngle = lower * 360 - 90;
    const endAngle = upper * 360 - 90;
    return { startAngle, endAngle, sweep: endAngle - startAngle };
  }, [lower, upper]);

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          opacity={0.1}
        />
        {intervalArc && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth * 0.5}
            opacity={0.2}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - (upper! - lower!))}
            strokeLinecap="round"
            transform={`rotate(${-90 + lower! * 360} ${size / 2} ${size / 2})`}
          />
        )}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" } as CSSProperties}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ fontSize: size * 0.22 }}
      >
        <span className="font-semibold tabular-nums">{pct}%</span>
        {label && (
          <span className="text-muted-foreground" style={{ fontSize: size * 0.13 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
