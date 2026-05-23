/**
 * CSRF protection — HMAC-signed double-submit cookie pattern.
 *
 * Charter 01 Epic 05.
 *
 * Flow:
 *   1. On any GET/HEAD response from a session-bearing route, the
 *      server mints a token and sets it as a `csrf-token` cookie
 *      (httpOnly=false, sameSite=lax, secure in production).
 *   2. The client (Next.js form / fetch) reads `csrf-token` and copies
 *      it into the `x-csrf-token` request header on every state-mutating
 *      request (POST/PATCH/PUT/DELETE).
 *   3. The server validates that header matches the cookie AND that the
 *      HMAC signature on the token is valid.
 *
 * Token format:
 *   `${randomHex(16)}.${unixSeconds}.${hmacBase64Url(value+seconds)}`
 *
 * The HMAC step prevents an attacker who can inject a cookie via XSS
 * from also injecting a matching header (because the attacker doesn't
 * know JWT_SECRET).
 *
 * GET/HEAD/OPTIONS bypass validation. The Origin/Referer check in
 * `api-handler.ts:checkOrigin` is the orthogonal layer of defence.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

const CSRF_HEADER = "x-csrf-token";
export const CSRF_COOKIE = "csrf-token";

/** Token expires 24h after issue. Tokens auto-refresh on every GET. */
const TOKEN_TTL_SECONDS = 60 * 60 * 24;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set (>= 32 chars) for CSRF token signing");
  }
  return secret;
}

function sign(value: string, issuedAtSec: number): string {
  return createHmac("sha256", getSecret()).update(`${value}.${issuedAtSec}`).digest("base64url");
}

/**
 * Mint a fresh CSRF token. Format: `${random}.${issuedAt}.${signature}`.
 */
export function generateCSRFToken(): string {
  const value = randomBytes(16).toString("hex");
  const issuedAtSec = Math.floor(Date.now() / 1000);
  const sig = sign(value, issuedAtSec);
  return `${value}.${issuedAtSec}.${sig}`;
}

/**
 * Set the CSRF cookie on a response. Call this once per session start
 * (or on any GET response that doesn't already have a fresh cookie).
 *
 * `httpOnly: false` is intentional — JS must read it to copy into the
 * request header. Defence comes from the HMAC binding the value to the
 * server secret, not from cookie inaccessibility.
 */
export function setCSRFCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

/**
 * Validate the CSRF token on a state-mutating request. Returns true if
 * the request is safe to process; false if rejection is required.
 *
 * Accepts GET/HEAD/OPTIONS unconditionally (they shouldn't mutate).
 */
export function validateCSRFToken(request: NextRequest | Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const headerToken = request.headers.get(CSRF_HEADER);
  if (!headerToken) return false;

  // Cookie may live on Request (NextRequest) or be parsed from the
  // raw cookie header on a plain Request.
  let cookieToken: string | null = null;
  const maybeNextReq = request as NextRequest;
  if (typeof maybeNextReq.cookies?.get === "function") {
    cookieToken = maybeNextReq.cookies.get(CSRF_COOKIE)?.value ?? null;
  } else {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]+)`));
    cookieToken = match ? decodeURIComponent(match[1] ?? "") : null;
  }
  if (!cookieToken) return false;

  // Header and cookie must match (double-submit).
  if (headerToken !== cookieToken) return false;

  // HMAC must verify (this is what an XSS attacker can't forge).
  const parts = headerToken.split(".");
  if (parts.length !== 3) return false;
  const [value, issuedAtRaw, sig] = parts;
  const issuedAt = Number(issuedAtRaw);
  if (!value || !Number.isFinite(issuedAt) || !sig) return false;

  // TTL window
  const ageSec = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSec < 0 || ageSec > TOKEN_TTL_SECONDS) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(sign(value, issuedAt), "utf8");
  } catch {
    return false;
  }
  const actual = Buffer.from(sig, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
