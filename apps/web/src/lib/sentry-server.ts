/**
 * Sentry server-side init (Charter 05 Epic 03).
 *
 * Conditional: only activates when SENTRY_DSN is set. In dev/test
 * without a DSN, this module is a no-op so importing it is safe.
 *
 * Wire-up: import this from `instrumentation.ts` so Next.js calls it
 * once at server startup. The matching client init lives in
 * `sentry.client.config.ts` (created by `@sentry/wizard`).
 *
 * To enable in production:
 *   1. Create a Sentry project for `retune-web` (Next.js).
 *   2. Set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN` (client).
 *   3. Set `SENTRY_AUTH_TOKEN` in CI for source-map upload.
 *   4. Deploy.
 */

export async function initSentryServer(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    // Silently skip in dev / test / no-DSN environments.
    return;
  }

  // Lazy-import so bundlers that don't have @sentry/nextjs installed
  // don't crash. When you `pnpm add @sentry/nextjs`, this import
  // resolves and Sentry initialises.
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.0,
      enabled: process.env.NODE_ENV !== "test",
      ignoreErrors: [
        // Reduce noise — these are network-level expected
        "ResizeObserver loop limit exceeded",
        "Non-Error promise rejection captured",
      ],
      // biome-ignore lint/suspicious/noExplicitAny: @sentry/nextjs types unavailable until installed
      beforeSend(event: any) {
        // Strip cookies + auth headers from the event before send.
        if (event.request?.cookies) event.request.cookies = undefined;
        if (event.request?.headers) {
          for (const k of Object.keys(event.request.headers)) {
            if (/authorization|cookie|x-csrf|x-retune/i.test(k)) {
              event.request.headers[k] = "[redacted]";
            }
          }
        }
        return event;
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[sentry] @sentry/nextjs not installed — skipping init. Run `pnpm --filter @retune/web add @sentry/nextjs` to enable.",
      err instanceof Error ? err.message : err,
    );
  }
}

export const sentryEnabled = (): boolean => Boolean(process.env.SENTRY_DSN);
