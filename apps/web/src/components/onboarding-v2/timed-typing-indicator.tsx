"use client";

import { useEffect, useState } from "react";
import { TypingIndicator } from "./typing-indicator";

interface TimedTypingIndicatorProps {
  /** When true, the timer starts; when false, resets. */
  active: boolean;
  /** Optional override for the retry button click. */
  onRetry?: () => void;
}

/**
 * Plan: LOADING STATES & TRANSITIONS
 *   > 5s  → "Still working on it..." reassurance
 *   > 15s → "This is taking longer than usual — hang tight"
 *   > 30s → surface a "Try again" button (do not auto-cancel)
 *
 * Renders a typing-indicator and overlays the appropriate copy as time
 * passes. Resets to t=0 whenever `active` toggles back on.
 */
export function TimedTypingIndicator({ active, onRetry }: TimedTypingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  let message: string | null = null;
  if (elapsed >= 30) {
    message = "Still working on it — you can try again if you'd like.";
  } else if (elapsed >= 15) {
    message = "This is taking longer than usual — hang tight.";
  } else if (elapsed >= 5) {
    message = "Still working on it...";
  }

  return (
    <div className="flex flex-col gap-2">
      <TypingIndicator />
      {message && (
        <p className="text-[11px] text-stone-400" aria-live="polite">
          {message}
        </p>
      )}
      {elapsed >= 30 && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-md bg-stone-700 px-3 py-1 text-[11px] font-medium text-stone-200 transition-colors hover:bg-stone-600"
        >
          Try again
        </button>
      )}
    </div>
  );
}
