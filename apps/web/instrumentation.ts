/**
 * Next.js instrumentation hook (Charter 05 Epic 03).
 *
 * Next 13.4+ calls `register()` once on server startup. This is the
 * correct place to bootstrap any process-wide observability that needs
 * to run before HTTP routing begins (Sentry, OTEL, etc.).
 *
 * Each init function is conditional on its respective env var, so this
 * file is a no-op in dev / test / no-DSN environments.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register(): Promise<void> {
  // Charter 20 Epic 02 — validate env vars at startup so production
  // boot fails-fast on missing/malformed configuration instead of
  // surfacing as cryptic runtime errors. Lazy-imported so this hook
  // doesn't pull the Zod schema into the edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("./src/lib/env");
    env();
  }

  // Sentry — server-side error capture for the Next.js process.
  // Skips silently when SENTRY_DSN is unset.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initSentryServer } = await import("./src/lib/sentry-server");
    await initSentryServer();
  }
}
