/**
 * Supabase JWT verification — dependency-free (node:crypto only).
 *
 * Lets the cognitive API authenticate end users directly from their
 * Supabase access token (`Authorization: Bearer <jwt>`) instead of
 * trusting an `x-retune-user-id` header. Two verification paths:
 *
 *   1. HS256 via `SUPABASE_JWT_SECRET` (legacy Supabase JWT secret).
 *   2. RS256 / ES256 via the project's JWKS endpoint
 *      (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`), cached in-process.
 *
 * Claims contract: `sub` must be a UUID (the Supabase user id), `exp`
 * must be in the future. `aud` is checked against "authenticated" when
 * present.
 */

import { createHmac, createPublicKey, verify as cryptoVerify, timingSafeEqual } from "node:crypto";

export interface SupabaseJwtClaims {
  sub: string;
  exp: number;
  aud?: string | string[];
  role?: string;
  email?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  [key: string]: unknown;
}

let jwksCache: { keys: Jwk[]; fetched_at: number } | null = null;

/** Test seam — reset the JWKS cache between tests. */
export function __resetJwksCache(): void {
  jwksCache = null;
}

function b64urlJson<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function supabaseUrl(): string | null {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
}

/** True when at least one verification path is configured. */
export function supabaseJwtConfigured(): boolean {
  return Boolean(process.env.SUPABASE_JWT_SECRET || supabaseUrl());
}

async function fetchJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetched_at < JWKS_CACHE_TTL_MS) {
    return jwksCache.keys;
  }
  const base = supabaseUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return jwksCache?.keys ?? [];
    const body = (await res.json()) as { keys?: Jwk[] };
    jwksCache = { keys: body.keys ?? [], fetched_at: now };
    return jwksCache.keys;
  } catch {
    // Network failure — serve stale cache if we have one.
    return jwksCache?.keys ?? [];
  }
}

function verifyHs256(signingInput: string, signature: Buffer, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(signingInput).digest();
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}

function verifyAsymmetric(alg: string, jwk: Jwk, signingInput: string, signature: Buffer): boolean {
  try {
    const key = createPublicKey({
      key: jwk as unknown as import("node:crypto").JsonWebKey,
      format: "jwk",
    });
    if (alg === "RS256") {
      return cryptoVerify("RSA-SHA256", Buffer.from(signingInput), key, signature);
    }
    if (alg === "ES256") {
      return cryptoVerify(
        "sha256",
        Buffer.from(signingInput),
        { key, dsaEncoding: "ieee-p1363" },
        signature,
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Verify a Supabase access token. Returns the claims on success, null on
 * any failure (malformed, bad signature, expired, non-UUID subject).
 */
export async function verifySupabaseJwt(token: string): Promise<SupabaseJwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const header = b64urlJson<{ alg?: string; kid?: string }>(headerB64);
  const claims = b64urlJson<SupabaseJwtClaims>(payloadB64);
  if (!header?.alg || !claims) return null;

  let signature: Buffer;
  try {
    signature = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  const signingInput = `${headerB64}.${payloadB64}`;

  let ok = false;
  if (header.alg === "HS256") {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) return null;
    ok = verifyHs256(signingInput, signature, secret);
  } else if (header.alg === "RS256" || header.alg === "ES256") {
    const keys = await fetchJwks();
    const candidates = header.kid ? keys.filter((k) => k.kid === header.kid) : keys;
    ok = candidates.some((jwk) =>
      verifyAsymmetric(header.alg as string, jwk, signingInput, signature),
    );
  } else {
    // Unknown / "none" algorithms are always rejected.
    return null;
  }
  if (!ok) return null;

  // Temporal + audience claims.
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
  if (claims.aud !== undefined) {
    const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!auds.includes("authenticated")) return null;
  }
  if (typeof claims.sub !== "string" || !UUID_RE.test(claims.sub)) return null;

  return claims;
}
