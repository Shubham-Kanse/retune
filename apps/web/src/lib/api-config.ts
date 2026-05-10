/**
 * Single source of truth for the URL of the cognitive API service
 * (`apps/api`, Hono on port 8787 by default).
 *
 * Use `apiUrl()` for absolute URLs (e.g. SSE EventSource targets that
 * cannot benefit from the Next.js dev rewrite proxy) and `apiPath()`
 * for relative paths (e.g. browser fetch calls that should pass through
 * the Next.js process so cookies/CORS are not an issue).
 *
 * Server side and client side both honor `NEXT_PUBLIC_API_URL`. The
 * default tracks `apps/api/src/main.ts`'s default port (8787).
 */

const DEFAULT_API_URL = "http://localhost:8787";

export function apiUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
  if (!path) return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export const API_BASE_URL = apiUrl();
