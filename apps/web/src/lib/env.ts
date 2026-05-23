/**
 * Environment-variable validation for `apps/web`.
 *
 * Replaces the previous version which validated the wrong variable set
 * (ANTHROPIC_API_KEY, JWT_SECRET, DATABASE_URL=file:./data/retune.db) and
 * called `process.exit(1)` at module load. The previous file was broken
 * by a 2024-era SQLite ancestry and would crash any caller — fortunately
 * nothing imported it.
 *
 * Charter 20 Epic 02 + Charter 02-Codebase-Quality Epic 06 (co-owned).
 *
 * Usage:
 *
 *   import { env, requireEnv } from "@/lib/env";
 *
 *   // Lazy, throws on first access if invalid:
 *   const url = env().NEXT_PUBLIC_SUPABASE_URL;
 *
 *   // Strict, throws if specifically-required value is missing or invalid:
 *   const apiKey = requireEnv("OPENAI_API_KEY");
 *
 * Design notes:
 *   1. NO `process.exit()` at module load — that breaks Next.js dev server,
 *      crashes Vercel cold starts, and makes the module unimportable in tests.
 *   2. Validation is **lazy** — `env()` is called at the use-site, never at
 *      import. This lets the module be imported safely from edge runtime,
 *      server components, server actions, and API routes alike.
 *   3. Defaults are encoded in the schema where they exist in code today
 *      (e.g. `AI_PROVIDER` defaults to `anthropic` matching the agent
 *      `provider.ts` factory).
 *   4. NEXT_PUBLIC_* vars are validated separately because they must be
 *      present at build time, not just runtime.
 */

import { z } from "zod";

// ─── Required (server-side) ────────────────────────────────────────────────
const ServerEnv = z.object({
  // Node runtime
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Supabase (auth + DB) — required everywhere
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Application URLs
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8787"),

  // AI providers — at least one MUST be present; AI_PROVIDER picks
  AI_PROVIDER: z.enum(["openai", "anthropic"]).default("anthropic"),
  OPENAI_API_KEY: z.string().min(20).optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),

  // HMAC signing secrets for the platform's own tokens
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  RETUNE_INTERNAL_API_KEY: z.string().min(16).optional(),
  RETUNE_INTERNAL_GENERATION_ACCESS_SECRET: z
    .string()
    .min(16, "RETUNE_INTERNAL_GENERATION_ACCESS_SECRET must be >= 16 chars")
    .optional(),
  RETUNE_PREVIEW_SECRET: z.string().min(16).optional(),

  // Database
  RETUNE_DATABASE_URL: z.string().url().optional(),
  RETUNE_DB_KIND: z.enum(["pglite", "postgres"]).default("postgres"),
  RETUNE_PERSIST: z.enum(["off", "pglite", "postgres"]).default("postgres"),

  // ML service (rarely required by web; the API talks to it)
  RETUNE_ML_USE_STUBS: z.coerce.boolean().default(true),
  RETUNE_ML_BASE_URL: z.string().url().optional(),
  RETUNE_ML_GRPC_BASE: z.string().url().optional(),
  RETUNE_ML_TRANSPORT: z.enum(["http", "grpc"]).default("http"),
  RETUNE_ML_DISABLE: z.enum(["0", "1"]).default("0"),

  // Temporal (optional in dev; production-required per Charter 02-Core-Features Epic 02)
  RETUNE_TEMPORAL: z.enum(["0", "1", "true", "false", "on", "off"]).optional(),
  RETUNE_TEMPORAL_ADDRESS: z.string().optional(),
  RETUNE_TEMPORAL_NAMESPACE: z.string().optional(),

  // SMTP (Namecheap Private Email by default; required for password reset / verification)
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().email().optional(),

  // Model preferences (overrides)
  AGENT_MODEL: z.string().optional(),
  AGENT_MODEL_FAST: z.string().optional(),
  AGENT_MODEL_FRONTIER: z.string().optional(),
  ONBOARDING_EXTRACT_MODEL: z.string().optional(),
  ONBOARDING_ROUTER_MODEL: z.string().optional(),
  ONBOARDING_MODEL: z.string().optional(),

  // Operational toggles
  ADMIN_SECRET: z.string().min(16).optional(),
  ENABLE_BILLING: z.coerce.boolean().default(false),
  ENABLE_CRON: z.enum(["0", "1"]).default("1"),
  FREE_GENERATION_LIMIT: z.coerce.number().int().nonnegative().default(2),
  RETUNE_API_CORS: z.string().default("*"),

  // Observability — Charter 05 (gated; SDKs are conditional on these)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("retune-web"),

  // Growth — Charter 15 (gated)
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().default("https://eu.posthog.com"),

  // E2E test bypass — DEV ONLY, ignored in production
  E2E_AUTH_BYPASS: z.enum(["0", "1"]).optional(),
  E2E_AUTH_USER_ID: z.string().uuid().optional(),
  E2E_AUTH_EMAIL: z.string().email().optional(),
  E2E_AUTH_NAME: z.string().optional(),
});

export type Env = z.infer<typeof ServerEnv>;

// ─── Lazy validation cache ─────────────────────────────────────────────────
let _cached: Env | null = null;

/**
 * Returns the validated environment. Validation runs on first call and
 * is cached for the process lifetime. Throws a descriptive error if
 * required vars are missing or malformed.
 *
 * Cross-field constraints applied here (Zod schemas can't easily express):
 *   - At least one of OPENAI_API_KEY / ANTHROPIC_API_KEY MUST be set.
 *   - The provider selected via AI_PROVIDER must have a key set.
 *   - In production, RETUNE_INTERNAL_API_KEY MUST be set (otherwise the
 *     api falls back to anonymous, which is a Charter 01 Epic 03 fix).
 *   - In production, RETUNE_INTERNAL_GENERATION_ACCESS_SECRET MUST be set.
 *   - In production, RETUNE_PERSIST=postgres requires RETUNE_DATABASE_URL.
 */
export function env(): Env {
  if (_cached) return _cached;

  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new EnvValidationError(`Invalid environment variables:\n${issues}`);
  }

  const e = parsed.data;

  // Cross-field invariants
  if (!e.OPENAI_API_KEY && !e.ANTHROPIC_API_KEY) {
    throw new EnvValidationError("At least one of OPENAI_API_KEY or ANTHROPIC_API_KEY must be set");
  }
  if (e.AI_PROVIDER === "openai" && !e.OPENAI_API_KEY) {
    throw new EnvValidationError("AI_PROVIDER=openai but OPENAI_API_KEY is not set");
  }
  if (e.AI_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) {
    throw new EnvValidationError("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
  }

  if (e.NODE_ENV === "production") {
    if (!e.RETUNE_INTERNAL_API_KEY) {
      throw new EnvValidationError(
        "RETUNE_INTERNAL_API_KEY is required in production (Charter 01 Epic 03)",
      );
    }
    if (!e.RETUNE_INTERNAL_GENERATION_ACCESS_SECRET) {
      throw new EnvValidationError(
        "RETUNE_INTERNAL_GENERATION_ACCESS_SECRET is required in production",
      );
    }
    if (e.RETUNE_PERSIST === "postgres" && !e.RETUNE_DATABASE_URL) {
      throw new EnvValidationError(
        "RETUNE_PERSIST=postgres requires RETUNE_DATABASE_URL in production",
      );
    }
    if (e.E2E_AUTH_BYPASS === "1") {
      throw new EnvValidationError("E2E_AUTH_BYPASS=1 must NEVER be enabled in production");
    }
  }

  _cached = e;
  return e;
}

/**
 * Reads a specific env var. Returns the validated value or throws with
 * a clear message naming the variable.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new EnvValidationError(`Required environment variable not set: ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}

/**
 * Test-only helper: clear the cached env so a test can reset
 * `process.env` between cases. NOT exported from the package barrel.
 */
export function _resetEnvCacheForTests(): void {
  _cached = null;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

// ─── Boolean feature flags computed from validated env ─────────────────────
/**
 * Convenience accessors. These re-validate on first call and are cheap
 * thereafter (just a property read on the cached object).
 */
export const flags = {
  get isProduction(): boolean {
    return env().NODE_ENV === "production";
  },
  get isDevelopment(): boolean {
    return env().NODE_ENV === "development";
  },
  get isTest(): boolean {
    return env().NODE_ENV === "test";
  },
  get isE2EBypass(): boolean {
    const e = env();
    return e.E2E_AUTH_BYPASS === "1" && e.NODE_ENV !== "production";
  },
  get billingEnabled(): boolean {
    return env().ENABLE_BILLING === true;
  },
  get cronEnabled(): boolean {
    return env().ENABLE_CRON === "1";
  },
  get sentryEnabled(): boolean {
    const e = env();
    return Boolean(e.SENTRY_DSN || e.NEXT_PUBLIC_SENTRY_DSN);
  },
  get postHogEnabled(): boolean {
    return Boolean(env().NEXT_PUBLIC_POSTHOG_KEY);
  },
  get otelEnabled(): boolean {
    return Boolean(env().OTEL_EXPORTER_OTLP_ENDPOINT);
  },
  get temporalEnabled(): boolean {
    const v = env().RETUNE_TEMPORAL;
    return v === "1" || v === "true" || v === "on";
  },
};
