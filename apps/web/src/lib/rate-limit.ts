/**
 * Canonical rate limiter for `apps/web`.
 *
 * Charter 01 Epic 03 (architect addendum): consolidates the four
 * historical rate-limit implementations into a single module.
 *
 * Pluggable strategies:
 *   - `rateLimit(req, limit, windowMs)`           — IP+path bucket
 *   - `userRateLimit(userId, key, limit, windowMs)` — per-user+endpoint bucket
 *   - `authRateLimit(req)`                        — strict 10 / 15 min for auth routes
 *
 * In-memory only — process-local. For multi-instance deployment, swap
 * `store` for a Redis-backed implementation (Charter 04 Epic 04 supplies
 * Redis when the TraceBus durability work lands).
 *
 * Module side-effect: a single `setInterval` cleanup task. Use
 * `_resetRateLimitForTests()` in test setup to clear state between cases
 * and `_stopRateLimitCleanupForTests()` to halt the interval (otherwise
 * vitest hangs waiting for it).
 */

import type { NextRequest } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

function checkBucket(
  key: string,
  limit: number,
  windowMs: number,
): {
  success: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const existing = store.get(key);
  if (!existing || now > existing.resetAt) {
    const fresh: Bucket = { count: 1, resetAt: now + windowMs };
    store.set(key, fresh);
    return { success: true, remaining: limit - 1, resetAt: fresh.resetAt };
  }
  existing.count += 1;
  const success = existing.count <= limit;
  return {
    success,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

/**
 * IP+path rate limit. Used by `withAuth`/`withErrorHandling` wrappers
 * to throttle anonymous traffic.
 *
 * Defaults: 60 / 60s per (IP, pathname).
 */
export function rateLimit(
  request: NextRequest,
  limit = 60,
  windowMs = 60_000,
): { success: boolean; remaining: number } {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const key = `ip:${ip}:${request.nextUrl.pathname}`;
  const result = checkBucket(key, limit, windowMs);
  return { success: result.success, remaining: result.remaining };
}

/**
 * Per-user+endpoint rate limit. Used inside route handlers where the
 * caller's identity is known (e.g. AI generation endpoints, refinement
 * endpoints).
 *
 * Defaults: 10 / 60s per (user, endpoint).
 */
export function userRateLimit(
  userId: string,
  endpoint: string,
  limit = 10,
  windowMs = 60_000,
): { success: boolean; remaining: number; resetAt: number } {
  const key = `user:${userId}:${endpoint}`;
  return checkBucket(key, limit, windowMs);
}

/**
 * Auth-route specific limit (strict). 10 attempts per 15-minute window
 * per IP+path. Use on `/api/auth/login`, `/api/auth/signup`,
 * `/api/auth/forgot-password`, `/api/auth/reset-password`.
 */
export function authRateLimit(request: NextRequest): { success: boolean } {
  const result = rateLimit(request, 10, 15 * 60_000);
  return { success: result.success };
}

/**
 * Cleanup task. Removes expired buckets every 5 minutes.
 * In production this prevents unbounded memory growth.
 *
 * In tests, call `_stopRateLimitCleanupForTests()` to halt the timer
 * (Node's process won't exit otherwise).
 */
let _cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupRunning(): void {
  if (_cleanupTimer) return;
  if (process.env.NODE_ENV === "test") return; // tests can opt in via _startRateLimitCleanupForTests
  _cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of store.entries()) {
      if (now > bucket.resetAt) store.delete(key);
    }
  }, 5 * 60_000);
  // Don't keep Node alive just for cleanup
  _cleanupTimer.unref?.();
}

ensureCleanupRunning();

/** Test-only: clear all buckets between cases. */
export function _resetRateLimitForTests(): void {
  store.clear();
}

/** Test-only: stop the cleanup interval. */
export function _stopRateLimitCleanupForTests(): void {
  if (_cleanupTimer) {
    clearInterval(_cleanupTimer);
    _cleanupTimer = null;
  }
}
