/**
 * Internal API auth (003 §12 + OWASP A01).
 *
 * The cognitive API (`apps/api`) sits behind the web app (`apps/web`).
 * Requests originate from the authenticated Next.js route handlers
 * which already verify the user's Supabase session. To prevent direct
 * spoofing of the API by a third party, every privileged route checks
 * a shared secret header.
 *
 * Header contract:
 *
 *   x-retune-internal-key: <RETUNE_INTERNAL_API_KEY>
 *   x-retune-user-id:      <session.userId>
 *
 * If `RETUNE_INTERNAL_API_KEY` is unset (dev mode), the API falls back
 * to the durability default user. Production deployments MUST set the
 * key.
 *
 * The user id MUST be a UUID — we reject anything else to prevent
 * header injection of crafted ids.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthenticatedIdentity {
  user_id: string;
  /** True when the caller authenticated via the internal API key. */
  authenticated_via_internal_key: boolean;
}

export function resolveAuthenticatedIdentity(
  headers: Headers | Record<string, string | undefined>,
  defaultUserId: string,
): { identity: AuthenticatedIdentity } | { error: string; status: number } {
  const internalKey = process.env.RETUNE_INTERNAL_API_KEY;
  const headerKey = readHeader(headers, "x-retune-internal-key");
  const headerUid = readHeader(headers, "x-retune-user-id");

  if (!internalKey) {
    // Dev mode: no key configured, accept anonymous calls and use the
    // durability default user. Never enabled in production.
    if (headerUid && UUID_RE.test(headerUid)) {
      return {
        identity: {
          user_id: headerUid,
          authenticated_via_internal_key: false,
        },
      };
    }
    return {
      identity: {
        user_id: defaultUserId,
        authenticated_via_internal_key: false,
      },
    };
  }

  // Production mode: require the key.
  if (!headerKey) return { error: "missing_internal_key", status: 401 };
  if (!constantTimeEq(headerKey, internalKey)) {
    return { error: "invalid_internal_key", status: 401 };
  }
  if (!headerUid) return { error: "missing_user_id", status: 401 };
  if (!UUID_RE.test(headerUid)) return { error: "invalid_user_id", status: 400 };

  return {
    identity: {
      user_id: headerUid,
      authenticated_via_internal_key: true,
    },
  };
}

function readHeader(
  headers: Headers | Record<string, string | undefined>,
  name: string,
): string | null {
  if (headers instanceof Headers) {
    return headers.get(name) ?? null;
  }
  const v = headers[name] ?? headers[name.toLowerCase()];
  return v ?? null;
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Constant-time-equivalent: hash both and compare to avoid leaking length.
    const ha = createHmac("sha256", "retune-internal-key").update(a).digest();
    const hb = createHmac("sha256", "retune-internal-key").update(b).digest();
    return timingSafeEqual(ha, hb);
  }
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return timingSafeEqual(ba, bb);
}
