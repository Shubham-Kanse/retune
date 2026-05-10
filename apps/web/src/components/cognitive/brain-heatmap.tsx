"use client";

/**
 * BrainHeatmap — stylised lateral-cortex map that pulses regions as the
 * cognitive cycle's specialists fire. Per PRD §16.4, every specialist
 * has a brain-region tag; the live SSE trace surfaces those tags and the
 * map lights up the corresponding `<path>`.
 *
 * Implementation notes:
 *   - The shape is a glyph (not anatomically literal) — eight named
 *     regions arranged on the cortex silhouette, with the cerebellum
 *     and brainstem rendered as supporting forms. Mobile: stacks
 *     vertically as an icon list (controlled by parent layout).
 *   - Idle: 0.18 opacity. Recently-active (within last 3 ticks): 0.6.
 *     Active: pulsing 0.4–1.0 over 600ms in the tier color.
 *   - Tier colors per PRD §16.4: free deterministic = sky, fast =
 *     amber, smart = rose, frontier = fuchsia.
 *   - prefers-reduced-motion is respected via the `rt-pulse` global
 *     animation rule already in `globals.css`.
 */

import type { BrainTraceEvent } from "@/stores/generation-stream";

const TIER_FILL: Record<string, string> = {
  free: "#0ea5e9",
  fast: "#f59e0b",
  smart: "#f43f5e",
  frontier: "#d946ef",
};

const REGION_TIER: Record<string, "free" | "fast" | "smart" | "frontier"> = {
  prefrontal_cortex: "smart",
  dlpfc: "smart",
  vlpfc: "smart",
  vmPFC: "smart",
  hippocampus: "fast",
  anterior_cingulate: "free",
  parietal_lobe: "free",
  temporal_lobe: "smart",
  basal_ganglia: "fast",
  dorsal_acc: "smart",
  default_mode_network: "smart",
  thalamus: "free",
  orbitofrontal: "free",
  amygdala: "free",
  insula: "free",
  cerebellum: "free",
  salience_network: "free",
  premotor_cortex: "free",
  right_vlpfc: "free",
};

interface RegionShape {
  id: string;
  label: string;
  d: string;
}

// Regions are stylised, not anatomical — designed to read as a brain at
// a glance without overstepping into medical accuracy. Coordinates fit
// a 320×220 viewbox; the parent component scales via CSS.
const REGIONS: RegionShape[] = [
  // Frontal lobe (prefrontal cortex)
  {
    id: "prefrontal_cortex",
    label: "Prefrontal cortex",
    d: "M 26 86 q -10 -52 36 -64 q 38 -10 64 8 l 4 26 q -42 -8 -68 12 q -22 18 -22 38 z",
  },
  // Dorsolateral PFC (lobed in upper frontal)
  {
    id: "dlpfc",
    label: "Dorsolateral PFC",
    d: "M 60 38 q 18 -12 56 -8 q 22 4 30 16 l -2 18 q -42 -10 -76 -2 z",
  },
  // Anterior cingulate (interior strip — drawn as inner curve)
  {
    id: "anterior_cingulate",
    label: "Anterior cingulate",
    d: "M 90 70 q 30 -8 56 0 l -2 14 q -28 -4 -52 4 z",
  },
  // Parietal (top-back)
  {
    id: "parietal_lobe",
    label: "Parietal",
    d: "M 138 30 q 36 -2 60 16 q 14 18 16 36 l -22 6 q -10 -28 -52 -36 z",
  },
  // Temporal (lower-side)
  {
    id: "temporal_lobe",
    label: "Temporal",
    d: "M 38 116 q -2 30 28 46 q 22 10 50 6 l 8 18 q -40 14 -76 -8 q -28 -22 -22 -56 z",
  },
  // Hippocampus (small inner)
  {
    id: "hippocampus",
    label: "Hippocampus",
    d: "M 110 124 q 14 -4 28 4 q 6 8 -2 16 q -16 8 -28 0 z",
  },
  // Amygdala / orbitofrontal (small inner-front)
  { id: "amygdala", label: "Amygdala", d: "M 80 116 q 8 -2 16 4 q 4 8 -4 12 q -12 4 -16 -6 z" },
  // Default mode network (mid-medial — drawn as cluster)
  {
    id: "default_mode_network",
    label: "Default mode",
    d: "M 162 80 q 12 -2 22 6 q 4 14 -8 18 q -16 4 -22 -8 z",
  },
  // Visual / occipital (back)
  {
    id: "occipital",
    label: "Occipital",
    d: "M 198 86 q 26 6 30 36 q -2 30 -26 38 l -10 -16 q 16 -10 14 -32 q -2 -16 -16 -22 z",
  },
  // Cerebellum (lower-back lobe)
  {
    id: "cerebellum",
    label: "Cerebellum",
    d: "M 192 144 q 30 6 28 38 q -8 18 -34 16 q -20 -2 -22 -22 q 2 -22 28 -32 z",
  },
  // Brainstem (small underneath)
  { id: "thalamus", label: "Thalamus", d: "M 130 152 q 12 -4 22 2 q 4 10 -6 14 q -16 6 -22 -4 z" },
  // Salience network (small frontal-medial)
  {
    id: "salience_network",
    label: "Salience network",
    d: "M 116 90 q 12 -2 22 4 q 2 10 -8 14 q -16 4 -20 -8 z",
  },
];

// Build a lookup so we can mark inactive regions ghosted.
const KNOWN_REGIONS = new Set(REGIONS.map((r) => r.id));

interface ActiveRegion {
  id: string;
  tier: string;
  /** seq when last fired, used to fade recent regions. */
  lastSeq: number;
}

export function BrainHeatmap({
  brainTraces,
  currentSpecialist,
}: {
  brainTraces: BrainTraceEvent[];
  currentSpecialist: string | null;
}) {
  // Compute which regions are currently active (last 3 events) and which
  // were recently active (within last 8 events). Using array index as a
  // pseudo-seq is fine — the parent appends in seq order.
  const total = brainTraces.length;
  const recentMap = new Map<string, ActiveRegion>();
  brainTraces.forEach((t, i) => {
    const region = KNOWN_REGIONS.has(t.brain_region) ? t.brain_region : "prefrontal_cortex";
    const tier = REGION_TIER[t.brain_region] ?? "smart";
    recentMap.set(region, { id: region, tier, lastSeq: i });
  });

  function regionFill(id: string): { fill: string; opacity: number; pulse: boolean } {
    const rec = recentMap.get(id);
    if (!rec) return { fill: "currentColor", opacity: 0.18, pulse: false };
    const distance = total - rec.lastSeq;
    const tierColor: string = TIER_FILL[rec.tier] ?? TIER_FILL.smart ?? "#f43f5e";
    if (distance <= 1) return { fill: tierColor, opacity: 1, pulse: true };
    if (distance <= 4) return { fill: tierColor, opacity: 0.6, pulse: false };
    return { fill: tierColor, opacity: 0.32, pulse: false };
  }

  return (
    <figure className="rt-card p-5" aria-label="Live brain heatmap">
      <header className="flex items-center justify-between">
        <h2 className="rt-label">Cortex</h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {currentSpecialist ?? "idle"}
        </span>
      </header>
      <svg
        viewBox="0 0 320 220"
        role="img"
        aria-label="Brain region activation map"
        className="mt-3 w-full h-auto text-foreground"
      >
        {/* Outer cortex silhouette — provides the brain-shaped mask */}
        <path
          d="M 30 96 q -8 -68 78 -82 q 88 -10 134 18 q 50 26 52 70 q 0 38 -28 66 q -36 36 -98 38 q -64 4 -100 -16 q -42 -22 -38 -94 z"
          fill="currentColor"
          fillOpacity={0.04}
          stroke="currentColor"
          strokeOpacity={0.18}
          strokeWidth={1}
        />
        {REGIONS.map((r) => {
          const { fill, opacity, pulse } = regionFill(r.id);
          return (
            <path
              key={r.id}
              d={r.d}
              fill={fill}
              fillOpacity={opacity}
              className={pulse ? "rt-pulse" : undefined}
              data-region={r.id}
            >
              <title>{r.label}</title>
            </path>
          );
        })}
      </svg>
      {/* Tier legend */}
      <ul className="mt-4 grid grid-cols-4 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {(["free", "fast", "smart", "frontier"] as const).map((tier) => (
          <li key={tier} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: TIER_FILL[tier] }}
            />
            {tier}
          </li>
        ))}
      </ul>
    </figure>
  );
}
