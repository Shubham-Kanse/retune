/**
 * Sentry init for `@retune/api` (Charter 05 Epic 03).
 *
 * Conditional: only activates when SENTRY_DSN is set. In dev/test
 * without a DSN, this module is a no-op.
 *
 * To enable:
 *   1. Create a Sentry project for `retune-api` (Node.js).
 *   2. Set `SENTRY_DSN`.
 *   3. `pnpm --filter @retune/api add @sentry/node`
 *   4. Wire `await initSentryNode()` at the top of `apps/api/src/main.ts`
 *      (before the Hono app is constructed).
 *   5. Deploy.
 */

export async function initSentryNode(): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.0,
      enabled: process.env.NODE_ENV !== "test",
      // biome-ignore lint/suspicious/noExplicitAny: ErrorEvent type from @sentry/node varies by minor version
      beforeSend(event: any) {
        // Strip cookies + sensitive headers
        const req = event?.request as
          | { cookies?: unknown; headers?: Record<string, string> }
          | undefined;
        if (req?.cookies) req.cookies = undefined;
        if (req?.headers) {
          for (const k of Object.keys(req.headers)) {
            if (/authorization|cookie|x-csrf|x-retune/i.test(k)) {
              req.headers[k] = "[redacted]";
            }
          }
        }
        return event;
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[sentry] @sentry/node not installed — skipping. Install with: pnpm --filter @retune/api add @sentry/node",
      err instanceof Error ? err.message : err,
    );
  }
}

export const sentryEnabled = (): boolean => Boolean(process.env.SENTRY_DSN);
