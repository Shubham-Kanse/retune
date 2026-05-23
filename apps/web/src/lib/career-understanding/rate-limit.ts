/**
 * Career-understanding rate-limit adapter.
 *
 * Charter 01 Epic 03 (architect addendum): we consolidated all
 * rate-limit logic into `@/lib/rate-limit`. This file is now a thin
 * adapter so the existing call sites in:
 *   - apps/web/src/app/api/profile/understanding/apply/route.ts
 *   - apps/web/src/app/api/profile/understanding/feedback/route.ts
 *   - apps/web/src/app/api/profile/understanding/preview/route.ts
 * keep their named-params signature and `resetMs` return field.
 *
 * Do not add new rate-limit primitives here. New routes should import
 * `userRateLimit` directly from `@/lib/rate-limit`.
 */

import { _resetRateLimitForTests, userRateLimit as canonicalUserRateLimit } from "../rate-limit";

export function userRateLimit(params: {
  userId: string;
  route: string;
  limit: number;
  windowMs: number;
}): { success: boolean; remaining: number; resetMs: number } {
  const result = canonicalUserRateLimit(params.userId, params.route, params.limit, params.windowMs);
  const now = Date.now();
  return {
    success: result.success,
    remaining: result.remaining,
    resetMs: Math.max(0, result.resetAt - now),
  };
}

/** Test helper alias — clears the canonical store. */
export const _resetUserRateLimit = _resetRateLimitForTests;
