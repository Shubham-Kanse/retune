/**
 * Feature flags (Charter 15 Epic 02).
 *
 * Two-tier model:
 *   1. **Static flags** — read from env vars at build time. Used for
 *      "is this feature enabled at all?" gates (e.g. ENABLE_BILLING).
 *   2. **Dynamic flags** — read from PostHog at runtime. Used for
 *      gradual rollouts, A/B tests, per-cohort enables.
 *
 * The static layer is the safety net: if PostHog is unreachable, the
 * static flag's value wins. Dynamic-only flags default to `false` when
 * PostHog is unconfigured.
 *
 * ## Convention
 *
 * Flag names are kebab-case strings. New flags MUST be declared in
 * `KNOWN_FLAGS` below so:
 *   - the type system enforces correct flag names,
 *   - we have a single grep-able list of flags in production,
 *   - PostHog and code stay in sync.
 *
 * ## Usage (server-side)
 *
 *   import { isFlagEnabled } from "@/lib/feature-flags";
 *   if (await isFlagEnabled("billing-portal-ui", { userId })) {
 *     // ...
 *   }
 *
 * ## Usage (client-side)
 *
 *   import { useFeatureFlag } from "@/hooks/use-feature-flag";
 *   const enabled = useFeatureFlag("billing-portal-ui");
 */

import { env } from "@/lib/env";

/**
 * Single source of truth for every flag in the system. New flags get
 * added here first, then referenced in code.
 *
 * For each flag:
 *   - `description`: human-readable purpose
 *   - `staticEnv`: optional env var that, if set to "1"/"true", forces
 *     enable regardless of dynamic state
 *   - `defaultEnabled`: when neither static nor dynamic resolves,
 *     should the flag be on?
 */
export const KNOWN_FLAGS = {
  "billing-portal-ui": {
    description: "Show /account billing tab with Stripe portal access",
    staticEnv: "ENABLE_BILLING",
    defaultEnabled: false,
  },
  "free-trial": {
    description: "Allow new accounts to start a 14-day free trial of Pro",
    staticEnv: "ENABLE_FREE_TRIAL",
    defaultEnabled: false,
  },
  "retune-lens-everywhere": {
    description: "Render RetuneLens panels in every section of the profile",
    defaultEnabled: true,
  },
  "ml-grpc-transport": {
    description: "Switch ML client to gRPC transport (vs HTTP)",
    staticEnv: "RETUNE_ML_TRANSPORT",
    defaultEnabled: false,
  },
  "experimental-prompts": {
    description: "Use the experimental prompt registry for specialists",
    defaultEnabled: false,
  },
} as const satisfies Record<string, FlagDefinition>;

interface FlagDefinition {
  description: string;
  staticEnv?: string;
  defaultEnabled: boolean;
}

export type FlagName = keyof typeof KNOWN_FLAGS;

interface FlagContext {
  /** Stable user identifier for cohort-targeted flags. */
  userId?: string | null;
  /** Optional cohort label for sticky targeting. */
  cohort?: string | null;
}

/**
 * Resolve a flag. Returns `true` if the flag is enabled for the given
 * user/cohort.
 *
 * Resolution order:
 *   1. If `staticEnv` is set to "1" or "true", return true.
 *   2. If PostHog is reachable, ask PostHog (server-side feature flag).
 *   3. Fall back to `defaultEnabled`.
 */
export async function isFlagEnabled(name: FlagName, context: FlagContext = {}): Promise<boolean> {
  const def: FlagDefinition = KNOWN_FLAGS[name];

  // Layer 1 — static env override.
  if (def.staticEnv) {
    const v = process.env[def.staticEnv];
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  }

  // Layer 2 — PostHog server-side flag.
  const e = env();
  if (e.NEXT_PUBLIC_POSTHOG_KEY && context.userId) {
    try {
      // Lazy import so we don't pull posthog-node into edge bundles.
      const mod = await import("posthog-node");
      const PostHog = (
        mod as {
          PostHog: new (
            key: string,
            options: Record<string, unknown>,
          ) => {
            isFeatureEnabled(
              name: string,
              distinctId: string,
              options?: { groups?: Record<string, string> },
            ): Promise<boolean | undefined>;
            shutdown(): Promise<void>;
          };
        }
      ).PostHog;
      const client = new PostHog(e.NEXT_PUBLIC_POSTHOG_KEY, {
        host: e.NEXT_PUBLIC_POSTHOG_HOST,
        flushAt: 1,
        flushInterval: 1000,
      });
      const enabled = await client.isFeatureEnabled(name, context.userId, {
        groups: context.cohort ? { cohort: context.cohort } : undefined,
      });
      return enabled ?? def.defaultEnabled;
    } catch {
      // PostHog unreachable or not installed — fall through to default.
    }
  }

  // Layer 3 — default.
  return def.defaultEnabled;
}

/**
 * Synchronous variant — uses ONLY the static layer + default. Safe to
 * call at build time and in non-async contexts.
 */
export function isFlagEnabledStatic(name: FlagName): boolean {
  const def: FlagDefinition = KNOWN_FLAGS[name];
  if (def.staticEnv) {
    const v = process.env[def.staticEnv];
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  }
  return def.defaultEnabled;
}

/**
 * List all known flags with their current default state. Useful for
 * the admin/operations dashboard.
 */
export function listFlags(): Array<{
  name: FlagName;
  description: string;
  defaultEnabled: boolean;
  staticEnv?: string;
}> {
  return (Object.keys(KNOWN_FLAGS) as FlagName[]).map((name) => {
    const def: FlagDefinition = KNOWN_FLAGS[name];
    return {
      name,
      description: def.description,
      defaultEnabled: def.defaultEnabled,
      staticEnv: def.staticEnv,
    };
  });
}
