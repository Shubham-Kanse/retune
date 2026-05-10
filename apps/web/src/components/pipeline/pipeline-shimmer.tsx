"use client";

import { useEffect, useRef, useState } from "react";

/**
 * S3: Shimmer sweep component — runs on its own 80ms rAF clock, completely
 * decoupled from the parent component so the parent doesn't re-render 20×/s.
 *
 * Inspired by Claude Code's SpinnerAnimationRow pattern: child handles all
 * time-derived visuals while the parent renders structural/data-driven content.
 */

const SHIMMER_INTERVAL_MS = 80;

interface PipelineShimmerProps {
  text: string;
  /** oklch accent color — defaults to brand green */
  accentColor?: string;
  className?: string;
}

export function PipelineShimmer({
  text,
  accentColor = "oklch(65% 0.15 142)",
  className,
}: PipelineShimmerProps) {
  const [shimmerIdx, setShimmerIdx] = useState(0);
  const frameRef = useRef(0);
  const lastTickRef = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;

  // Reset shimmer position when text changes so it always starts fresh
  useEffect(() => {
    setShimmerIdx(0);
    frameRef.current = 0;
  }, [text]);

  useEffect(() => {
    let rafId: number;

    function tick(now: number) {
      if (now - lastTickRef.current >= SHIMMER_INTERVAL_MS) {
        lastTickRef.current = now;
        frameRef.current += 1;
        setShimmerIdx(frameRef.current % Math.max(textRef.current.length, 1));
      }
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const before = text.slice(0, shimmerIdx);
  const shimmerChar = text[shimmerIdx] ?? "";
  const after = text.slice(shimmerIdx + 1);

  return (
    <span className={className}>
      <span className="text-muted-foreground/60">{before}</span>
      <span style={{ color: accentColor, fontWeight: 600 }}>{shimmerChar}</span>
      <span className="text-muted-foreground/60">{after}</span>
    </span>
  );
}
