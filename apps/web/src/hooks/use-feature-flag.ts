"use client";

/**
 * Client-side hook for feature flags (Charter 15 Epic 02).
 *
 * Resolves the flag against PostHog browser-SDK state. The PostHog
 * provider must be mounted higher in the tree.
 *
 * Returns the flag's resolved value or, while PostHog is loading, the
 * flag's `defaultEnabled` value. Handles the unconfigured case
 * gracefully (always returns `defaultEnabled`).
 */

import { type FlagName, KNOWN_FLAGS } from "@/lib/feature-flags";
import * as React from "react";

interface PostHogClient {
  isFeatureEnabled: (key: string) => boolean | undefined;
  onFeatureFlags: (callback: () => void) => () => void;
  reloadFeatureFlags: () => void;
}

let _phClient: PostHogClient | null = null;

async function getClient(): Promise<PostHogClient | null> {
  if (_phClient) return _phClient;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;
  try {
    // @ts-expect-error — optional dep until installed
    const mod = await import("posthog-js");
    _phClient = mod.default as unknown as PostHogClient;
    return _phClient;
  } catch {
    return null;
  }
}

export function useFeatureFlag(name: FlagName): boolean {
  const def = KNOWN_FLAGS[name];
  const [enabled, setEnabled] = React.useState<boolean>(def.defaultEnabled);

  React.useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void getClient().then((client) => {
      if (!client || cancelled) return;
      // Initial check.
      const v = client.isFeatureEnabled(name);
      if (typeof v === "boolean") setEnabled(v);
      // Subscribe so cohort-flag changes mid-session take effect.
      unsubscribe = client.onFeatureFlags(() => {
        const next = client.isFeatureEnabled(name);
        if (typeof next === "boolean") setEnabled(next);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [name]);

  return enabled;
}
