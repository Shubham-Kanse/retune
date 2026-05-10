"use client";

interface VoiceFingerprintRadarProps {
  dimensions: Record<string, number>;
  className?: string;
}

export function VoiceFingerprintRadar({ dimensions, className }: VoiceFingerprintRadarProps) {
  const entries = Object.entries(dimensions).slice(0, 12);
  if (entries.length === 0) return null;

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const n = entries.length;

  const points = entries.map(([, value], i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = radius * value;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div className={className}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <title>Voice fingerprint radar chart</title>
        {/* Grid circles */}
        {gridLevels.map((level) => (
          <circle
            key={level}
            cx={cx}
            cy={cy}
            r={radius * level}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={0.5}
          />
        ))}

        {/* Axis lines */}
        {entries.map(([key], i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const ex = cx + radius * Math.cos(angle);
          const ey = cy + radius * Math.sin(angle);
          return (
            <line
              key={key}
              x1={cx}
              y1={cy}
              x2={ex}
              y2={ey}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={polygon}
          fill="oklch(0.72 0.15 200 / 0.15)"
          stroke="oklch(0.72 0.15 200)"
          strokeWidth={1.5}
        />

        {/* Dots */}
        {points.map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: geometric index is stable
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="oklch(0.72 0.15 200)" />
        ))}

        {/* Labels */}
        {entries.map(([key], i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const lx = cx + (radius + 16) * Math.cos(angle);
          const ly = cy + (radius + 16) * Math.sin(angle);
          return (
            <text
              key={key}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8}
              fill="currentColor"
              opacity={0.5}
            >
              {key.replace(/_/g, " ").slice(0, 10)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
