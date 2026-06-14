/**
 * Unified request identity for the cognitive API.
 *
 * Every privileged route attaches `requireIdentity()` as inline
 * middleware and reads the caller via `getIdentity(c)`. Three
 * authentication paths, checked in order:
 *
 *   1. `Authorization: Bearer <supabase-jwt>` — verified cryptographically
 *      (see supabase-jwt.ts). This is the public-API / browser path.
 *   2. `x-retune-internal-key` + `x-retune-user-id` — server-to-server
 *      path from apps/web route handlers (which already verified the
 *      Supabase session). See internal-auth.ts.
 *   3. Dev fallback — when NO credential mechanism is configured and we
 *      are not in production, the durability default user is assumed.
 *      Ownership checks are not enforced on this path (`enforced: false`)
 *      so local dev and the test suite keep working.
 *
 * In production a request that matches none of the above is rejected
 * with 401 and a security-audit event.
 */

import type { Context, MiddlewareHandler } from "hono";
import { resolveAuthenticatedIdentity } from "./internal-auth";
import { recordSecurityEvent } from "./security-audit";
import { supabaseJwtConfigured, verifySupabaseJwt } from "./supabase-jwt";

export type AuthMethod = "supabase_jwt" | "internal_key" | "dev_fallback";

export interface ApiIdentity {
  user_id: string;
  method: AuthMethod;
  /**
   * True when the identity came from a real credential. Ownership checks
   * MUST be applied when true; the dev fallback leaves it false so
   * unauthenticated local flows keep working.
   */
  enforced: boolean;
}

declare module "hono" {
  interface ContextVariableMap {
    identity: ApiIdentity;
  }
}

export function getIdentity(c: Context): ApiIdentity {
  const identity = c.get("identity");
  if (!identity) {
    // Programming error: a route read identity without requireIdentity().
    throw new Error("getIdentity() called on a route without requireIdentity middleware");
  }
  return identity;
}

const FALLBACK_USER_ID = "00000000-0000-4000-8000-000000000000";

async function defaultUserId(): Promise<string> {
  try {
    const { acquire_durability } = await import("../runtime/persistence-factory");
    const durability = await acquire_durability();
    return durability?.default_user_id ?? FALLBACK_USER_ID;
  } catch {
    return FALLBACK_USER_ID;
  }
}

function audit(c: Context, route: string, error: string): void {
  void recordSecurityEvent({
    event_type: "api.auth.rejected",
    actor_kind: "anonymous",
    request_id: c.var.requestId,
    ip: c.req.header("x-forwarded-for") ?? null,
    user_agent: c.req.header("user-agent") ?? null,
    outcome: "denied",
    metadata: { route, error },
  });
}

/**
 * Inline route middleware. Usage:
 *
 *   app.get("/applications", requireIdentity(), async (c) => {
 *     const identity = getIdentity(c);
 *     ...
 *   });
 */
export function requireIdentity(): MiddlewareHandler {
  return async (c, next) => {
    const route = `${c.req.method} ${c.req.path}`;

    // Path 1 — Supabase JWT. An explicit Bearer token that fails
    // verification is always a hard 401 (never falls through).
    const authz = c.req.header("authorization");
    if (authz?.startsWith("Bearer ")) {
      if (!supabaseJwtConfigured()) {
        audit(c, route, "jwt_verification_not_configured");
        return c.json({ error: "jwt_verification_not_configured" }, 401);
      }
      const claims = await verifySupabaseJwt(authz.slice("Bearer ".length));
      if (!claims) {
        audit(c, route, "invalid_token");
        return c.json({ error: "invalid_token" }, 401);
      }
      c.set("identity", { user_id: claims.sub, method: "supabase_jwt", enforced: true });
      await next();
      return;
    }

    // Path 2 + 3 — internal key, or dev fallback when no key configured.
    const auth = resolveAuthenticatedIdentity(c.req.raw.headers, await defaultUserId());
    if ("error" in auth) {
      audit(c, route, auth.error);
      return c.json({ error: auth.error }, auth.status as 400 | 401);
    }

    const viaKey = auth.identity.authenticated_via_internal_key;
    if (!viaKey && process.env.NODE_ENV === "production") {
      // Production must never run on the trust-the-header fallback.
      audit(c, route, "unauthenticated");
      return c.json({ error: "unauthenticated" }, 401);
    }

    c.set("identity", {
      user_id: auth.identity.user_id,
      method: viaKey ? "internal_key" : "dev_fallback",
      enforced: viaKey,
    });
    await next();
    return;
  };
}

/**
 * Ownership predicate shared by routes: with a real credential the row
 * must belong to the caller; on the dev fallback everything is visible
 * (matches pre-existing dev semantics).
 */
export function ownsRow(identity: ApiIdentity, rowUserId: string | null | undefined): boolean {
  if (!identity.enforced) return true;
  return rowUserId === identity.user_id;
}
