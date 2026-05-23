/**
 * Charter 20 Epic 02 + Charter 02-CodeQ Epic 06 — env validation tests.
 *
 * Covers:
 *   - happy path with full required set
 *   - missing required vars
 *   - cross-field invariants (provider key, production hard-requires)
 *   - lazy validation + cache reset between tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvValidationError, _resetEnvCacheForTests, env, flags, requireEnv } from "../env";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(values: Record<string, string | undefined>): void {
  // Wipe all keys we ever touch in tests, then apply the new values.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("RETUNE_") || k.startsWith("NEXT_PUBLIC_")) {
      (process.env as Record<string, string | undefined>)[k] = undefined;
    }
  }
  (process.env as Record<string, string | undefined>).OPENAI_API_KEY = undefined;
  (process.env as Record<string, string | undefined>).ANTHROPIC_API_KEY = undefined;
  (process.env as Record<string, string | undefined>).JWT_SECRET = undefined;
  (process.env as Record<string, string | undefined>).SUPABASE_SERVICE_ROLE_KEY = undefined;
  (process.env as Record<string, string | undefined>).E2E_AUTH_BYPASS = undefined;
  (process.env as Record<string, string | undefined>).AI_PROVIDER = undefined;
  (process.env as Record<string, string | undefined>).NODE_ENV = undefined;
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) {
      (process.env as Record<string, string | undefined>)[k] = undefined;
    } else process.env[k] = v;
  }
  _resetEnvCacheForTests();
}

const VALID_BASE = {
  NODE_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-at-least-twenty-chars",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-at-least-twenty-chars",
  JWT_SECRET: "this-is-a-thirty-two-character-secret-x",
  ANTHROPIC_API_KEY: "sk-ant-test-key-at-least-twenty-chars",
};

beforeEach(() => {
  resetEnv(VALID_BASE);
});

afterEach(() => {
  // Restore the original env so other tests aren't affected.
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) {
      (process.env as Record<string, string | undefined>)[k] = undefined;
    }
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (typeof v === "string") process.env[k] = v;
  }
  _resetEnvCacheForTests();
});

describe("env() — happy path", () => {
  it("returns a validated env when all required vars are set", () => {
    const e = env();
    expect(e.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(e.AI_PROVIDER).toBe("anthropic");
    expect(e.RETUNE_PERSIST).toBe("postgres"); // default
    expect(e.NEXT_PUBLIC_API_URL).toBe("http://localhost:8787"); // default
  });

  it("caches the result across calls", () => {
    const a = env();
    const b = env();
    expect(a).toBe(b);
  });

  it("flags helpers reflect env state", () => {
    expect(flags.isProduction).toBe(false);
    expect(flags.isDevelopment).toBe(true);
    expect(flags.sentryEnabled).toBe(false);
    expect(flags.postHogEnabled).toBe(false);
  });
});

describe("env() — missing required vars", () => {
  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    resetEnv({ ...VALID_BASE, NEXT_PUBLIC_SUPABASE_URL: undefined });
    expect(() => env()).toThrow(EnvValidationError);
    expect(() => env()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when JWT_SECRET is too short", () => {
    resetEnv({ ...VALID_BASE, JWT_SECRET: "too-short" });
    expect(() => env()).toThrow(/JWT_SECRET/);
  });

  it("throws when neither OpenAI nor Anthropic key is set", () => {
    resetEnv({ ...VALID_BASE, ANTHROPIC_API_KEY: undefined });
    expect(() => env()).toThrow(/OPENAI_API_KEY or ANTHROPIC_API_KEY/);
  });
});

describe("env() — cross-field invariants", () => {
  it("requires OPENAI_API_KEY when AI_PROVIDER=openai", () => {
    resetEnv({
      ...VALID_BASE,
      AI_PROVIDER: "openai",
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
    });
    expect(() => env()).toThrow(/OPENAI_API_KEY or ANTHROPIC_API_KEY/);
  });

  it("requires the matching provider key when AI_PROVIDER is set", () => {
    resetEnv({
      ...VALID_BASE,
      AI_PROVIDER: "openai",
      ANTHROPIC_API_KEY: "sk-ant-still-set-but-wrong-provider",
      OPENAI_API_KEY: undefined,
    });
    expect(() => env()).toThrow(/AI_PROVIDER=openai but OPENAI_API_KEY/);
  });
});

describe("env() — production hard-requires", () => {
  it("requires RETUNE_INTERNAL_API_KEY in production", () => {
    resetEnv({ ...VALID_BASE, NODE_ENV: "production" });
    expect(() => env()).toThrow(/RETUNE_INTERNAL_API_KEY/);
  });

  it("requires RETUNE_INTERNAL_GENERATION_ACCESS_SECRET in production", () => {
    resetEnv({
      ...VALID_BASE,
      NODE_ENV: "production",
      RETUNE_INTERNAL_API_KEY: "production-key-min-16-chars",
    });
    expect(() => env()).toThrow(/RETUNE_INTERNAL_GENERATION_ACCESS_SECRET/);
  });

  it("forbids E2E_AUTH_BYPASS in production", () => {
    resetEnv({
      ...VALID_BASE,
      NODE_ENV: "production",
      RETUNE_INTERNAL_API_KEY: "production-key-min-16-chars",
      RETUNE_INTERNAL_GENERATION_ACCESS_SECRET: "production-secret-min-16-chars",
      RETUNE_DATABASE_URL: "postgres://prod:prod@db.example.com/retune",
      E2E_AUTH_BYPASS: "1",
    });
    expect(() => env()).toThrow(/E2E_AUTH_BYPASS=1 must NEVER be enabled in production/);
  });

  it("requires RETUNE_DATABASE_URL when persist=postgres in production", () => {
    resetEnv({
      ...VALID_BASE,
      NODE_ENV: "production",
      RETUNE_INTERNAL_API_KEY: "production-key-min-16-chars",
      RETUNE_INTERNAL_GENERATION_ACCESS_SECRET: "production-secret-min-16-chars",
      RETUNE_PERSIST: "postgres",
    });
    expect(() => env()).toThrow(/RETUNE_PERSIST=postgres requires RETUNE_DATABASE_URL/);
  });
});

describe("requireEnv()", () => {
  it("returns the value when the var is set", () => {
    expect(requireEnv("JWT_SECRET")).toBe(VALID_BASE.JWT_SECRET);
  });

  it("throws when the var is unset", () => {
    expect(() => requireEnv("RETUNE_INTERNAL_API_KEY")).toThrow(
      /Required environment variable not set: RETUNE_INTERNAL_API_KEY/,
    );
  });
});
