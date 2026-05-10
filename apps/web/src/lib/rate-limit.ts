import type { NextRequest } from "next/server";

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const store: RateLimitStore = {};

export function authRateLimit(request: NextRequest): { success: boolean } {
  return rateLimit(request, 10, 900000);
}

export function rateLimit(
  request: NextRequest,
  limit: number,
  windowMs = 60000,
): { success: boolean; remaining: number } {
  const ip =
    request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const key = `${ip}:${request.nextUrl.pathname}`;
  const now = Date.now();

  // Clean expired entries
  if (store[key] && now > store[key].resetTime) {
    delete store[key];
  }

  if (!store[key]) {
    store[key] = { count: 1, resetTime: now + windowMs };
    return { success: true, remaining: limit - 1 };
  }

  if (store[key].count >= limit) {
    return { success: false, remaining: 0 };
  }

  store[key].count++;
  return { success: true, remaining: limit - store[key].count };
}
