/**
 * Per-user, per-route rate limiter used by the career-understanding routes.
 *
 * The default `rateLimit` helper keys by IP + path which is fine for most
 * routes but lets a single shared NAT exhaust the budget for everyone
 * behind it. For AI-cost-bearing routes we need a per-user budget.
 */

interface Bucket {
  count: number;
  resetTime: number;
}

const store: Record<string, Bucket> = {};

export function userRateLimit(params: {
  userId: string;
  route: string;
  limit: number;
  windowMs: number;
}): { success: boolean; remaining: number; resetMs: number } {
  const key = `${params.userId}:${params.route}`;
  const now = Date.now();
  const bucket = store[key];
  if (bucket && now > bucket.resetTime) {
    delete store[key];
  }
  const cur = store[key];
  if (!cur) {
    store[key] = { count: 1, resetTime: now + params.windowMs };
    return { success: true, remaining: params.limit - 1, resetMs: params.windowMs };
  }
  if (cur.count >= params.limit) {
    return { success: false, remaining: 0, resetMs: cur.resetTime - now };
  }
  cur.count++;
  return { success: true, remaining: params.limit - cur.count, resetMs: cur.resetTime - now };
}

/** Test-only — flush the in-memory store. */
export function _resetUserRateLimit(): void {
  for (const k of Object.keys(store)) delete store[k];
}
