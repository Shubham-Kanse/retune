"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface UseUnderstandingFreshnessOptions {
  /** Revision the page was server-rendered with. */
  initialRevision: number;
  /** staleSince the page was server-rendered with. */
  initialStaleSince: string | null;
  /**
   * When true, polls every 1.5s until revision > 0 or 60s timeout (post-onboarding).
   * When false, polls every 30s while tab is visible (Gap #10 staleness detection).
   */
  waitingForFirst: boolean;
}

export function useUnderstandingFreshness(opts: UseUnderstandingFreshnessOptions) {
  const router = useRouter();
  const initialRevision = useRef(opts.initialRevision);
  const initialStaleSince = useRef(opts.initialStaleSince);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const interval = opts.waitingForFirst ? 1500 : 30_000;
    const timeout = opts.waitingForFirst ? 60_000 : Infinity;

    const timerId = setInterval(() => {
      if (Date.now() - startedAt.current > timeout) {
        clearInterval(timerId);
        return;
      }
      if (!opts.waitingForFirst && document.visibilityState !== "visible") return;

      fetch("/api/profile/understanding/status")
        .then((r) => r.json() as Promise<{ revision: number; updatedAt: string | null; staleSince: string | null }>)
        .then((status) => {
          const revisionChanged = status.revision > 0 && status.revision !== initialRevision.current;
          const staleChanged = status.staleSince !== initialStaleSince.current;
          if (revisionChanged || staleChanged) {
            clearInterval(timerId);
            router.refresh();
          }
        })
        .catch(() => { /* keep polling on network error */ });
    }, interval);

    return () => clearInterval(timerId);
  }, [opts.waitingForFirst, router]);
}
