/**
 * PostHog analytics client (Charter 15 Epic 01).
 *
 * Conditional: only activates when `NEXT_PUBLIC_POSTHOG_KEY` is set.
 * EU host (`eu.posthog.com`) by default to match the Supabase EU-west-1
 * data residency.
 *
 * Wire-up:
 *   1. Create a PostHog project (EU region).
 *   2. Set `NEXT_PUBLIC_POSTHOG_KEY=phc_…`
 *      and `NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com`.
 *   3. `pnpm --filter @retune/web add posthog-js posthog-node`
 *   4. Call `getClientPostHog()` from a client component on first load
 *      and `getServerPostHog()` from API routes.
 *   5. Replace the stub `apps/web/src/lib/analytics.ts` callsites with
 *      `posthog.capture(...)`.
 *
 * Privacy:
 *   - Auto-capture is disabled by default.
 *   - `$ip` is server-set; client never sends it.
 *   - Identify uses the user's UUID, never email or PII.
 *   - DO NOT send any user-supplied resume/JD content to PostHog.
 */

const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.posthog.com";
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

export const postHogEnabled = (): boolean => Boolean(KEY);

// ─── Server-side (Node — for API routes) ────────────────────────────
let _serverClient: { capture: (e: PostHogEvent) => void; shutdown: () => Promise<void> } | null =
  null;

interface PostHogEvent {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
}

export async function getServerPostHog(): Promise<typeof _serverClient> {
  if (!KEY) return null;
  if (_serverClient) return _serverClient;
  try {
    // @ts-expect-error — optional dep
    const { PostHog } = await import("posthog-node");
    const client = new PostHog(KEY, {
      host: HOST,
      flushAt: 1,
      flushInterval: 1000,
    });
    _serverClient = client as typeof _serverClient;
    return _serverClient;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[posthog] posthog-node not installed — skipping. To enable: pnpm --filter @retune/web add posthog-node",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Capture a server-side event. No-op if PostHog isn't configured.
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const client = await getServerPostHog();
  if (!client) return;
  try {
    client.capture({ distinctId, event, properties });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[posthog] capture failed", err instanceof Error ? err.message : err);
  }
}

// ─── Client-side ────────────────────────────────────────────────────
/**
 * Initialise PostHog browser client. Call once from a top-level client
 * component (`"use client"`).
 *
 * Implementation deferred — install `posthog-js` and uncomment the
 * import block below.
 */
export function clientInitNote(): string {
  return [
    "// In a client component (e.g. apps/web/src/components/posthog-provider.tsx):",
    "// 'use client';",
    "// import posthog from 'posthog-js';",
    "// import { useEffect } from 'react';",
    "// import { env } from '@/lib/env';",
    "// const e = env();",
    "// if (e.NEXT_PUBLIC_POSTHOG_KEY) {",
    "//   posthog.init(e.NEXT_PUBLIC_POSTHOG_KEY, {",
    "//     api_host: e.NEXT_PUBLIC_POSTHOG_HOST,",
    "//     capture_pageview: false,",
    "//     autocapture: false,",
    "//     person_profiles: 'identified_only',",
    "//   });",
    "// }",
  ].join("\n");
}
