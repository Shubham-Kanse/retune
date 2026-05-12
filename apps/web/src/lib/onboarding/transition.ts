"use client";

// ─── Timing constants (tune here, nowhere else) ───────────────────────────────
export const TRANSITION_INTRO_STEP_MS = [800, 2000, 3400] as const;
export const TRANSITION_INTRO_COMPLETE_MS = 5200;
export const TRANSITION_PULSE_MS = 400;
export const TRANSITION_BLOOM_MS = 500;
export const TRANSITION_STAGGER_MS = 80;
export const TRANSITION_REDUCED_MS = 200;

// ─── useReducedMotion ─────────────────────────────────────────────────────────
import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
