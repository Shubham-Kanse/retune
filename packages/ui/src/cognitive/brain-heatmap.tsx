"use client";

import { useState } from "react";

interface TraceEvent {
  specialist: string;
  brain_region: string;
  micro_stage: string;
  cost_usd: number;
  latency_ms: number;
}

interface BrainHeatmapProps {
  traces: TraceEvent[];
  className?: string;
}

// Top-down brain layout: cx, cy, rx, ry for each region
const REGION_LAYOUT: Record<string, { cx: number; cy: number; rx: number; ry: number }> = {
  prefrontal_cortex: { cx: 150, cy: 30, rx: 55, ry: 18 },
  anterior_cingulate: { cx: 150, cy: 55, rx: 22, ry: 14 },
  dorsal_acc: { cx: 150, cy: 75, rx: 18, ry: 12 },
  dlpfc: { cx: 85, cy: 45, rx: 28, ry: 16 },
  left_dlpfc: { cx: 62, cy: 65, rx: 22, ry: 13 },
  vlpfc: { cx: 215, cy: 45, rx: 28, ry: 16 },
  right_vlpfc: { cx: 238, cy: 65, rx: 22, ry: 13 },
  orbitofrontal: { cx: 150, cy: 48, rx: 20, ry: 10 },
  vmPFC: { cx: 150, cy: 90, rx: 16, ry: 10 },
  parietal_lobe: { cx: 150, cy: 115, rx: 45, ry: 20 },
  temporal_lobe: { cx: 68, cy: 115, rx: 32, ry: 18 },
  insula: { cx: 90, cy: 100, rx: 16, ry: 11 },
  occipital_lobe: { cx: 150, cy: 168, rx: 40, ry: 18 },
  amygdala: { cx: 85, cy: 135, rx: 14, ry: 10 },
  hippocampus: { cx: 215, cy: 135, rx: 18, ry: 10 },
  thalamus: { cx: 150, cy: 130, rx: 18, ry: 12 },
  basal_ganglia: { cx: 118, cy: 120, rx: 14, ry: 10 },
  cerebellum: { cx: 150, cy: 178, rx: 38, ry: 14 },
  brainstem: { cx: 150, cy: 188, rx: 10, ry: 8 },
  locus_coeruleus: { cx: 155, cy: 185, rx: 8, ry: 6 },
  default_mode_network: { cx: 232, cy: 115, rx: 28, ry: 18 },
  salience_network: { cx: 110, cy: 82, rx: 20, ry: 12 },
};

function getColor(hits: number): string {
  if (hits === 0) return "oklch(0.3 0 0)";
  if (hits <= 2) return "oklch(0.75 0.15 65)"; // amber
  if (hits <= 5) return "oklch(0.65 0.18 45)"; // orange
  return "oklch(0.55 0.2 250)"; // brand blue
}

function getStroke(hits: number): string {
  if (hits === 0) return "oklch(0.4 0 0)";
  if (hits <= 2) return "oklch(0.7 0.16 65)";
  if (hits <= 5) return "oklch(0.6 0.2 45)";
  return "oklch(0.5 0.22 250)";
}

export function BrainHeatmap({ traces, className }: BrainHeatmapProps) {
  const [tooltip, setTooltip] = useState<{
    region: string;
    hits: number;
    cost: number;
    x: number;
    y: number;
  } | null>(null);

  // Aggregate hits and cost per region
  const regionStats = traces.reduce<Record<string, { hits: number; cost: number }>>((acc, t) => {
    const key = t.brain_region;
    if (!acc[key]) acc[key] = { hits: 0, cost: 0 };
    acc[key].hits += 1;
    acc[key].cost += t.cost_usd;
    return acc;
  }, {});

  const allRegions = Object.keys(REGION_LAYOUT);

  return (
    <div className={`relative inline-block ${className ?? ""}`}>
      <svg
        viewBox="0 0 300 210"
        width="300"
        height="210"
        aria-label="Pipeline activity heatmap"
        style={{ display: "block" }}
      >
        {/* Outer brain outline */}
        <ellipse
          cx="150"
          cy="105"
          rx="130"
          ry="98"
          fill="none"
          stroke="oklch(0.35 0 0)"
          strokeWidth="1.5"
        />

        {allRegions.map((region) => {
          const pos = REGION_LAYOUT[region];
          if (!pos) return null;
          const stats = regionStats[region] ?? { hits: 0, cost: 0 };
          return (
            <ellipse
              key={region}
              cx={pos.cx}
              cy={pos.cy}
              rx={pos.rx}
              ry={pos.ry}
              fill={getColor(stats.hits)}
              stroke={getStroke(stats.hits)}
              strokeWidth="0.8"
              style={{ cursor: stats.hits > 0 ? "pointer" : "default", transition: "fill 0.2s" }}
              onMouseEnter={(e) => {
                const svg = (e.target as SVGElement).closest("svg");
                const rect = svg?.getBoundingClientRect();
                const el = e.currentTarget.getBoundingClientRect();
                setTooltip({
                  region,
                  hits: stats.hits,
                  cost: stats.cost,
                  x: el.left - (rect?.left ?? 0) + el.width / 2,
                  y: el.top - (rect?.top ?? 0) - 8,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {/* Region labels for active regions only */}
        {allRegions
          .filter((r) => (regionStats[r]?.hits ?? 0) > 0)
          .map((region) => {
            const pos = REGION_LAYOUT[region];
            if (!pos) return null;
            const label = region.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <text
                key={`label-${region}`}
                x={pos.cx}
                y={pos.cy + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="5"
                fill="oklch(0.95 0 0)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {label.length > 12 ? label.slice(0, 11) + "…" : label}
              </text>
            );
          })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none border border-border bg-background px-2.5 py-2 text-xs shadow-md"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, -100%)",
            minWidth: 140,
          }}
        >
          <p className="font-medium text-foreground mb-1">{tooltip.region.replace(/_/g, " ")}</p>
          <p className="text-muted-foreground">
            Activations: <span className="tabular-nums text-foreground">{tooltip.hits}</span>
          </p>
          <p className="text-muted-foreground">
            Cost: <span className="tabular-nums text-foreground">${tooltip.cost.toFixed(5)}</span>
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3" style={{ background: "oklch(0.3 0 0)" }} />
          Unused
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3" style={{ background: "oklch(0.75 0.15 65)" }} />
          1–2
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3" style={{ background: "oklch(0.65 0.18 45)" }} />
          3–5
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3" style={{ background: "oklch(0.55 0.2 250)" }} />
          6+
        </span>
      </div>
    </div>
  );
}
