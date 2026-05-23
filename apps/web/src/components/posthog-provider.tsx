"use client";

/**
 * PostHog client-side provider (Charter 15 Epic 01).
 *
 * Wires PostHog browser SDK into the React tree. No-op when
 * NEXT_PUBLIC_POSTHOG_KEY is unset (dev mode without analytics).
 *
 * Privacy:
 *   - Auto-capture is disabled. Only events the app explicitly fires
 *     are sent.
 *   - Pageview capture is disabled and replaced by a manual
 *     `posthog.capture('$pageview')` from the App-Router pathname
 *     listener so we don't leak query params with PII.
 *   - `person_profiles: 'identified_only'` — anonymous traffic is
 *     bucketed under a single anonymous ID rather than fanning out.
 *   - `respect_dnt` honours the browser's Do-Not-Track preference.
 *
 * Usage:
 *
 *   // In apps/web/src/app/layout.tsx (root layout, server component):
 *   import { PostHogProvider } from "@/components/posthog-provider";
 *   <PostHogProvider>{children}</PostHogProvider>
 */

import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";

type PostHogModule = {
  init: (key: string, options: Record<string, unknown>) => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
};

let _posthog: PostHogModule | null = null;

async function loadPostHog(): Promise<PostHogModule | null> {
  if (_posthog) return _posthog;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  try {
    const mod = await import("posthog-js");
    const ph = mod.default as unknown as PostHogModule;
    ph.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com",
      capture_pageview: false,
      autocapture: false,
      person_profiles: "identified_only",
      respect_dnt: true,
      disable_session_recording: true,
      sanitize_properties: (props: Record<string, unknown>) => {
        // Defensive: strip any property whose key looks credential-bearing.
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(props ?? {})) {
          if (/password|token|secret|api[_-]?key/i.test(k)) continue;
          out[k] = v;
        }
        return out;
      },
    });
    _posthog = ph;
    return ph;
  } catch (err) {
    // posthog-js not installed — leave analytics disabled.
    // eslint-disable-next-line no-console
    console.warn(
      "[posthog] posthog-js not installed — skipping. Run: pnpm --filter @retune/web add posthog-js",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialised = React.useRef(false);

  // Lazy initialise once on mount.
  React.useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadPostHog();
  }, []);

  // Manual pageview tracking — App Router doesn't fire route-change
  // events the same way Pages Router did.
  React.useEffect(() => {
    if (!pathname) return;
    void loadPostHog().then((ph) => {
      if (!ph) return;
      // Strip any query params that might carry PII (we never want
      // ?email= or ?token= showing up in PostHog).
      const safeQuery = stripPiiFromQuery(searchParams);
      ph.capture("$pageview", {
        $pathname: pathname,
        ...(safeQuery ? { $search: safeQuery } : {}),
      });
    });
  }, [pathname, searchParams]);

  return <>{children}</>;
}

/**
 * Strip PII-bearing query params before sending to PostHog. Allow only
 * a known-safe list (utm_*, ref).
 */
function stripPiiFromQuery(params: ReturnType<typeof useSearchParams>): string | null {
  if (!params) return null;
  const out = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (/^utm_/i.test(k) || k === "ref" || k === "source") {
      out.set(k, v);
    }
  }
  const s = out.toString();
  return s ? `?${s}` : null;
}

/**
 * Identify the current user. Call from a client component once the
 * Supabase session is known. Uses the Supabase user UUID — never email
 * or any PII as the distinct id.
 */
export async function identifyUser(
  userId: string,
  traits?: Record<string, unknown>,
): Promise<void> {
  const ph = await loadPostHog();
  if (!ph) return;
  // Drop any traits that look credential-bearing.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(traits ?? {})) {
    if (/password|token|secret|api[_-]?key|email|phone/i.test(k)) continue;
    safe[k] = v;
  }
  ph.identify(userId, safe);
}

/**
 * Capture a custom event. No-op when PostHog is not configured.
 */
export async function captureEvent(
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const ph = await loadPostHog();
  if (!ph) return;
  ph.capture(event, properties);
}

/**
 * Reset the PostHog client on logout so the next user gets a fresh
 * anonymous session.
 */
export async function resetAnalytics(): Promise<void> {
  const ph = await loadPostHog();
  if (!ph) return;
  ph.reset();
}
